import { memo, useMemo } from 'react';

function formatLapTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '--';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return min > 0
    ? `${min}:${sec.toFixed(3).padStart(6, '0')}`
    : `${sec.toFixed(3)}`;
}

// Derives headline race statistics from the current leaderboard.
function computePulseStats(leaderboard) {
  if (!leaderboard?.length) return null;

  // Biggest mover: highest gridDelta (most positions gained since grid).
  const withGrid = leaderboard.filter((d) => d.gridDelta != null);
  const biggestMover = withGrid.length > 0
    ? withGrid.reduce((best, d) => (d.gridDelta > best.gridDelta ? d : best))
    : null;

  // Fastest last lap: lowest lastLapTime among drivers with valid data.
  const withLap = leaderboard.filter((d) =>
    d.lastLapTime != null && Number.isFinite(d.lastLapTime) && d.lastLapTime > 0
  );
  const fastestLap = withLap.length > 0
    ? withLap.reduce((best, d) => (d.lastLapTime < best.lastLapTime ? d : best))
    : null;

  // Closest battle: consecutive-position pair with smallest gapToAhead.
  let closestBattle = null;
  let smallestGap = Infinity;
  for (let i = 1; i < leaderboard.length; i++) {
    const gap = leaderboard[i].gapToAhead;
    if (gap != null && Number.isFinite(gap) && gap > 0 && gap < smallestGap) {
      smallestGap = gap;
      closestBattle = {
        ahead: leaderboard[i - 1],
        behind: leaderboard[i],
        gap,
      };
    }
  }

  // Leader's pace.
  const leader = leaderboard[0];
  const leaderPace = leader?.lastLapTime ?? null;

  return { biggestMover, fastestLap, closestBattle, leaderPace };
}

// Compact race-insights strip showing headline statistics.
const RacePulse = memo(function RacePulse({ leaderboard }) {
  const stats = useMemo(() => computePulseStats(leaderboard), [leaderboard]);

  if (!stats) return null;

  const cards = [
    {
      label: 'Biggest Mover',
      value: stats.biggestMover
        ? stats.biggestMover.driverName ?? `#${stats.biggestMover.driverNumber}`
        : '--',
      sub: stats.biggestMover ? `+${stats.biggestMover.gridDelta} places from grid` : 'Awaiting data',
      accent: 'green',
    },
    {
      label: 'Closest Battle',
      value: stats.closestBattle
        ? `${stats.closestBattle.ahead.driverName ?? `#${stats.closestBattle.ahead.driverNumber}`} vs ${stats.closestBattle.behind.driverName ?? `#${stats.closestBattle.behind.driverNumber}`}`
        : '--',
      sub: stats.closestBattle ? `${stats.closestBattle.gap.toFixed(1)}s gap` : 'Spreading out',
      accent: 'amber',
    },
    {
      label: 'Fastest Last Lap',
      value: stats.fastestLap
        ? stats.fastestLap.driverName ?? `#${stats.fastestLap.driverNumber}`
        : '--',
      sub: stats.fastestLap ? formatLapTime(stats.fastestLap.lastLapTime) : 'Awaiting data',
      accent: 'purple',
    },
    {
      label: "Leader's Pace",
      value: formatLapTime(stats.leaderPace),
      sub: stats.leaderPace ? 'Last lap by P1' : 'Awaiting data',
      accent: 'blue',
    },
  ];

  return (
    <div className="card race-pulse-card">
      <div className="card-head">
        <div>
          <div className="card-title">Race Pulse</div>
          <div className="card-title-sub">Key stats from the track right now</div>
        </div>
        <span className="pill pill-red">Live</span>
      </div>
      <div className="race-pulse-grid">
        {cards.map((card) => (
          <div key={card.label} className={`pulse-stat ${card.accent}`}>
            <div className="pulse-stat-label">{card.label}</div>
            <div className="pulse-stat-value">{card.value}</div>
            <div className="pulse-stat-sub">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default RacePulse;
