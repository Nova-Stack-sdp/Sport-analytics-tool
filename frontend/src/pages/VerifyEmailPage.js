import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import '../styles/auth.css';

// Used when the backend doesn't say how long to wait (it always does on the
// cooldown response, but the button must stay honest if that ever changes).
const RESEND_FALLBACK_SECONDS = 60;

// The backend is the one counting wrong guesses, so for CODE_MISMATCH its own
// sentence is shown — it carries the tries left. Everything else gets a line
// from here, because the status codes would read as jargon.
const CONFIRM_MESSAGES = {
  INVALID_FORMAT: 'Enter the 6-digit code from the email.',
  NO_ACTIVE_CODE: 'No code is waiting. Ask for a new one.',
  CODE_EXPIRED: 'That code has expired. Ask for a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong guesses. Ask for a new one.',
};

function sendErrorMessage(body) {
  switch (body?.code) {
    case 'DAILY_LIMIT':
      return 'You have asked for too many codes in the last 24 hours. Try again later.';
    case 'NO_EMAIL':
      return 'This account has no email address to verify.';
    default:
      return "We couldn't send the code just now. Please try again.";
  }
}

function confirmErrorMessage(error) {
  const body = error.body || {};
  if (body.code === 'CODE_MISMATCH') return body.error || 'That code is not correct.';
  return CONFIRM_MESSAGES[body.code] || body.error || 'Something went wrong checking that code. Try again.';
}

// Where the code is typed, and the only screen that works before the address
// is verified: RequireAuth sends every other guarded route here, and the
// backend's requireVerifiedEmail answers 403 EMAIL_NOT_VERIFIED to anything
// that slips past it. A code is mailed on arrival, so signing up ends with
// the user reading their inbox rather than hunting for a "send" button.
function VerifyEmailPage() {
  const { user, loading, emailVerified, requestEmailCode, confirmEmailCode } = useAuth();
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const startPage = preferences.startPage;

  const [sendStatus, setSendStatus] = useState('idle'); // idle | sending | sent | error
  const [sendError, setSendError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [codeError, setCodeError] = useState('');
  // The redirect below fires on this OR on the context's flag: the local one is
  // this page's own "done", the context one covers arriving here again after a
  // reload — neither alone is enough.
  const [verified, setVerified] = useState(false);
  // StrictMode runs effects twice in development; one code per visit is enough.
  const autoSent = useRef(false);

  const sendCode = useCallback(async () => {
    setSendStatus('sending');
    setSendError('');
    try {
      const result = await requestEmailCode();
      if (result?.status === 'already-verified') {
        // Verified in another tab since this page mounted.
        navigate(startPage, { replace: true });
        return;
      }
      setDevCode(result?.devCode || '');
      setCooldown(result?.resendAfterSeconds ?? RESEND_FALLBACK_SECONDS);
      setSendStatus('sent');
    } catch (error) {
      const body = error.body || {};
      if (body.code === 'RESEND_COOLDOWN') {
        // Not a failure from where the user sits: the code sent a moment ago
        // is still valid. Show the sent state and let the timer run down.
        setCooldown(body.retryAfterSeconds ?? RESEND_FALLBACK_SECONDS);
        setSendStatus('sent');
        return;
      }
      setSendStatus('error');
      setSendError(sendErrorMessage(body));
    }
  }, [requestEmailCode, navigate, startPage]);

  useEffect(() => {
    if (loading || !user || emailVerified) return;
    if (autoSent.current) return;
    autoSent.current = true;
    sendCode();
  }, [loading, user, emailVerified, sendCode]);

  // One timeout per tick rather than an interval: the countdown can also be
  // set from a response (a fresh cooldown, or the one the backend reports when
  // it refuses a resend), and a chain always ends up following the latest value.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const submitted = code.trim();
    if (!/^\d{6}$/.test(submitted)) {
      setCodeError('Enter the 6-digit code from the email.');
      return;
    }

    setSubmitting(true);
    setCodeError('');
    try {
      // Adopts the fresh token in AuthContext too (see confirmEmailCode) — the
      // claim lives in the token, and every gated request reads it from there.
      await confirmEmailCode(submitted);
      setVerified(true);
    } catch (error) {
      setSubmitting(false);
      setCodeError(confirmErrorMessage(error));
    }
  };

  if (loading) {
    return <div className="page secondary">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }
  if (emailVerified || verified) {
    return <Navigate to={startPage} replace />;
  }

  const isSending = sendStatus === 'sending';
  const isSent = sendStatus === 'sent';
  const resendBlocked = isSending || cooldown > 0;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span aria-hidden="true" className="auth-scan" />

        <section className="auth-welcome">
          <figure className="auth-icon" aria-hidden="true">
            <svg className="auth-icon-svg" viewBox="0 0 24 24">
              <path d="M3 6h18v12H3z" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </figure>
          <h1>
            One last <strong className="accent">check</strong>
          </h1>
        </section>

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
            {isSent ? (
              <>
                Enter the code we sent to <b>{user.email}</b>.
              </>
            ) : (
              <>
                We'll send a code to <b>{user.email}</b>.
              </>
            )}
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              <span className="auth-label">Verification code</span>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="auth-code-input"
                value={code}
                disabled={submitting}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? 'verify-code-error' : undefined}
              />
              {codeError && (
                <span className="auth-field-error" id="verify-code-error">
                  {codeError}
                </span>
              )}
            </label>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Checking…' : 'Verify email'}
            </button>
          </form>

          <div className="auth-resend">
            <span>
              {isSending
                ? 'Sending…'
                : cooldown > 0
                  ? `You can ask for a new code in ${cooldown}s`
                  : isSent
                    ? 'Nothing arrived?'
                    : 'Need a code?'}
            </span>
            <button type="button" onClick={sendCode} disabled={resendBlocked}>
              Send a new code
            </button>
          </div>

          {devCode && (
            // The backend only includes this while EMAIL_PROVIDER=console and
            // NODE_ENV isn't production — there is no inbox to read locally.
            <p className="auth-devcode" role="status">
              Dev only — console mail provider sent code <b>{devCode}</b> (also in the backend log).
            </p>
          )}

          {sendStatus === 'error' && (
            <p className="auth-message is-error" role="alert">
              {sendError}
            </p>
          )}

          <p className="auth-switch">
            Wrong account? <Link to="/sign-in">Sign in with another</Link>
          </p>
        </section>
      </section>
    </main>
  );
}

export default VerifyEmailPage;
