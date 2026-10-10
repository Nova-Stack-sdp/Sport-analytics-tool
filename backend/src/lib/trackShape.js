/**
 * Track-shape derivation, generalized for ANY session — not just Barcelona.
 *
 * Two real sources, in priority order, never a fabricated/guessed shape:
 *   1. A static per-circuit JSON file generated offline via FastF1 (see
 *      backend/scripts/generate_track_shapes.py) — real historical
 *      telemetry from an actual past race at the same physical circuit,
 *      checked into src/data/track-shapes/. The circuit's layout doesn't
 *      change race to race, so one real trace covers every session held
 *      there. Checked first because it's a single fast local file read,
 *      and because Race Replay's leaderboard never carries real per-car
 *      x/y (computeStateAtLap always sets it null) — so this endpoint only
 *      ever supplies the drawn track OUTLINE, for which a static trace of
 *      the same circuit is exactly as real as this session's own telemetry.
 *   2. Live OpenF1 /location telemetry for this exact session, when OpenF1
 *      still has it (see fetchSessionTrackTelemetryRaw in routes/openf1.js) —
 *      tried only when no static trace exists yet for the circuit, since
 *      it's ~10-12 chunked, rate-limit-paced requests and can take
 *      30s-2min+ end to end.
 * If neither is available, callers get `null` back — the frontend already
 * has an illustrative fallback track for exactly this case (see
 * RaceReplayViewer.js), so a missing shape is a graceful degradation, never
 * an invented outline standing in as if it were real.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TRACK_SHAPES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'track-shapes'
);

/**
 * Derives a track outline from real x,y location telemetry for one
 * representative lap. Same technique as the reference F1 Race Replay tool
 * (and the original Barcelona-only version of this in watchLive.js): pick
 * whichever driver has the most telemetry coverage, take a lap roughly a
 * third of the way through the session (clear of first-lap incidents and
 * late-race tyre-wear oddities), and trace the x,y points they actually
 * drove. Pure function — no I/O, no session/circuit hardcoding — so it
 * works for any session's { laps, location } pair.
 */
export function deriveTrackShapeFromTelemetry(locationRecords, lapsRecords, targetPoints = 200) {
  if (!Array.isArray(locationRecords) || locationRecords.length === 0) return null;

  // OpenF1 sends 0,0 while a car's transponder is idle (garage, grid), the
  // odd sample with one coordinate exactly 0 mid-lap, and some records
  // with no y at all; none of them is a point on the circuit, and one
  // would draw a spike to the axis.
  const usable = locationRecords.filter(
    (r) => Number.isFinite(r.x) && Number.isFinite(r.y) && r.x !== 0 && r.y !== 0
  );

  const pointsByDriver = new Map();
  for (const record of usable) {
    const t = Date.parse(record.date);
    if (!Number.isFinite(t)) continue;
    if (!pointsByDriver.has(record.driver_number)) pointsByDriver.set(record.driver_number, []);
    pointsByDriver.get(record.driver_number).push({ t, x: record.x, y: record.y });
  }
  // Best-covered cars first; a few are enough to find one clean lap.
  const drivers = [...pointsByDriver.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  const downsampled = (pts) => {
    const step = Math.max(1, Math.floor(pts.length / targetPoints));
    return pts.filter((_, i) => i % step === 0).map(({ x, y }) => ({ x, y }));
  };

  for (const [driverNumber, pts] of drivers) {
    pts.sort((a, b) => a.t - b.t);
    const driverLaps = (lapsRecords ?? [])
      .filter((lap) => lap.driver_number === driverNumber && lap.lap_number && lap.date_start)
      .sort((a, b) => a.lap_number - b.lap_number);

    if (driverLaps.length <= 2) {
      // Not enough lap timing to pick one lap: trace everything this car
      // sent, as before.
      if (pts.length >= MIN_POINTS) return { points: downsampled(pts), sourceDriverNumber: driverNumber };
      continue;
    }

    // Start a third of the way in (clear of first-lap incidents and
    // late-race oddities), then try the following laps, then the earlier
    // ones — the first lap with enough samples wins. A single lap can be
    // empty in the data (a gap in the feed, a pit stop, a safety car
    // bunching the timing), so one bad lap no longer means no outline.
    const first = Math.floor(driverLaps.length / 3);
    const order = [];
    for (let i = first; i < driverLaps.length - 1; i += 1) order.push(i);
    for (let i = first - 1; i >= 0; i -= 1) order.push(i);

    for (const i of order) {
      const start = Date.parse(driverLaps[i].date_start);
      const end = Date.parse(driverLaps[i + 1].date_start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const lap = pts.filter((p) => p.t >= start && p.t <= end);
      if (lap.length >= MIN_POINTS) return { points: downsampled(lap), sourceDriverNumber: driverNumber };
    }
  }
  return null;
}

const MIN_POINTS = 10;

// Matches the filename convention generate_track_shapes.py writes — e.g.
// "Spa-Francorchamps" -> "spa-francorchamps.json".
export function slugifyCircuitName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (e.g. "São Paulo")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const staticShapeCache = new Map();

/**
 * Loads a real, offline-generated FastF1 track shape for this circuit, if
 * one has been generated and committed. Returns null (not an error) when
 * none exists yet — most circuits won't have one until generate_track_shapes.py
 * is run for them.
 */
export async function readStaticTrackShape(circuitName) {
  const slug = slugifyCircuitName(circuitName);
  if (staticShapeCache.has(slug)) return staticShapeCache.get(slug);

  try {
    const raw = await readFile(path.join(TRACK_SHAPES_DIR, `${slug}.json`), 'utf-8');
    const parsed = JSON.parse(raw);
    staticShapeCache.set(slug, parsed);
    return parsed;
  } catch {
    staticShapeCache.set(slug, null);
    return null;
  }
}