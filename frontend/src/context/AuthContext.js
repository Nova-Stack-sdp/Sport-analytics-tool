import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  confirmEmailVerificationCode,
  deleteAccount as deleteAccountRequest,
  establishSession,
  getSession,
  requestEmailVerificationCode,
} from '../api/client';

const AuthContext = createContext({
  user: null,
  loading: true,
  isDeveloperMode: false,
  isAdmin: false,
  emailVerified: false,
  refreshDeveloperMode: async () => {},
  requestEmailCode: async () => {},
  confirmEmailCode: async () => {},
  deleteAccount: async () => {},
  signOut: () => {},
});

const LOCAL_PROFILE_PREVIEW_USER = {
  uid: 'local-profile-preview',
  email: 'preview@local.test',
  displayName: 'Demo F1 Fan',
  emailVerified: true,
  isDemo: true,
  providerData: [{ providerId: 'local-preview' }],
  metadata: { creationTime: new Date().toISOString() },
};

function isLocalProfilePreview() {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const previewRequested = new URLSearchParams(window.location.search).get('preview') === '1';
  if (!isLocalhost) return false;
  if (previewRequested) window.sessionStorage.setItem('f1-local-profile-preview', '1');
  return previewRequested || window.sessionStorage.getItem('f1-local-profile-preview') === '1';
}

// Admin status is decided by the backend (the ADMIN_UIDS allowlist — see
// backend/src/lib/adminAccess.js), so ask it. Any failure (backend down,
// no session yet) simply means "not an admin" — the safe default.
async function fetchIsAdmin(firebaseUser) {
  try {
    const idToken = firebaseUser?.getIdToken ? await firebaseUser.getIdToken() : undefined;
    const sessionUser = await getSession(idToken);
    return sessionUser?.admin === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const localProfilePreview = isLocalProfilePreview();
  const [user, setUser] = useState(localProfilePreview ? LOCAL_PROFILE_PREVIEW_USER : null);
  const [loading, setLoading] = useState(!localProfilePreview);
  // The `developer` Firebase custom claim, read out of the signed-in
  // user's ID token. This is the account-level source of truth for
  // developer mode — set once via POST /api/auth/developer-mode, it
  // then travels with the account to any device/browser that signs in,
  // unlike the old localStorage-only version of this flag.
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  // Whether this user is on the backend's admin list. Resolved before
  // `loading` clears, so an /admin guard never redirects an admin away
  // just because the check hadn't come back yet.
  const [isAdmin, setIsAdmin] = useState(false);
  // Whether the account's email address has been proved with a 6-digit code
  // (see backend/src/routes/emailVerification.js). Taken from the
  // `email_verified` claim rather than firebaseUser.emailVerified, because
  // the claim is exactly what the backend's requireVerifiedEmail gate reads.
  // The local profile preview stands in for a fully set-up account.
  const [emailVerified, setEmailVerified] = useState(localProfilePreview);

  // Immediately clear the user from context — used by the sign-out
  // handler so the UI updates before the async Firebase/backend
  // calls complete.
  const signOut = () => {
    setUser(null);
    setIsDeveloperMode(false);
    setIsAdmin(false);
    setEmailVerified(false);
    setLoading(false);
  };

  // Re-reads the developer claim from a fresh token. Call this right
  // after toggling developer mode on the backend — custom claims only
  // show up in a token that's issued/refreshed AFTER the claim was set,
  // and Firebase won't do that on its own for up to an hour, so we force
  // it here instead of waiting.
  const refreshDeveloperMode = useCallback(async () => {
    if (auth.currentUser) {
      const tokenResult = await auth.currentUser.getIdTokenResult(/* forceRefresh */ true);
      setIsDeveloperMode(tokenResult.claims.developer === true);
      return;
    }
    // No live Firebase session in this tab (e.g. restored purely from the
    // httpOnly cookie) — ask the backend instead, which decodes the same
    // claim out of the cookie's token.
    try {
      const sessionUser = await getSession();
      setIsDeveloperMode(sessionUser.developer === true);
    } catch {
      setIsDeveloperMode(false);
    }
  }, []);

  // The `email_verified` claim only appears in a token minted AFTER the
  // backend flips it, and the httpOnly cookie still holds the pre-verification
  // token — so refresh both, otherwise the very next gated request would
  // bounce the user straight back to the verify page.
  const adoptVerifiedEmail = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    try {
      await firebaseUser.reload();
      const freshToken = await firebaseUser.getIdToken(/* forceRefresh */ true);
      await establishSession(freshToken);
    } catch {
      // Best effort: the account is verified server-side either way, and the
      // next forced refresh picks the claim up.
    }
  }, []);

  // Ask the backend to mail a code. The response carries the masked address,
  // the resend timer and — console provider only — the code itself, so the
  // verify page can show all three.
  const requestEmailCode = useCallback(async () => {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
    return requestEmailVerificationCode(idToken);
  }, []);

  // Submit the code the user typed. Throws when it is wrong, expired or
  // spent — callers map error.body.code to a message.
  const confirmEmailCode = useCallback(
    async (code) => {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
      const result = await confirmEmailVerificationCode(code, idToken);
      await adoptVerifiedEmail();
      setEmailVerified(true);
      return result;
    },
    [adoptVerifiedEmail]
  );

  // Permanently delete the account — the "Delete profile" button under
  // Profile. The backend removes the database rows, the Firestore mirror
  // and the Firebase user itself, so a resolved promise means the account
  // no longer exists anywhere. Throws when the backend refuses; in that
  // case nothing local changes and the caller shows the error.
  const deleteAccount = useCallback(async () => {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
    await deleteAccountRequest(idToken);
    // The Firebase account is gone, so there is no session left to end —
    // but the SDK still holds the stale user in local persistence (and on
    // the next page load it would try to refresh a token for a deleted
    // account), so clear it. Best effort either way.
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore — local context state is cleared below regardless.
    }
    signOut();
  }, []);

  useEffect(() => {
    // A localhost-only profile preview lets the page be reviewed without
    // creating or signing into a Firebase account. Production builds can
    // never activate this path.
    if (localProfilePreview) return undefined;

    // Firebase persists the session itself (localStorage by default), so
    // this fires immediately with the restored user on page load, then
    // again on every sign-in/sign-out.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Firebase knows about this user — use them directly.  The
        // httpOnly cookie should already exist from the sign-in flow
        // (SignInPage / SignUpPage calls establishSession after auth).
        setUser(firebaseUser);
        const [tokenResult, admin] = await Promise.all([
          firebaseUser.getIdTokenResult(),
          fetchIsAdmin(firebaseUser),
        ]);
        setIsDeveloperMode(tokenResult.claims.developer === true);
        setIsAdmin(admin);
        setEmailVerified(tokenResult.claims.email_verified === true);
        setLoading(false);
        return;
      }

      // Firebase reports no user — check whether the backend still has
      // a valid httpOnly cookie (e.g. the Firebase localStorage was
      // cleared but the cookie survived, or the page reloaded before
      // Firebase's persistence kicked in).
      try {
        const sessionUser = await getSession();
        // Build a minimal user-like object so downstream components
        // that read user.email / user.uid keep working.
        setUser({ uid: sessionUser.uid, email: sessionUser.email });
        setIsDeveloperMode(sessionUser.developer === true);
        setIsAdmin(sessionUser.admin === true);
        setEmailVerified(sessionUser.emailVerified === true);
      } catch {
        // No valid cookie either — genuinely not authenticated.
        setUser(null);
        setIsDeveloperMode(false);
        setIsAdmin(false);
        setEmailVerified(false);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [localProfilePreview]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDeveloperMode,
        isAdmin,
        emailVerified,
        refreshDeveloperMode,
        requestEmailCode,
        confirmEmailCode,
        deleteAccount,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
