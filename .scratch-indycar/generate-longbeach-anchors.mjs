// Regenerates backend/src/data/longBeachAnchors.js from the curated anchors JSON.
// Run from anywhere: node .scratch-indycar/generate-longbeach-anchors.mjs
// Mirrors generate-toronto-anchors.mjs, adapted to the Long Beach source schema
// (lap_calibration counts completed laps, so the lap-in-progress curve shifts
// by one to match the convention videoToLap.js interpolates on).
import fs from 'fs';
import { fileURLToPath } from 'url';

const source = fileURLToPath(new URL('./longbeach_2023_anchors.json', import.meta.url));
const target = fileURLToPath(new URL('../backend/src/data/longBeachAnchors.js', import.meta.url));

const data = JSON.parse(fs.readFileSync(source, 'utf8'));

// laps_completed -> "lap in progress at that video second": green flag at 0
// completed = lap 1 running, restart "at conclusion of lap 3" = lap 4 running,
// checkered at 85 completed = one past the distance (clamped by the frontend).
const lapCalibration = (data.lap_calibration ?? []).map((entry) => ({
  video_s: entry.video_s,
  lap: entry.laps_completed + 1,
  basis: entry.basis,
}));

// The ticker only needs the broadcast-facing fields; measurement extras
// (lap_est stays as the lap association when no on-air lap was stated, plus
// tire models, caution windows, ...) stay in the source JSON.
const events = (data.events ?? []).map((entry) => {
  const event = { id: entry.id, video_s: entry.video_s, type: entry.type };
  const lap = entry.lap ?? entry.lap_est;
  if (lap != null) event.lap = lap;
  if (Array.isArray(entry.drivers) && entry.drivers.length > 0) event.drivers = entry.drivers;
  if (entry.confidence) event.confidence = entry.confidence;
  event.detail = entry.detail;
  return event;
});

// Broadcast-called stop list, rebuilt from the pit_stop events exactly like
// Toronto's: the lap stated on air wins, otherwise one interpolated from the
// calibration curve and labelled "video estimate". Long Beach's official PDF
// pit data parses fine, so the route only falls back to these when a bundle
// ships none — they exist to keep the ticker honest about what aired when.
function lapAtVideo(seconds, calibration) {
  const points = [...calibration].sort((a, b) => a.video_s - b.video_s);
  if (points.length === 0) return null;
  if (seconds <= points[0].video_s) return points[0].lap;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    if (seconds <= next.video_s) {
      const ratio = (seconds - previous.video_s) / (next.video_s - previous.video_s);
      return previous.lap + ratio * (next.lap - previous.lap);
    }
  }
  return points.at(-1).lap;
}

const stopsByDriver = new Map();
const ordering = [...(data.events ?? [])].sort((a, b) => a.video_s - b.video_s);
for (const event of ordering) {
  if (event.type !== 'pit_stop' || !Array.isArray(event.drivers)) continue;
  let lap = event.lap ?? event.lap_est;
  let basis = 'stated';
  if (lap == null) {
    const estimated = lapAtVideo(event.video_s, lapCalibration);
    if (estimated == null) continue;
    lap = Math.max(1, Math.round(estimated));
    basis = 'video estimate';
  }
  for (const driver of event.drivers) {
    const stops = stopsByDriver.get(driver) ?? [];
    const existing = stops.find((stop) => stop.raceLap === lap);
    if (!existing) {
      stops.push({ raceLap: lap, video_s: event.video_s, basis, eventId: event.id });
    } else if (existing.basis === 'video estimate' && basis === 'stated') {
      existing.basis = basis; // a stated lap outranks an estimate for the same stop
      existing.video_s = event.video_s;
      existing.eventId = event.id;
    }
    stopsByDriver.set(driver, stops);
  }
}

const pitStops = [...stopsByDriver.entries()]
  .map(([driver, stops]) => {
    const info = data.drivers?.[driver] ?? {};
    return {
      car: info.car != null ? String(info.car) : null,
      driver,
      total: info.pit_stops_total ?? null,
      stops: [...stops]
        .sort((a, b) => a.raceLap - b.raceLap)
        .map((stop, index) => ({
          stop: index + 1,
          raceLap: stop.raceLap,
          video_s: stop.video_s,
          basis: stop.basis,
        })),
      finish: info.finish ?? null,
    };
  })
  .sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99))
  .map(({ finish, ...entry }) => entry);

for (const entry of pitStops) {
  if (entry.total != null && entry.stops.length > entry.total) {
    console.warn(`WARN ${entry.driver}: ${entry.stops.length} curated stops exceed the official ${entry.total}`);
  }
}
for (const driver of stopsByDriver.keys()) {
  if (!data.drivers?.[driver]) console.warn(`WARN driver "${driver}" is not in the anchors driver list`);
}
console.log(`pitStops: ${pitStops.length} drivers, ${pitStops.reduce((sum, entry) => sum + entry.stops.length, 0)} stops`);
for (const entry of pitStops) {
  console.log(`  #${entry.car} ${entry.driver}: ${entry.stops.map((stop) => `${stop.raceLap}${stop.basis === 'video estimate' ? '~' : ''}`).join(', ')} (official ${entry.total})`);
}

const lines = [
  '// Curated Long Beach 2023 anchors extracted from the FOX broadcast transcript',
  '// and official timing sources. Source of truth: .scratch-indycar/longbeach_2023_anchors.json',
  '// Regenerate with: node .scratch-indycar/generate-longbeach-anchors.mjs',
  '// (do not edit by hand unless the source JSON cannot express the change).',
  'export const longBeachAnchors = {',
  '  lapCalibration: [',
  ...lapCalibration.map((entry) => `    ${JSON.stringify(entry)},`),
  '  ],',
  '  events: [',
  ...events.map((entry) => `    ${JSON.stringify(entry)},`),
  '  ],',
  '  // Broadcast-called stop list rebuilt from the pit_stop events: the lap',
  '  // stated on air, or one interpolated from the calibration above and',
  '  // labelled "video estimate". The route prefers a bundle\'s official',
  '  // parsed pit data when it has any; these cover the no-data fallback.',
  '  pitStops: [',
  ...pitStops.map((entry) => `    ${JSON.stringify(entry)},`),
  '  ],',
  '};',
  '',
];

fs.writeFileSync(target, lines.join('\n'), 'utf8');
console.log(`wrote ${target}`);
console.log(`  lapCalibration: ${lapCalibration.length} points`);
console.log(`  events: ${events.length}`);
