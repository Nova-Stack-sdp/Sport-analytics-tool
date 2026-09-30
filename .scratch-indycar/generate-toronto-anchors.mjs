// Regenerates backend/src/data/torontoAnchors.js from the curated anchors JSON.
// Run from anywhere: node .scratch-indycar/generate-toronto-anchors.mjs
import fs from 'fs';
import { fileURLToPath } from 'url';

const source = fileURLToPath(new URL('./toronto_2025_anchors.json', import.meta.url));
const target = fileURLToPath(new URL('../backend/src/data/torontoAnchors.js', import.meta.url));

const data = JSON.parse(fs.readFileSync(source, 'utf8'));

const lapCalibration = (data.lap_calibration ?? []).map((entry) => ({
  video_s: entry.video_s,
  lap: entry.lap,
  basis: entry.basis,
}));

// The ticker only needs the broadcast-facing fields; measurement extras
// (race_elapsed_s_est, tire models, turn numbers, ...) stay in the source JSON.
const events = (data.events ?? []).map((entry) => {
  const event = { id: entry.id, video_s: entry.video_s, type: entry.type };
  if (entry.lap != null) event.lap = entry.lap;
  if (Array.isArray(entry.drivers) && entry.drivers.length > 0) event.drivers = entry.drivers;
  if (entry.confidence) event.confidence = entry.confidence;
  event.detail = entry.detail;
  return event;
});

const lines = [
  '// Curated Toronto 2025 anchors extracted from the FOX broadcast transcript and',
  '// official timing sources. Source of truth: .scratch-indycar/toronto_2025_anchors.json',
  '// Regenerate with: node .scratch-indycar/generate-toronto-anchors.mjs',
  '// (do not edit by hand unless the source JSON cannot express the change).',
  'export const torontoAnchors = {',
  '  lapCalibration: [',
  ...lapCalibration.map((entry) => `    ${JSON.stringify(entry)},`),
  '  ],',
  '  events: [',
  ...events.map((entry) => `    ${JSON.stringify(entry)},`),
  '  ],',
  '};',
  '',
];

fs.writeFileSync(target, lines.join('\n'), 'utf8');
console.log(`wrote ${target}`);
console.log(`  lapCalibration: ${lapCalibration.length} points`);
console.log(`  events: ${events.length}`);
