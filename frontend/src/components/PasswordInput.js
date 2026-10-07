import { useState } from 'react';

// Eye / eye-with-slash pair (feather-style strokes) for the show/hide control.
// Slash version while the password is visible — the usual convention: the icon
// shows what clicking will do next.
function EyeIcon({ slashed }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {slashed ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/**
 * Password field with a show/hide eye, matching the auth pages' `.auth-field`
 * markup (label span + input + inline error) so pages swap their hand-rolled
 * blocks for this without any layout change.
 *
 * The toggle is a real button: keyboard-reachable, pressed state carried by
 * aria-pressed, and named "Show password" / "Hide password" for screen
 * readers. Pages keep the input's id/name/error id so labelling and error
 * wiring stay identical to the fields this replaces.
 */
function PasswordInput({
  label,
  id,
  name,
  value,
  onChange,
  error,
  errorId,
  disabled = false,
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="auth-field">
      <span className="auth-label">{label}</span>
      <span className="auth-input-wrap">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
        >
          <EyeIcon slashed={visible} />
        </button>
      </span>
      {error && (
        <span className="auth-field-error" id={errorId}>
          {error}
        </span>
      )}
    </label>
  );
}

export default PasswordInput;
