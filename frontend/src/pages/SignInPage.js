import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../firebase';
import '../styles/auth.css';

function friendlyAuthError(error) {
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a bit.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/popup-closed-by-user':
      return null; // they just closed the popup, nothing to show
    default:
      return 'Something went wrong signing in. Try again.';
  }
}

function GoogleIcon() {
  return (
    <svg className="google-icon-svg" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="github-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [message, setMessage] = useState('');

  const handleGoogleSignIn = async () => {
    setStatus('submitting');
    setMessage('');
    try {
      // Also creates the account automatically if this Google user is new —
      // that's why sign-up doesn't need its own Google button.
      await signInWithPopup(auth, googleProvider);
      navigate('/overview', { replace: true });
    } catch (error) {
      const friendly = friendlyAuthError(error);
      if (friendly) {
        setStatus('error');
        setMessage(friendly);
      } else {
        setStatus('idle');
      }
    }
  };

  const handleGithubSignIn = async () => {
    setStatus('submitting');
    setMessage('');
    try {
      // Also creates the account automatically if this GitHub user is new.
      await signInWithPopup(auth, githubProvider);
      navigate('/overview', { replace: true });
    } catch (error) {
      const friendly = friendlyAuthError(error);
      if (friendly) {
        setStatus('error');
        setMessage(friendly);
      } else {
        setStatus('idle');
      }
    }
  };

  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = 'Enter your email';
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email';
    if (!password) errors.password = 'Enter your password';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setStatus('submitting');
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/overview', { replace: true });
    } catch (error) {
      setStatus('error');
      setMessage(friendlyAuthError(error) ?? 'Something went wrong signing in. Try again.');
    }
  };

  const isSubmitting = status === 'submitting';

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span aria-hidden="true" className="auth-scan" />

        <section className="auth-welcome">
          <figure className="auth-icon" aria-hidden="true">
            <svg className="auth-icon-svg" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
          </figure>
          <h1>
            Welcome to <strong className="accent">NovaStack-F1</strong>
          </h1>
          <p>Sign in to enter session data, timing sheets, and strategy calls for the team.</p>

          <figure className="auth-telemetry" aria-hidden="true">
            <div className="auth-telemetry-bars">
              {Array.from({ length: 12 }).map((_, i) => (
                <span key={i} style={{ height: `${28 + ((i * 7) % 26)}%` }} />
              ))}
            </div>
            <figcaption className="auth-telemetry-label">Lap telemetry</figcaption>
          </figure>
        </section>

        <section className="auth-panel">
          <header className="auth-statusbar">
            <span className="auth-live">
              <span className="auth-live-dot" aria-hidden="true" />
              Live
            </span>
            <span className="auth-terminal-label">Access terminal</span>
          </header>

          <h2>Sign in</h2>
          <p className="auth-subtitle">Enter your details below, or continue with Google.</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={isSubmitting}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined}
              />
              {fieldErrors.email && (
                <span className="auth-field-error" id="signin-email-error">
                  {fieldErrors.email}
                </span>
              )}
            </label>

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={isSubmitting}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined}
              />
              {fieldErrors.password && (
                <span className="auth-field-error" id="signin-password-error">
                  {fieldErrors.password}
                </span>
              )}
            </label>

            <Link className="auth-forgot" to="/forgot-password">
              Forgot password?
            </Link>

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Continue'}
            </button>
          </form>

          <p className="signin-divider">or</p>

          <button
            type="button"
            className="btn btn-google"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <button
            type="button"
            className="btn btn-github"
            onClick={handleGithubSignIn}
            disabled={isSubmitting}
          >
            <GithubIcon />
            Continue with GitHub
          </button>

          {status === 'error' && (
            <p className="auth-message is-error" role="alert">
              {message}
            </p>
          )}

          <p className="auth-switch">
            New to NovaStack-F1? <Link to="/sign-up">Create an account</Link>
          </p>
        </section>
      </section>
    </main>
  );
}

export default SignInPage;