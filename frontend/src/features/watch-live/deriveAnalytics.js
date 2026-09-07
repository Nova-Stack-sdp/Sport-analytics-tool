// Derives display analytics from consecutive replay snapshots.
const MOMENTUM_WINDOW_SECONDS = 5;

function findSnapshotAtOrBefore(snapshots, videoSeconds) {
  return snapshots.reduce((candidate, snapshot) => (
    snapshot.videoSeconds <= videoSeconds ? snapshot : candidate
  ), null);
}

function momentumLabel(positionChange) {
  if (positionChange > 0) return 'Gaining positions';
  if (positionChange < 0) return 'Losing positions';
  return 'Holding position';
}

export function deriveWatchLiveAnalytics(snapshot, snapshots = []) {
  if (!snapshot) return { leaderboard: [] };

  const previousSnapshot = findSnapshotAtOrBefore(
    snapshots,
    snapshot.videoSeconds - MOMENTUM_WINDOW_SECONDS
  );
  const previousPositions = new Map(
    (previousSnapshot?.leaderboard ?? []).map((driver) => [driver.driverNumber, driver.position])
  );

  return {
    leaderboard: (snapshot.leaderboard ?? []).map((driver) => {
      const previousPosition = previousPositions.get(driver.driverNumber);
      const positionChange = previousPosition == null ? null : previousPosition - driver.position;

      return {
        ...driver,
        positionChange,
        momentum: positionChange == null ? 'Collecting data' : momentumLabel(positionChange),
      };
    }),
  };
}