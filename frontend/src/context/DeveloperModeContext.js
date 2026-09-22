import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { auth } from '../firebase';
import { setDeveloperModeOnServer } from '../api/client';

const DeveloperModeContext = createContext({
  isDeveloperMode: false,
  setDeveloperMode: async () => {},
});

// Developer mode used to be a localStorage-only preference. It's now a
// Firebase custom claim on the account (see AuthContext, which owns
// reading it off the ID token) — this provider just adapts that into the
// same { isDeveloperMode, setDeveloperMode } shape every consumer
// (RequireAuth, DeveloperPage, SettingsPage, TopNavigation) already
// expects, so none of them needed to change.
export function DeveloperModeProvider({ children }) {
  const { isDeveloperMode, refreshDeveloperMode } = useAuth();

  const setDeveloperMode = async (nextValue) => {
    // When there's a live Firebase session in this tab, attach its ID
    // token explicitly rather than relying solely on the httpOnly cookie
    // — see the comment on setDeveloperModeOnServer for why. If there's
    // no live session (cookie-restored user), idToken is undefined and
    // the request falls back to the cookie alone, same as before.
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : undefined;
    await setDeveloperModeOnServer(nextValue, idToken);
    // The claim doesn't exist in any token we're already holding — pull a
    // freshly-issued one so the UI reflects it immediately.
    await refreshDeveloperMode();
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