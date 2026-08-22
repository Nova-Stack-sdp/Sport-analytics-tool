import React from 'react';

/**
 * Shown whenever the backend reports approvalStatus === 'pending' — right
 * after a manual sign-up, and again on every sign-in attempt (Google or
 * email/password) until an admin approves the account.
 */
export function ApprovalPending({ email, onBackToSignIn }) {
  return (
    <section className="auth-pending" aria-live="polite">
      <span className="auth-pending-icon" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h2 className="auth-pending-title">Awaiting approval</h2>
      <p className="auth-pending-body">
        {email ? (
          <>
            We&rsquo;ve got <strong>{email}</strong> on file.{' '}
          </>
        ) : null}
        An admin needs to approve your account before you can access the pit wall. Try signing in again once that&rsquo;s happened.
      </p>
      {onBackToSignIn && (
        <button type="button" className="auth-link-button" onClick={onBackToSignIn}>
          Back to sign in
        </button>
      )}
    </section>
  );
}