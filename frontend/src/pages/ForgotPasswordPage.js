import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import '../styles/auth.css';

function friendlyAuthError(error) {
  switch (error.code) {
    case 'auth/invalid-email':
      return 'Enter a valid email.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a bit.';
    default:
      // Deliberately not distinguishing "user not found" here — confirming
      // whether an email has an account is an account-enumeration risk.
      return null;
  }
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | sent | error
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;

    setStatus('submitting');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus('sent');
    } catch (error) {
      const friendly = friendlyAuthError(error);
      if (friendly) {
        setStatus('error');
        setMessage(friendly);
      } else {
        // Show the same "sent" state whether or not the account exists,
        // so this can't be used to enumerate registered emails.
        setStatus('sent');
      }
    }
  };

  const isSubmitting = status === 'submitting';

  return (
    <main className="page">
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
            Reset your <strong className="accent">password</strong>
          </h1>
          <p>We'll send a reset link to your email if there's an account attached to it.</p>
        </section>

        <section className="auth-panel">
          <header className="auth-statusbar">
            <span className="auth-live">
              <span className="auth-live-dot" aria-hidden="true" />
              Live
            </span>
            <span className="auth-terminal-label">Access terminal</span>
          </header>

          <h2>Forgot password</h2>
          <p className="auth-subtitle">Enter the email you sign in with.</p>

          {status === 'sent' ? (
            <p className="auth-message" role="status">
              If an account exists for <b>{email}</b>, a password reset link is on its way.
            </p>
          ) : (
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
                />
              </label>

              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          {status === 'error' && (
            <p className="auth-message is-error" role="alert">
              {message}
            </p>
          )}

          <p className="auth-switch">
            <Link to="/sign-in">Back to sign in</Link>
          </p>
        </section>
      </section>
    </main>
  );
}

export default ForgotPasswordPage;