import { deriveWatchLiveAnalytics } from './deriveAnalytics';

describe('deriveWatchLiveAnalytics', () => {
  test('derives five-second position momentum from replay snapshots', () => {
    const previous = {
      videoSeconds: 10,
      leaderboard: [
        { driverNumber: 44, position: 3 },
        { driverNumber: 63, position: 1 },
      ],
    };
    const current = {
      videoSeconds: 15,
      leaderboard: [
        { driverNumber: 44, position: 1 },
        { driverNumber: 63, position: 2 },
        { driverNumber: 12, position: 3 },
      ],
    };

    expect(deriveWatchLiveAnalytics(current, [previous, current]).leaderboard).toEqual([
      expect.objectContaining({ driverNumber: 44, positionChange: 2, momentum: 'Gaining positions' }),
      expect.objectContaining({ driverNumber: 63, positionChange: -1, momentum: 'Losing positions' }),
      expect.objectContaining({ driverNumber: 12, positionChange: null, momentum: 'Collecting data' }),
    ]);
  });
});