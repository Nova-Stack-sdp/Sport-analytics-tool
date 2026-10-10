/**
 * Writes a static Race Replay track outline for a circuit from REAL OpenF1
 * location telemetry of one session held there.
 *
 * Use it when generate_track_shapes.py (FastF1) can't map a circuit to a
 * past event — e.g. "Kuala Lumpur", where the rescheduled 2026 Bahrain
 * Grand Prix was held, which had no earlier race in FastF1's era. It uses
 * the exact code the backend already uses for its live fallback
 * (fetchSessionTrackTelemetryRaw + deriveTrackShapeFromTelemetry), so the
 * outline is the line a car actually drove — never hand-drawn or guessed.
 *
 * The live fallback has to make ~10–12 rate-limited OpenF1 requests on
 * every page load (30 s–2 min+), so in practice the replay showed the
 * illustrative track. A committed file is read instantly instead.
 *
 * USAGE (from backend/, needs internet access to api.openf1.org):
 *   node scripts/generate-track-shape-from-openf1.js <session_key> "<circuit name>"
 *   node scripts/generate-track-shape-from-openf1.js 11731 "Kuala Lumpur"
 *
 * The circuit name is the one stored in the database (the fixture's
 * circuitName); it is turned into the file name the backend looks up
 * (src/data/track-shapes/kuala-lumpur.json). An existing file is never
 * overwritten unless --force is given.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveTrackShapeFromTelemetry, slugifyCircuitName } from '../src/lib/trackShape.js';

const DEFAULT_OUTPUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'track-shapes'
);

/** A one-line summary of what OpenF1 sent, for error messages. */
export function describeTelemetry({ location = [], laps = [] }) {
  const usable = location.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && r.x !== 0 && r.y !== 0);
  const cars = new Set(usable.map((r) => r.driver_number)).size;
  const dates = location.map((r) => r.date).filter(Boolean).sort();
  const lapsList = Array.isArray(laps) ? laps : [];
  const timed = lapsList.filter((l) => l.date_start).length;
  return [
    `${location.length} location records, ${usable.length} on track from ${cars} cars`,
    dates.length ? `from ${dates[0]} to ${dates[dates.length - 1]}` : 'no timestamps',
    `${lapsList.length} laps, ${timed} with a start time`,
  ].join('; ');
}

/**
 * Fetches one session's telemetry, derives the outline and writes it.
 * Dependencies are passed in so tests can run it without the network.
 * Returns { path, points } or throws with a message saying what's missing.
 */
export async function buildTrackShapeFile({
  sessionKey,
  circuitName,
  fetchTelemetry,
  outputDir = DEFAULT_OUTPUT_DIR,
  force = false,
}) {
  if (!Number.isInteger(sessionKey) || sessionKey <= 0) {
    throw new Error('session_key must be a positive whole number, e.g. 11731');
  }
  const slug = slugifyCircuitName(String(circuitName ?? ''));
  if (!slug) throw new Error('circuit name is required, e.g. "Kuala Lumpur"');

  const outputPath = path.join(outputDir, `${slug}.json`);
  if (existsSync(outputPath) && !force) {
    throw new Error(`${outputPath} already exists — pass --force to replace it`);
  }

  const telemetry = await fetchTelemetry(sessionKey);
  if (!telemetry) {
    throw new Error(`OpenF1 has no session or no location data for session_key=${sessionKey}`);
  }
  const shape = deriveTrackShapeFromTelemetry(telemetry.location, telemetry.laps);
  if (!shape) {
    throw new Error(`Not enough location points on any lap to trace the circuit (${describeTelemetry(telemetry)})`);
  }
  // OpenF1 sends 0,0 samples while a car's transponder is idle; they would
  // pull a spike to the origin into the outline.
  const points = shape.points.filter((p) => p.x !== 0 && p.y !== 0);
  if (points.length < 10) {
    throw new Error('Not enough location points on a clean lap to trace the circuit');
  }

  const output = {
    points,
    source: 'openf1',
    sourceDriver: String(shape.sourceDriverNumber),
    session: `OpenF1 session_key ${sessionKey}`,
    circuit: circuitName,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return { path: outputPath, points: points.length };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const [sessionKeyArg, circuitName] = args.filter((a) => a !== '--force');
  if (!sessionKeyArg || !circuitName) {
    console.error('Usage: node scripts/generate-track-shape-from-openf1.js <session_key> "<circuit name>" [--force]');
    process.exit(1);
  }
  const { fetchSessionTrackTelemetryRaw } = await import('../src/routes/openf1.js');
  console.log(`Fetching OpenF1 laps and location data for session ${sessionKeyArg} (this can take a minute or two)…`);
  try {
    const result = await buildTrackShapeFile({
      sessionKey: Number(sessionKeyArg),
      circuitName,
      fetchTelemetry: fetchSessionTrackTelemetryRaw,
      force,
    });
    console.log(`Wrote ${result.points} points to ${result.path}`);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
