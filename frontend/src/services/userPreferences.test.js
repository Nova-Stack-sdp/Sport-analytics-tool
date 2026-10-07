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
  arrayRemove: jest.fn((...values) => ({ remove: values })),
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
    arrayRemove.mockImplementation((...values) => ({ remove: values }));
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

  test('mirrors follows and removes source and canonical aliases on unfollow', async () => {
    await syncFollowPreference('user-1', 'driver', 'norris', true, { name: 'Lando Norris' });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({ followedDriverIds: { add: 'norris' } }),
      { merge: true }
    );
    expect(readCachedUserPreferences(user).followedDriverIds).toEqual(['norris']);

    window.localStorage.setItem('f1-news-preferences:user-1', JSON.stringify({
      followedDriverIds: ['norris', 'driver-lando-norris'],
    }));

    await syncFollowPreference('user-1', 'driver', 'norris', false, { name: 'Lando Norris' });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({
        followedDriverIds: { remove: ['norris', 'driver-lando-norris'] },
      }),
      { merge: true }
    );
    expect(readCachedUserPreferences(user).followedDriverIds).toEqual([]);

    window.localStorage.setItem('f1-news-preferences:user-1', JSON.stringify({
      followedTeamIds: ['mclaren', 'team-mclaren'],
    }));

    await syncFollowPreference('user-1', 'team', 'mclaren', false, { name: 'McLaren' });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-1' },
      expect.objectContaining({
        followedTeamIds: { remove: ['mclaren', 'team-mclaren'] },
      }),
      { merge: true }
    );
    expect(readCachedUserPreferences(user).followedTeamIds).toEqual([]);
  });
});
