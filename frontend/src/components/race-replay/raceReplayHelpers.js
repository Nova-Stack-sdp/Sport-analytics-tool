// Helpers for turning the /api/race-replay/:sessionId/state leaderboard
// into something the track map can render. Also used by RaceSync.

// Team names change between seasons and sources ("Red Bull Racing",
// "Oracle Red Bull Racing", "Visa Cash App RB F1 Team", "Haas F1 Team"…),
// so names are reduced to a key before looking up the colour class. The
// classes exist in globals.css and raceSync.css; a team without one (e.g.
// Audi, Cadillac) uses the neutral 'default'.
const TEAM_CLASS_BY_KEY = {
  redbull: 'redbull',
  redbullracing: 'redbull',
  oracleredbullracing: 'redbull',
  mercedes: 'mercedes',
  mercedesamgpetronasformulaoneteam: 'mercedes',
  ferrari: 'ferrari',
  scuderiaferrari: 'ferrari',
  scuderiaferrarihp: 'ferrari',
  mclaren: 'mclaren',
  mclarenracing: 'mclaren',
  mclarenformula1team: 'mclaren',
  astonmartin: 'astonmartin',
  astonmartinf1team: 'astonmartin',
  astonmartinaramcoformulaoneteam: 'astonmartin',
  alpine: 'alpine',
  alpinef1team: 'alpine',
  bwtalpinef1team: 'alpine',
  williams: 'williams',
  williamsracing: 'williams',
  atlassianwilliamsf1team: 'williams',
  haas: 'haas',
  haasf1team: 'haas',
  moneygramhaasf1team: 'haas',
  tgrhaasf1team: 'haas',
  sauber: 'sauber',
  kicksauber: 'sauber',
  stakef1teamkicksauber: 'sauber',
  alfaromeo: 'sauber',
  rb: 'racingbulls',
  racingbulls: 'racingbulls',
  visacashapprb: 'racingbulls',
  visacashapprbf1team: 'racingbulls',
  visacashappracingbullsformulaoneteam: 'racingbulls',
  alphatauri: 'racingbulls',
  scuderiaalphatauri: 'racingbulls',
};

export function teamClassFor(teamName) {
  if (!teamName) return 'default';
  const key = String(teamName).toLowerCase().replace(/[^a-z0-9]/g, '');
  return TEAM_CLASS_BY_KEY[key] ?? 'default';
}

// Three-letter code from the surname, the way timing screens show it:
// OpenF1 names are "Max VERSTAPPEN", so the code is "VER", not "MAX".
export function driverCode(driverName, driverNumber) {
  const parts = String(driverName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return driverNumber != null ? String(driverNumber) : '?';
  return parts[parts.length - 1].slice(0, 3).toUpperCase();
}

// Fallback for a backend that doesn't send `safetyCar` yet: only the last
// five race-control messages are available, so the latest safety-car
// message decides. The /state response's `safetyCar` field is preferred —
// it replays the whole race up to the lap (see routes/raceReplay.js).
export function isSafetyCarActive(recentRaceControl) {
  if (!Array.isArray(recentRaceControl) || recentRaceControl.length === 0) return false;
  for (let i = recentRaceControl.length - 1; i >= 0; i -= 1) {
    const event = recentRaceControl[i];
    const text = [event.category, event.flag, event.message].filter(Boolean).join(' ').toUpperCase();
    if (text.includes('VIRTUAL SAFETY CAR') || text.includes(' VSC')) continue;
    if (/IN THIS LAP|WITHDRAWN|ENDING/.test(text)) return false;
    if (text.includes('SAFETY CAR') || text.includes('SAFETYCAR') || text.includes('SAFETY_CAR')) return true;
  }
  return false;
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
export function buildTrackGeometry(points, targetWidth, padding = 30) {
  if (!Array.isArray(points) || points.length < 3) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const worldWidth = maxX - minX || 1;
  const worldHeight = maxY - minY || 1;

  // Height is derived from the data's own aspect ratio, not a fixed guess —
  // a fixed width/height pair assumes every track is wider than tall,
  // which real telemetry (here, actually taller than wide) violates,
  // leaving the shape cramped into part of the box instead of filling it.
  const scale = (targetWidth - padding * 2) / worldWidth;
  const svgWidth = targetWidth;
  const svgHeight = worldHeight * scale + padding * 2;

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

  return { points, svgPoints, toSvg, pathD, cumulative, totalLength, svgWidth, svgHeight };
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

// Converts a signed positional discrepancy (how far ahead/behind a driver
// is from where their current rank says they should be) into a bounded
// speed multiplier, clamped to [minMultiplier, maxMultiplier] regardless
// of how large the discrepancy is. This is deliberately NOT a direct
// position correction — a driver who needs to gain several positions
// just goes a bit faster than base pace for a while, converging over
// several ticks, rather than sprinting the distance in one tick (which
// is what happens if you instead treat the rank-based ideal position as
// a hard target to jump/animate to directly).
export function speedMultiplierForCorrection(signedDelta, gain, minMultiplier, maxMultiplier) {
  const raw = 1 + signedDelta * gain;
  return Math.max(minMultiplier, Math.min(maxMultiplier, raw));
}

// Signed shortest distance from `from` to `to` around a 0-1 loop — e.g.
// shortestArcDelta(0.9, 0.1) is +0.2 (short way forward through the wrap),
// not -0.8 (the long way around). Needed because naive subtraction on a
// looping fraction picks the wrong direction near the 0/1 seam.
export function shortestArcDelta(from, to) {
  let delta = (to - from) % 1;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

// Moves `from` toward `to` around the loop, capped at maxStep. This is
// what turns a rank-swap's instant target-slot jump into gradual motion:
// call it once per tick with the same maxStep, and a driver whose target
// suddenly jumps across the track takes several ticks to arrive, always
// moving forward along the loop rather than teleporting.
// Forward-only distance from `from` to `to` around a 0-1 loop — always in
// [0, 1). This is deliberately NOT the shortest path (which could go
// either direction around the loop) — for a car on a track, only forward
// motion is physically meaningful. Going "backward" is never correct,
// even when it happens to be numerically shorter.
export function forwardArcDistance(from, to) {
  return ((to - from) % 1 + 1) % 1;
}

// Interpolates between two arc-length fractions along the FORWARD path
// between them, parameterized by t in [0, 1]. This is what makes
// frame-by-frame animation actually follow the track: computing (x,y)
// fresh from this interpolated fraction at every frame guarantees the
// point always lies exactly on the curve. Interpolating raw (x,y)
// coordinates directly (e.g. via a CSS transform transition) instead
// draws a straight screen-space line between the two points, which cuts
// across the inside of any corner sharper than that line.
export function interpolateFractionAlongArc(startFraction, endFraction, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  const distance = forwardArcDistance(startFraction, endFraction);
  const interpolated = startFraction + distance * clampedT;
  return ((interpolated % 1) + 1) % 1;
}

// Moves `from` toward `to`, always forward, capped at maxStep per call.
// This is what turns a rank-swap's instant target-slot jump into gradual
// motion: call it once per tick with the same maxStep, and a driver whose
// target suddenly jumps takes several ticks to arrive, always advancing
// forward along the loop, never reversing and never getting stuck (unlike
// an earlier version of this function that tried to take the "shortest"
// path and could end up needing to go backward with nowhere to go).
export function stepTowardArc(from, to, maxStep) {
  const distance = forwardArcDistance(from, to);
  const step = Math.min(distance, maxStep);
  const stepped = from + step;
  return ((stepped % 1) + 1) % 1;
}

// Ported from the reference tool's build_track_from_example_lap(): instead
// of stroking the centerline with one thick line (which blobs over any
// tight curve, however detailed the underlying points are), compute the
// track's actual left/right edges by offsetting the centerline
// perpendicular to itself by half the track width, and draw those two
// edges as separate thin lines. This is what actually makes their track
// render look like a road — the rendering technique matters as much as
// the data source, and applies equally to real telemetry or an
// illustrative centerline.
//
// Uses a circular (wrap-around) finite difference for the tangent at each
// point, appropriate for a closed loop — np.gradient's default one-sided
// edge handling assumes an open array, which isn't quite right here.
export function computeTrackBoundaries(svgPoints, halfWidth) {
  const n = svgPoints.length;
  if (n < 3) return { innerPoints: [], outerPoints: [] };

  const innerPoints = [];
  const outerPoints = [];

  for (let i = 0; i < n; i += 1) {
    const prev = svgPoints[(i - 1 + n) % n];
    const next = svgPoints[(i + 1) % n];
    const dx = (next.x - prev.x) / 2;
    const dy = (next.y - prev.y) / 2;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular to the tangent (dx, dy) is (-dy, dx).
    const nx = -dy / len;
    const ny = dx / len;

    const point = svgPoints[i];
    outerPoints.push({ x: point.x + nx * halfWidth, y: point.y + ny * halfWidth });
    innerPoints.push({ x: point.x - nx * halfWidth, y: point.y - ny * halfWidth });
  }

  return { innerPoints, outerPoints };
}