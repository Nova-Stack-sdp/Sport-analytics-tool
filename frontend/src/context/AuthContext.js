import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getSession } from '../api/client';

const AuthContext = createContext({
  user: null,
  loading: true,
  isDeveloperMode: false,
  refreshDeveloperMode: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // The `developer` Firebase custom claim, read out of the signed-in
  // user's ID token. This is the account-level source of truth for
  // developer mode — set once via POST /api/auth/developer-mode, it
  // then travels with the account to any device/browser that signs in,
  // unlike the old localStorage-only version of this flag.
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  // Immediately clear the user from context — used by the sign-out
  // handler so the UI updates before the async Firebase/backend
  // calls complete.
  const signOut = () => {
    setUser(null);
    setIsDeveloperMode(false);
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

  useEffect(() => {
    // Firebase persists the session itself (localStorage by default), so
    // this fires immediately with the restored user on page load, then
    // again on every sign-in/sign-out.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Firebase knows about this user — use them directly.  The
        // httpOnly cookie should already exist from the sign-in flow
        // (SignInPage / SignUpPage calls establishSession after auth).
        setUser(firebaseUser);
        const tokenResult = await firebaseUser.getIdTokenResult();
        setIsDeveloperMode(tokenResult.claims.developer === true);
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
      } catch {
        // No valid cookie either — genuinely not authenticated.
        setUser(null);
        setIsDeveloperMode(false);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isDeveloperMode, refreshDeveloperMode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}