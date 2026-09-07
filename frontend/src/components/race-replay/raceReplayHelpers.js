// Helpers for turning a real /api/watch-live/state leaderboard into
// something the simplified oval track can render.

// Only a handful of teams had explicit brand colors in globals.css (from
// the earlier mock-data version, which only had 3 teams). Real leaderboard
// data includes the full grid, so this maps every current team name to a
// CSS class, with a neutral fallback for anything unmapped.
const TEAM_CLASS_BY_NAME = {
  'red bull racing': 'redbull',
  mercedes: 'mercedes',
  ferrari: 'ferrari',
  mclaren: 'mclaren',
  'aston martin': 'astonmartin',
  alpine: 'alpine',
  williams: 'williams',
  haas: 'haas',
  sauber: 'sauber',
  'kick sauber': 'sauber',
  rb: 'racingbulls',
  'racing bulls': 'racingbulls',
};

export function teamClassFor(teamName) {
  if (!teamName) return 'default';
  return TEAM_CLASS_BY_NAME[teamName.trim().toLowerCase()] ?? 'default';
}

// OpenF1's race_control category for a safety car period is "SafetyCar", but
// this is checked defensively against category/flag/message text too, since
// the exact field the free tier populates can vary and hasn't been confirmed
// against a live response for this specific session.
export function isSafetyCarActive(recentRaceControl) {
  if (!Array.isArray(recentRaceControl) || recentRaceControl.length === 0) return false;
  return recentRaceControl.some((event) => {
    const haystack = [event.category, event.flag, event.message]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();
    return haystack.includes('SAFETY CAR') || haystack.includes('SAFETYCAR');
  });
}

// We don't have real GPS/location data (OpenF1's /location endpoint isn't
// fetched by the backend bundle) — only race classification (who's P1, P2,
// ...). So drivers are spaced evenly around the simplified oval in real
// finishing-order sequence, with a shared rotating phase to show motion.
// The ORDER is real data; the exact continuous position on the oval is a
// visual stand-in, not real telemetry.
export function progressForRank(rank, totalDrivers, sharedPhase) {
  const gapFraction = 0.55 / Math.max(totalDrivers, 1);
  return (sharedPhase - rank * gapFraction + 1) % 1;
}