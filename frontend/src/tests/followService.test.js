import {
  followDriver,
  isFollowingDriver,
  loadFollows,
  readFollows,
  resetFollowCache,
  unfollowDriver,
} from '../services/followService';
import * as api from '../api/client';
import { syncFollowPreference } from '../services/userPreferences';

jest.mock('../api/client', () => ({
  getFollows: jest.fn(),
  followDriverRequest: jest.fn(),
  unfollowDriverRequest: jest.fn(),
  followTeamRequest: jest.fn(),
  unfollowTeamRequest: jest.fn(),
}));
jest.mock('../services/userPreferences', () => ({
  syncFollowPreference: jest.fn().mockResolvedValue({ storage: 'cloud' }),
}));

const driver = { id: 'd1', name: 'Kimi Antonelli' };

describe('followService', () => {
  beforeEach(() => {
    resetFollowCache();
    window.localStorage.clear();
    jest.clearAllMocks();
    syncFollowPreference.mockResolvedValue({ storage: 'cloud' });
  });

  test('loads follows from the backend into the cache', async () => {
    api.getFollows.mockResolvedValue({ drivers: [driver], teams: [] });
    await loadFollows('u1');
    expect(readFollows('u1').drivers).toEqual([driver]);
    expect(isFollowingDriver('u1', 'd1')).toBe(true);
    expect(readFollows('other').drivers).toEqual([]);
  });

  test('follow and unfollow go through the API and update the cache', async () => {
    api.followDriverRequest.mockResolvedValue({ drivers: [driver], teams: [] });
    api.unfollowDriverRequest.mockResolvedValue({ drivers: [], teams: [] });

    await followDriver('u1', driver);
    expect(api.followDriverRequest).toHaveBeenCalledWith('d1', driver);
    expect(syncFollowPreference).toHaveBeenCalledWith('u1', 'driver', 'd1', true, driver);
    expect(isFollowingDriver('u1', 'd1')).toBe(true);

    await unfollowDriver('u1', 'd1');
    expect(syncFollowPreference).toHaveBeenCalledWith('u1', 'driver', 'd1', false, driver);
    expect(isFollowingDriver('u1', 'd1')).toBe(false);
  });

  test('keeps a successful unfollow after a failed preference follow and reload', async () => {
    api.followDriverRequest.mockResolvedValue({ drivers: [driver], teams: [] });
    api.unfollowDriverRequest.mockResolvedValue({ drivers: [], teams: [] });
    api.getFollows.mockResolvedValue({ drivers: [], teams: [] });
    syncFollowPreference
      .mockResolvedValueOnce({ storage: 'browser' })
      .mockResolvedValueOnce({ storage: 'cloud' });

    await followDriver('u1', driver);
    await unfollowDriver('u1', 'd1');
    await loadFollows('u1', { force: true });

    expect(syncFollowPreference).toHaveBeenLastCalledWith(
      'u1',
      'driver',
      'd1',
      false,
      driver
    );
    expect(isFollowingDriver('u1', 'd1')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('f1-follow-preferences-pending:u1')))
      .toEqual([]);
  });

  test('preserves and processes a newer change queued during an ongoing write', async () => {
    let finishFirstWrite;
    const firstWrite = new Promise((resolve) => { finishFirstWrite = resolve; });
    api.followDriverRequest.mockResolvedValue({ drivers: [driver], teams: [] });
    api.unfollowDriverRequest.mockResolvedValue({ drivers: [], teams: [] });
    syncFollowPreference
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce({ storage: 'cloud' });

    const followPromise = followDriver('u1', driver);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(syncFollowPreference).toHaveBeenCalledTimes(1);

    const unfollowPromise = unfollowDriver('u1', 'd1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(window.localStorage.getItem('f1-follow-preferences-pending:u1')))
      .toEqual([expect.objectContaining({ type: 'driver', id: 'd1', on: false })]);

    finishFirstWrite({ storage: 'cloud' });
    await Promise.all([followPromise, unfollowPromise]);

    expect(syncFollowPreference).toHaveBeenCalledTimes(2);
    expect(syncFollowPreference).toHaveBeenLastCalledWith(
      'u1',
      'driver',
      'd1',
      false,
      driver
    );
    expect(JSON.parse(window.localStorage.getItem('f1-follow-preferences-pending:u1')))
      .toEqual([]);
  });

  test('keeps the latest operation queued through repeated Firestore failures', async () => {
    api.followDriverRequest.mockResolvedValue({ drivers: [driver], teams: [] });
    api.getFollows.mockResolvedValue({ drivers: [driver], teams: [] });
    syncFollowPreference
      .mockResolvedValueOnce({ storage: 'browser' })
      .mockResolvedValueOnce({ storage: 'browser' })
      .mockResolvedValueOnce({ storage: 'cloud' });

    await followDriver('u1', driver);
    await loadFollows('u1', { force: true });

    expect(JSON.parse(window.localStorage.getItem('f1-follow-preferences-pending:u1')))
      .toEqual([expect.objectContaining({ type: 'driver', id: 'd1', on: true })]);

    await loadFollows('u1', { force: true });

    expect(syncFollowPreference).toHaveBeenCalledTimes(3);
    expect(JSON.parse(window.localStorage.getItem('f1-follow-preferences-pending:u1')))
      .toEqual([]);
    expect(api.followDriverRequest).toHaveBeenCalledTimes(1);
  });
});
