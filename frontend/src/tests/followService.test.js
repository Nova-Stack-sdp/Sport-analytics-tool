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
    jest.clearAllMocks();
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
    expect(syncFollowPreference).toHaveBeenCalledWith('u1', 'driver', 'd1', true);
    expect(isFollowingDriver('u1', 'd1')).toBe(true);

    await unfollowDriver('u1', 'd1');
    expect(syncFollowPreference).toHaveBeenCalledWith('u1', 'driver', 'd1', false);
    expect(isFollowingDriver('u1', 'd1')).toBe(false);
  });
});
