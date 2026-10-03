import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  loadUserPreferences,
  readCachedUserPreferences,
  saveUserPreferences,
  syncFollowPreference,
} from './userPreferences';

jest.mock('../firebase', () => ({ db: { name: 'test-db' } }));
jest.mock('firebase/firestore', () => ({
  arrayRemove: jest.fn((value) => ({ remove: value })),
  arrayUnion: jest.fn((value) => ({ add: value })),
  doc: jest.fn(() => ({ path: 'users/user-1' })),
  getDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIME'),
  setDoc: jest.fn(),
}));

const user = { uid: 'user-1', displayName: 'Alex' };

describe('userPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
    doc.mockImplementation(() => ({ path: 'users/user-1' }));
    arrayRemove.mockImplementation((value) => ({ remove: value }));
    arrayUnion.mockImplementation((value) => ({ add: value }));
    serverTimestamp.mockImplementation(() => 'SERVER_TIME');
    setDoc.mockResolvedValue();
  });

  test('loads Firestore preferences and caches them in the browser', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: 'Cloud Alex',
        followedDriverIds: ['driver-1'],
        followedTeamIds: ['team-1'],
        followedRaceIds: ['race-1'],
        defaultNewsFilter: 'teams',
      }),
    });

    const result = await loadUserPreferences(user);

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-1');
    expect(result).toEqual(expect.objectContaining({
      displayName: 'Cloud Alex',
      followedDriverIds: ['driver-1'],
      storage: 'cloud',
    }));
    expect(readCachedUserPreferences(user)).toEqual(expect.objectContaining({
      followedTeamIds: ['team-1'],
    }));
  });

  test('creates or updates users/{uid} with a server timestamp', async () => {
    setDoc.mockResolvedValue();

    await saveUserPreferences(user, {
      displayName: 'Alex Driver',
      followedDriverIds: ['driver-1', 'driver-1'],
      followedTeamIds: ['team-1'],
      followedRaceIds: [],
      defaultNewsFilter: 'for-you',
    });

    expect(serverTimestamp).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({
        displayName: 'Alex Driver',
        followedDriverIds: ['driver-1'],
        updatedAt: 'SERVER_TIME',
      }),
      { merge: true }
    );
  });

  test('mirrors driver follows and unfollows to the Firestore preference array', async () => {
    await syncFollowPreference('user-1', 'driver', 'driver-1', true);
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({ followedDriverIds: { add: 'driver-1' } }),
      { merge: true }
    );
    expect(readCachedUserPreferences(user).followedDriverIds).toEqual(['driver-1']);

    await syncFollowPreference('user-1', 'driver', 'driver-1', false);
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({ followedDriverIds: { remove: 'driver-1' } }),
      { merge: true }
    );
    expect(readCachedUserPreferences(user).followedDriverIds).toEqual([]);
  });
});
