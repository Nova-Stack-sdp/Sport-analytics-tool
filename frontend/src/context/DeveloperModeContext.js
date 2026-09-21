import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const DeveloperModeContext = createContext({
  isDeveloperMode: false,
  setDeveloperMode: () => {},
});

// Developer mode is a per-account preference: "is this logged-in user
// currently acting as a developer". It is NOT the same thing as being
// granted the developer role — the role model (who is allowed to submit
// derived stats, and how that is enforced server-side) is a teammate's
// scope and will eventually be wired through Firebase custom claims
// alongside the admin role.
//
// Until that lands, this flag is stored client-side, scoped to the
// signed-in user's uid so it doesn't leak across accounts on a shared
// browser (same pattern the theme toggle already uses for its own
// localStorage key). This is intentionally a stopgap: swapping this for
// a server-verified claim later only touches this file and does not
// change how RequireAuth or the pages consume `isDeveloperMode`.
function storageKeyFor(uid) {
  return `f1-analytics-developer-mode:${uid}`;
}

export function DeveloperModeProvider({ children }) {
  const { user } = useAuth();
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  // Re-read the flag whenever the signed-in user changes (sign-in,
  // sign-out, switching accounts).
  useEffect(() => {
    if (!user) {
      setIsDeveloperMode(false);
      return;
    }
    const stored = localStorage.getItem(storageKeyFor(user.uid));
    setIsDeveloperMode(stored === 'true');
  }, [user]);

  const setDeveloperMode = (nextValue) => {
    setIsDeveloperMode(nextValue);
    if (user) {
      localStorage.setItem(storageKeyFor(user.uid), nextValue ? 'true' : 'false');
    }
  };

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, setDeveloperMode }}>
      {children}
    </DeveloperModeContext.Provider>
  );
}

export function useDeveloperMode() {
  return useContext(DeveloperModeContext);
}