/**
 * Track-shape derivation, generalized for ANY session — not just Barcelona.
 *
 * Two real sources, in priority order, never a fabricated/guessed shape:
 *   1. Live OpenF1 /location telemetry for this exact session, when OpenF1
 *      still has it (see fetchSessionTrackTelemetryRaw in routes/openf1.js).
 *   2. A static per-circuit JSON file generated offline via FastF1 (see
 *      backend/scripts/generate_track_shapes.py) — real historical
 *      telemetry from an actual past race at the same physical circuit,
 *      checked into src/data/track-shapes/. The circuit's layout doesn't
 *      change race to race, so one real trace covers every session held
 *      there.
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

  const countsByDriver = new Map();
  for (const record of locationRecords) {
    countsByDriver.set(record.driver_number, (countsByDriver.get(record.driver_number) ?? 0) + 1);
  }
  const [referenceDriver] = [...countsByDriver.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null];
  if (referenceDriver == null) return null;

  const driverLaps = (lapsRecords ?? [])
    .filter((lap) => lap.driver_number === referenceDriver && lap.lap_number && lap.date_start)
    .sort((a, b) => a.lap_number - b.lap_number);

  let windowStartMs = null;
  let windowEndMs = null;
  if (driverLaps.length > 2) {
    const sampleIndex = Math.floor(driverLaps.length / 3);
    windowStartMs = Date.parse(driverLaps[sampleIndex].date_start);
    windowEndMs = driverLaps[sampleIndex + 1]
      ? Date.parse(driverLaps[sampleIndex + 1].date_start)
      : windowStartMs + 2 * 60 * 1000;
  }

  const candidatePoints = locationRecords
    .filter((record) => record.driver_number === referenceDriver)
    .filter((record) => {
      if (windowStartMs == null) return true;
      const t = Date.parse(record.date);
      return t >= windowStartMs && t <= windowEndMs;
    })
    .map((record) => ({ x: record.x, y: record.y }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (candidatePoints.length < 10) return null;

  const step = Math.max(1, Math.floor(candidatePoints.length / targetPoints));
  const points = candidatePoints.filter((_, i) => i % step === 0);

  return { points, sourceDriverNumber: referenceDriver };
}

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