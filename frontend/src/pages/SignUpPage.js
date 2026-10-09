import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { confirmSignup, establishSession, requestSignupCode } from '../api/client';
import { usePreferences } from '../context/PreferencesContext';
import PasswordInput from '../components/PasswordInput';
import '../styles/auth.css';

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

// Used when the backend doesn't say how long to wait (it always does on the
// cooldown response, but the button must stay honest if that ever changes).
const RESEND_FALLBACK_SECONDS = 60;

/** "ana@example.com" -> "an***@example.com" — a local stand-in for the
 * backend's mask, used when a cooldown refusal arrives before any response
 * could carry the masked form. */
function maskEmail(value) {
  const at = value.indexOf('@');
  if (at <= 0) return value ? `${value.slice(0, 1)}***` : '';
  const local = value.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${value.slice(at)}`;
}

// Send-stage failures. Whether the address already has an account is not
// knowable from here — the backend answers identically either way — so
// every message is about the request itself, never about the account.
function sendErrorMessage(body) {
  switch (body?.code) {
    case 'DAILY_LIMIT':
      return 'You have asked for too many codes in the last 24 hours. Try again later.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email.';
    default:
      return "We couldn't send the code just now. Please try again.";
  }
}

// Confirm-stage failures. By this point the caller has read the code out of
// the address's inbox, so naming an existing account is help, not a leak.
const CONFIRM_MESSAGES = {
  INVALID_FORMAT: 'Enter the 6-digit code from the email.',
  NO_PENDING_SIGNUP: 'No sign-up is waiting for this email. Ask for a new code.',
  CODE_EXPIRED: 'That code has expired. Ask for a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong guesses. Ask for a new one.',
  WEAK_PASSWORD: 'Choose a password with at least 8 characters.',
  EMAIL_EXISTS: 'An account with this email already exists. Sign in instead.',
};

function confirmErrorMessage(error) {
  const body = error.body || {};
  if (body.code === 'CODE_MISMATCH') return body.error || 'That code is not correct.';
  return CONFIRM_MESSAGES[body.code] || "We couldn't create your account. Please try again.";
}

// Two stages: 'form' collects the details, 'code' waits for the code mailed
// to the address — and the account is created by the backend only when that
// code checks out. Nothing exists before then: no Firebase user, no profile.
// The password stays in this component's memory between the stages; it is
// sent exactly once, with the confirm, and never stored server-side.
function SignUpPage() {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const startPage = preferences.startPage;

  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [message, setMessage] = useState('');

  const [stage, setStage] = useState('form');
  const [emailMasked, setEmailMasked] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [creating, setCreating] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // One timeout per tick rather than an interval: the countdown can also be
  // set from a response (a fresh cooldown, or the one the backend reports
  // when it refuses a resend), and a chain always follows the latest value.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const validate = () => {
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = 'Enter your first name';
    if (!form.lastName.trim()) errors.lastName = 'Enter your last name';
    if (!form.email.trim()) errors.email = 'Enter your email';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email';
    if (!form.password) errors.password = 'Choose a password';
    else if (form.password.length < 8) errors.password = 'At least 8 characters';
    if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords don't match";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit the details: this asks the backend to mail a code — it does NOT
  // create the account. No createUserWithEmailAndPassword anywhere on this
  // page: the account is born at the confirm below, after the code proves
  // the address.
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setStatus('submitting');
    setMessage('');
    try {
      const result = await requestSignupCode(form.email);
      setEmailMasked(result?.email || maskEmail(form.email.trim().toLowerCase()));
      setDevCode(result?.devCode || '');
      setCooldown(result?.resendAfterSeconds ?? RESEND_FALLBACK_SECONDS);
      setStatus('idle');
      setStage('code');
    } catch (error) {
      const body = error.body || {};
      if (body.code === 'RESEND_COOLDOWN') {
        // Not a failure from where the user sits: the code sent a moment
        // ago is still waiting — show the code step and let the timer run.
        setEmailMasked(maskEmail(form.email.trim().toLowerCase()));
        setCooldown(body.retryAfterSeconds ?? RESEND_FALLBACK_SECONDS);
        setStatus('idle');
        setStage('code');
        return;
      }
      setStatus('error');
      setMessage(sendErrorMessage(body));
    }
  };

  const handleBackToForm = () => {
    setStage('form');
    setCode('');
    setCodeError('');
    setDevCode('');
    setCooldown(0);
    setMessage('');
    setStatus('idle');
  };

  const handleResend = async () => {
    setResending(true);
    setCodeError('');
    try {
      const result = await requestSignupCode(form.email);
      setDevCode(result?.devCode || '');
      setCooldown(result?.resendAfterSeconds ?? RESEND_FALLBACK_SECONDS);
    } catch (error) {
      const body = error.body || {};
      if (body.code === 'RESEND_COOLDOWN') {
        setCooldown(body.retryAfterSeconds ?? RESEND_FALLBACK_SECONDS);
      } else {
        setCodeError(sendErrorMessage(body));
      }
    } finally {
      setResending(false);
    }
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    const submitted = code.trim();
    if (!/^\d{6}$/.test(submitted)) {
      setCodeError('Enter the 6-digit code from the email.');
      return;
    }

    setCreating(true);
    setCodeError('');
    try {
      // The account is created by the backend right here — code check first,
      // Admin createUser second — so it arrives already verified and this
      // page never sets foot in the /verify-email flow.
      await confirmSignup({
        email: form.email,
        code: submitted,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      });
    } catch (error) {
      setCreating(false);
      setCodeError(confirmErrorMessage(error));
      return;
    }

    // The account now exists. The password from the form is the only copy in
    // hand — sign in with it and establish the backend session, just like a
    // normal sign-in. If the sign-in leg fails (offline, say) the account is
    // still real and the credentials are valid, so the sign-in page is the
    // honest recovery.
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password);
    } catch {
      navigate('/sign-in', { replace: true });
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      await establishSession(idToken);
    } catch {
      // Best effort, same as the sign-in page: every API request also
      // carries a fresh Bearer token (see api/client.js), so a missed
      // cookie re-establishes itself on the next sign-in.
    }
    navigate(startPage, { replace: true });
  };

  const isSubmitting = status === 'submitting';
  const resendBlocked = resending || cooldown > 0;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span aria-hidden="true" className="auth-scan" />

        <section className="auth-welcome">
          <figure className="auth-icon" aria-hidden="true">
            <svg className="auth-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              <path d="M18 4v4M16 6h4" />
            </svg>
          </figure>
          <h1>
            Join <strong className="accent">NovaStack-F1</strong>
          </h1>
          <p>Create an account to start entering session data and strategy calls.</p>

          <figure className="auth-telemetry" aria-hidden="true">
            <div className="auth-telemetry-bars">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} style={{ height: `${28 + ((i * 7) % 26)}%` }} />
              ))}
            </div>
            <figcaption className="auth-telemetry-label">Lap telemetry</figcaption>
          </figure>
        </section>

        {stage === 'code' ? (
          <section className="auth-panel">
            <header className="auth-statusbar">
              <span className="auth-live">
                <span className="auth-live-dot" aria-hidden="true" />
                Live
              </span>
              <span className="auth-terminal-label">Access terminal</span>
            </header>

            <h2>Verify your email</h2>
            <p className="auth-subtitle">
              Enter the code we sent to <b>{emailMasked}</b>. Your account is created once it checks
              out.
            </p>

            <form className="auth-form" onSubmit={handleConfirm} noValidate>
              <label className="auth-field">
                <span className="auth-label">Verification code</span>
                <input
                  id="signup-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="auth-code-input"
                  value={code}
                  disabled={creating}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  aria-invalid={Boolean(codeError)}
                  aria-describedby={codeError ? 'signup-code-error' : undefined}
                />
                {codeError && (
                  <span className="auth-field-error" id="signup-code-error">
                    {codeError}
                  </span>
                )}
              </label>

              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating account…' : 'Verify and create account'}
              </button>
            </form>

            <div className="auth-resend">
              <span>
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `You can ask for a new code in ${cooldown}s`
                    : 'Nothing arrived?'}
              </span>
              <button type="button" onClick={handleResend} disabled={resendBlocked}>
                Send a new code
              </button>
            </div>

            <div className="auth-resend">
              <span>Wrong details?</span>
              <button type="button" onClick={handleBackToForm} disabled={creating}>
                Edit and try again
              </button>
            </div>

            {devCode && (
              // The backend only includes this while EMAIL_PROVIDER=console
              // and NODE_ENV isn't production — there is no inbox to read
              // locally.
              <p className="auth-devcode" role="status">
                Dev only — console mail provider sent code <b>{devCode}</b> (also in the backend
                log).
              </p>
            )}

            <p className="auth-switch">
              Already have an account? <Link to="/sign-in">Sign in instead</Link>
            </p>
          </section>
        ) : (
          <section className="auth-panel">
            <header className="auth-statusbar">
              <span className="auth-live">
                <span className="auth-live-dot" aria-hidden="true" />
                Live
              </span>
              <span className="auth-terminal-label">Access terminal</span>
            </header>

            <h2>Create an account</h2>
            <p className="auth-subtitle">
              Fill in your details — we'll email a code to confirm your address before the account
              is created.
            </p>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="auth-row">
                <label className="auth-field">
                  <span className="auth-label">First name</span>
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={form.firstName}
                    disabled={isSubmitting}
                    onChange={updateField('firstName')}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    aria-describedby={fieldErrors.firstName ? 'signup-firstname-error' : undefined}
                  />
                  {fieldErrors.firstName && (
                    <span className="auth-field-error" id="signup-firstname-error">
                      {fieldErrors.firstName}
                    </span>
                  )}
                </label>

                <label className="auth-field">
                  <span className="auth-label">Last name</span>
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={form.lastName}
                    disabled={isSubmitting}
                    onChange={updateField('lastName')}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    aria-describedby={fieldErrors.lastName ? 'signup-lastname-error' : undefined}
                  />
                  {fieldErrors.lastName && (
                    <span className="auth-field-error" id="signup-lastname-error">
                      {fieldErrors.lastName}
                    </span>
                  )}
                </label>
              </div>

              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  disabled={isSubmitting}
                  onChange={updateField('email')}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
                />
                {fieldErrors.email && (
                  <span className="auth-field-error" id="signup-email-error">
                    {fieldErrors.email}
                  </span>
                )}
              </label>

              <PasswordInput
                label="Password"
                autoComplete="new-password"
                value={form.password}
                disabled={isSubmitting}
                onChange={updateField('password')}
                error={fieldErrors.password}
                errorId="signup-password-error"
              />

              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                value={form.confirmPassword}
                disabled={isSubmitting}
                onChange={updateField('confirmPassword')}
                error={fieldErrors.confirmPassword}
                errorId="signup-confirm-error"
              />

              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Sending code…' : 'Create account'}
              </button>
            </form>

            {status === 'error' && (
              <p className="auth-message is-error" role="alert">
                {message}
              </p>
            )}

            <p className="auth-switch">
              Already have an account? <Link to="/sign-in">Sign in instead</Link>
            </p>
          </section>
        )}
      </section>
    </main>
  );
}

export default SignUpPage;
