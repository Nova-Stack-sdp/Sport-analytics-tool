import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const USER_PREFERENCES_UPDATED_EVENT = 'f1-analytics-user-preferences-updated';
export const NEWS_FILTERS = ['for-you', 'latest', 'drivers', 'teams', 'races'];

function preferencesStorageKey(userId) {
  return `f1-news-preferences:${userId}`;
}

function cleanIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}

export function defaultUserPreferences(user) {
  return {
    displayName: user?.displayName || '',
    followedDriverIds: [],
    followedTeamIds: [],
    followedRaceIds: [],
    defaultNewsFilter: 'for-you',
  };
}

export function normalizeUserPreferences(value, user) {
  const fallback = defaultUserPreferences(user);
  return {
    displayName: typeof value?.displayName === 'string'
      ? value.displayName.trim()
      : fallback.displayName,
    followedDriverIds: cleanIds(value?.followedDriverIds),
    followedTeamIds: cleanIds(value?.followedTeamIds),
    followedRaceIds: cleanIds(value?.followedRaceIds),
    defaultNewsFilter: NEWS_FILTERS.includes(value?.defaultNewsFilter)
      ? value.defaultNewsFilter
      : fallback.defaultNewsFilter,
  };
}

export function readCachedUserPreferences(user) {
  const fallback = defaultUserPreferences(user);
  if (!user?.uid || typeof window === 'undefined') return fallback;

  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesStorageKey(user.uid)) || '{}');
    return normalizeUserPreferences({ ...fallback, ...saved }, user);
  } catch {
    return fallback;
  }
}

function cacheUserPreferences(userId, preferences) {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(preferencesStorageKey(userId), JSON.stringify({
    ...preferences,
    updatedAt: new Date().toISOString(),
  }));
  window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, {
    detail: { userId },
  }));
}

export async function loadUserPreferences(user) {
  const cached = readCachedUserPreferences(user);
  if (!user?.uid || user.isDemo) {
    return { ...cached, storage: 'browser', syncError: '' };
  }

  try {
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    if (!snapshot.exists()) {
      return { ...cached, storage: 'browser', syncError: '' };
    }

    const preferences = normalizeUserPreferences({ ...cached, ...snapshot.data() }, user);
    cacheUserPreferences(user.uid, preferences);
    return { ...preferences, storage: 'cloud', syncError: '' };
  } catch {
    return {
      ...cached,
      storage: 'browser',
      syncError: 'Firestore could not be reached. Using the preferences saved in this browser.',
    };
  }
}

export async function saveUserPreferences(user, value) {
  if (!user?.uid) throw new Error('A signed-in user is required to save preferences.');

  const preferences = normalizeUserPreferences(value, user);
  cacheUserPreferences(user.uid, preferences);

  if (user.isDemo) return { ...preferences, storage: 'browser' };

  await setDoc(doc(db, 'users', user.uid), {
    ...preferences,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { ...preferences, storage: 'cloud' };
}

export function subscribeToUserPreferences(userId, callback) {
  if (!userId || typeof window === 'undefined') return () => {};

  const handleUpdate = (event) => {
    if (!event.detail?.userId || event.detail.userId === userId) callback();
  };
  const handleStorage = (event) => {
    if (event.key === preferencesStorageKey(userId)) callback();
  };

  window.addEventListener(USER_PREFERENCES_UPDATED_EVENT, handleUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(USER_PREFERENCES_UPDATED_EVENT, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}
