// Site preferences — the small "how should the site behave for me" choices
// on Profile → Settings. Saved in this browser (localStorage), like the
// profile name and photo; nothing here is sent to the backend.
//
// Every value is checked against its list of allowed options when read, so
// a hand-edited or out-of-date saved value falls back to the default instead
// of breaking the page.

export const PREFERENCES_STORAGE_KEY = 'f1-analytics-preferences';
// The theme used to be saved on its own under this key (by App.js). It's
// still read once as the starting theme so nobody's choice is lost.
export const LEGACY_THEME_STORAGE_KEY = 'f1-analytics-theme';

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 16, 60];

export const START_PAGES = [
  { value: '/overview', label: 'Overview' },
  { value: '/telemetry-tv', label: 'Telemetry TV' },
  { value: '/fixtures', label: 'Fixtures & Events' },
  { value: '/statistics', label: 'Statistics' },
  { value: '/replay', label: 'Race Replay' },
  { value: '/profile', label: 'Profile' },
];

export const PREFERENCE_OPTIONS = {
  theme: ['dark', 'light', 'system'],
  density: ['comfortable', 'compact'],
  reduceMotion: [false, true],
  replaySpeed: REPLAY_SPEEDS,
  replayShowSafetyCar: [true, false],
  clock: ['auto', '24h', '12h'],
  timeZone: ['local', 'utc'],
  startPage: START_PAGES.map((page) => page.value),
};

export const DEFAULT_PREFERENCES = {
  theme: 'dark',
  density: 'comfortable',
  reduceMotion: false,
  replaySpeed: 1,
  replayShowSafetyCar: true,
  clock: 'auto',
  timeZone: 'local',
  startPage: '/overview',
};

const CHANGE_EVENT = 'f1-analytics-preferences-change';

function sanitize(raw) {
  const clean = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== 'object') return clean;
  Object.keys(DEFAULT_PREFERENCES).forEach((key) => {
    if (PREFERENCE_OPTIONS[key].includes(raw[key])) clean[key] = raw[key];
  });
  return clean;
}

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, etc.) — use defaults
  }
}

export function readPreferences() {
  const saved = safeGet(PREFERENCES_STORAGE_KEY);
  if (saved) {
    try {
      return sanitize(JSON.parse(saved));
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }
  const legacyTheme = safeGet(LEGACY_THEME_STORAGE_KEY);
  return sanitize({ theme: legacyTheme });
}

// Merges `changes` into the saved preferences and returns the result.
// Throws if the browser refuses to store it, so the caller can say so.
export function savePreferences(changes) {
  const next = sanitize({ ...readPreferences(), ...changes });
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
}

export function resetPreferences() {
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // nothing saved we could clear — defaults apply either way
  }
  const next = { ...DEFAULT_PREFERENCES };
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  return next;
}

// Calls `listener` whenever preferences change — in this tab (via
// savePreferences/resetPreferences) or in another tab (storage event).
export function subscribeToPreferences(listener) {
  const handleLocal = () => listener(readPreferences());
  const handleStorage = (event) => {
    if (event.key === null || event.key === PREFERENCES_STORAGE_KEY) listener(readPreferences());
  };
  window.addEventListener(CHANGE_EVENT, handleLocal);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleLocal);
    window.removeEventListener('storage', handleStorage);
  };
}

// 'system' follows the operating system's light/dark setting.
export function resolveTheme(theme, systemPrefersDark) {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}
