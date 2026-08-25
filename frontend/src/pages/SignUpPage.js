import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/authClient';
import { useAuth } from '../context/AuthContext';
import '../styles/auth.css';

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function friendlyAuthError(error) {
  switch (error.code || error.message) {
    case 'account-exists':
    case 'An account with that email already exists':
      return 'An account with that email already exists. Try signing in instead.';
    case 'weak-password':
    case 'A valid email and password of at least 8 characters are required':
      return 'Choose a stronger password (at least 6 characters).';
    case 'invalid-email':
      return 'Enter a valid email.';
    default:
      return 'Something went wrong creating your account. Try again.';
  }
}

function SignUpPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | error
  const [message, setMessage] = useState('');

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setStatus('submitting');
    setMessage('');
    try {
      await register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      });
      await refreshUser();
      navigate('/overview', { replace: true });
    } catch (error) {
      setStatus('error');
      setMessage(friendlyAuthError(error));
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

        <section className="auth-panel">
          <header className="auth-statusbar">
            <span className="auth-live">
              <span className="auth-live-dot" aria-hidden="true" />
              Live
            </span>
            <span className="auth-terminal-label">Access terminal</span>
          </header>

          <h2>Create an account</h2>
          <p className="auth-subtitle">Fill in your details below to get started.</p>

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

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                disabled={isSubmitting}
                onChange={updateField('password')}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined}
              />
              {fieldErrors.password && (
                <span className="auth-field-error" id="signup-password-error">
                  {fieldErrors.password}
                </span>
              )}
            </label>

            <label className="auth-field">
              <span className="auth-label">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                disabled={isSubmitting}
                onChange={updateField('confirmPassword')}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'signup-confirm-error' : undefined}
              />
              {fieldErrors.confirmPassword && (
                <span className="auth-field-error" id="signup-confirm-error">
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </label>

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
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
      </section>
    </main>
  );
}

export default SignUpPage;