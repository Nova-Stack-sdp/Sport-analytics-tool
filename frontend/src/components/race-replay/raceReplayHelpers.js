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
// Fallback only — used when a driver's real x,y isn't available yet for
// the current tick, or the track shape itself hasn't loaded. See
// buildTrackGeometry below for the real-telemetry path.
export function progressForRank(rank, totalDrivers, sharedPhase) {
  const gapFraction = 0.55 / Math.max(totalDrivers, 1);
  return (sharedPhase - rank * gapFraction + 1) % 1;
}

// Turns the raw track-shape points (real x,y in OpenF1's metre-based,
// arbitrary-origin coordinate system) into an SVG path plus a
// world-to-SVG coordinate converter, fitted into the given viewBox with
// padding. Also precomputes cumulative arc length along the points, used
// by nearestArcLengthFraction/pointAtArcLengthFraction below.
//
// NOTE: this hasn't been visually verified against a real OpenF1 response —
// I don't have network access to fetch one from this environment. If the
// rendered track appears mirrored or rotated once tested against real data,
// the fix is flipping the sign in toSvg's y calculation, not the overall
// approach.
export function buildTrackGeometry(points, viewBoxWidth, viewBoxHeight, padding = 30) {
  if (!Array.isArray(points) || points.length < 3) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const worldWidth = maxX - minX || 1;
  const worldHeight = maxY - minY || 1;

  const scale = Math.min(
    (viewBoxWidth - padding * 2) / worldWidth,
    (viewBoxHeight - padding * 2) / worldHeight
  );

  const toSvg = (x, y) => ({
    x: padding + (x - minX) * scale,
    y: padding + (y - minY) * scale,
  });

  const svgPoints = points.map((p) => toSvg(p.x, p.y));
  const pathD = `M ${svgPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`;

  // Cumulative arc length in world units, walking the point sequence.
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  const totalLength = cumulative[cumulative.length - 1] || 1;

  return { points, svgPoints, toSvg, pathD, cumulative, totalLength };
}

// Finds how far around the track (as a 0-1 fraction) a real-world (x,y)
// point is, by nearest-neighbour search against the reference points. This
// mirrors the reference tool's KD-tree lookup at much smaller scale (~200
// points), which is fine at this point density.
export function nearestArcLengthFraction(geometry, x, y) {
  if (!geometry) return 0;
  let bestIndex = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < geometry.points.length; i += 1) {
    const dx = geometry.points[i].x - x;
    const dy = geometry.points[i].y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }
  return geometry.cumulative[bestIndex] / geometry.totalLength;
}

// Inverse of the above: given a 0-1 fraction around the track, returns the
// SVG-space point there (interpolating between the two nearest reference
// points). Used to place the safety car a fixed distance ahead of the
// leader's real arc-length position.
export function svgPointAtArcLengthFraction(geometry, fraction) {
  if (!geometry) return { x: 0, y: 0 };
  const target = ((fraction % 1) + 1) % 1 * geometry.totalLength;
  let i = 0;
  while (i < geometry.cumulative.length - 1 && geometry.cumulative[i + 1] < target) i += 1;
  const segStart = geometry.cumulative[i];
  const segEnd = geometry.cumulative[i + 1] ?? geometry.totalLength;
  const t = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
  const a = geometry.svgPoints[i];
  const b = geometry.svgPoints[i + 1] ?? geometry.svgPoints[0];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Real distance-ahead-of-leader offset, expressed as a fraction of the
// actual track length — closer to the source project's SC_OFFSET_METERS
// than the old lap-fraction guess, now that we know the real track length.
export const SAFETY_CAR_LEAD_METERS = 150;