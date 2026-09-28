import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  readPreferences,
  resetPreferences as resetStoredPreferences,
  resolveTheme,
  savePreferences,
  subscribeToPreferences,
} from '../services/preferences';
import { createDateTimeFormatters } from '../utils/dateTime';

const noop = () => {};

// The default value is what a component sees when it's rendered without the
// provider (e.g. a page rendered on its own in a unit test): plain defaults,
// so behaviour matches the site's out-of-the-box settings.
const PreferencesContext = createContext({
  preferences: DEFAULT_PREFERENCES,
  resolvedTheme: DEFAULT_PREFERENCES.theme,
  updatePreference: noop,
  resetPreferences: noop,
});

function systemPrefersDark() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // Keep in sync with changes made in other tabs.
  useEffect(() => subscribeToPreferences(setPreferences), []);

  // Only matters while the theme is set to "Match system".
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setPrefersDark(event.matches);
    query.addEventListener?.('change', handleChange);
    return () => query.removeEventListener?.('change', handleChange);
  }, []);

  const updatePreference = useCallback((key, value) => {
    // Update the screen first; saving can fail (storage full/blocked) and
    // the choice should still apply for this visit.
    setPreferences((current) => ({ ...current, [key]: value }));
    try {
      setPreferences(savePreferences({ [key]: value }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(resetStoredPreferences());
  }, []);

  const value = useMemo(() => ({
    preferences,
    resolvedTheme: resolveTheme(preferences.theme, prefersDark),
    updatePreference,
    resetPreferences,
  }), [preferences, prefersDark, updatePreference, resetPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

// Date/time formatters that follow the clock (12h/24h) and time zone
// (local/UTC) settings.
export function useDateTimeFormat() {
  const { preferences } = usePreferences();
  return useMemo(
    () => createDateTimeFormatters(preferences),
    [preferences]
  );
}
