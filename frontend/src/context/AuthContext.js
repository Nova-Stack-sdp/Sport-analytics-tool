import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getSession } from '../api/client';

const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      } catch {
        // No valid cookie either — genuinely not authenticated.
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
