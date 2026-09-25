export const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PROFILE_UPDATED_EVENT = 'f1-analytics-profile-updated';

function profileStorageKey(userId) {
  return `f1-analytics-profile:${userId}`;
}

function defaultProfile(user) {
  return {
    displayName: user?.displayName || '',
    photoDataUrl: user?.photoURL || '',
  };
}

export function readLocalProfile(user) {
  const fallback = defaultProfile(user);
  if (!user?.uid || typeof window === 'undefined') return fallback;

  try {
    const saved = JSON.parse(window.localStorage.getItem(profileStorageKey(user.uid)) || '{}');
    return {
      displayName: typeof saved.displayName === 'string' ? saved.displayName : fallback.displayName,
      photoDataUrl: typeof saved.photoDataUrl === 'string' ? saved.photoDataUrl : fallback.photoDataUrl,
    };
  } catch {
    return fallback;
  }
}

export function saveLocalProfile(user, profile) {
  if (!user?.uid) throw new Error('A signed-in user is required to save a profile.');

  const saved = {
    displayName: profile.displayName,
    photoDataUrl: profile.photoDataUrl || '',
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(profileStorageKey(user.uid), JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, {
    detail: { userId: user.uid },
  }));
  return saved;
}

export function subscribeToLocalProfile(userId, callback) {
  if (!userId || typeof window === 'undefined') return () => {};

  const handleProfileUpdate = (event) => {
    if (!event.detail?.userId || event.detail.userId === userId) callback();
  };
  const handleStorage = (event) => {
    if (event.key === profileStorageKey(userId)) callback();
  };

  window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}

export function validateProfileImage(file) {
  if (!file) return 'Choose an image first.';
  if (!PROFILE_IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG, or WebP image.';
  if (file.size > MAX_PROFILE_IMAGE_BYTES) return 'Profile pictures must be 1 MB or smaller.';
  return null;
}

export function profileImageToDataUrl(file) {
  const validationError = validateProfileImage(file);
  if (validationError) return Promise.reject(new Error(validationError));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The selected picture could not be read.'));
    reader.readAsDataURL(file);
  });
}
