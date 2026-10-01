// One-off generator: copies the shared Monza track-shape trace (READ-ONLY)
// into a frontend demo module so the RaceSync track stage can render before
// the real data wiring lands. The backend RaceReplay module and its data are
// never modified — this only reads backend/src/data/track-shapes/monza.json.
//
// Run: node .scratch-racesync/build-monza-demo.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const source = path.join(root, 'backend', 'src', 'data', 'track-shapes', 'monza.json');
const target = path.join(
  root,
  'frontend',
  'src',
  'components',
  'race-sync',
  'raceSyncDemoTrack.js'
);

const { points } = JSON.parse(await readFile(source, 'utf-8'));
const rounded = points.map(({ x, y }) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

const rows = [];
for (let i = 0; i < rounded.length; i += 5) {
  rows.push(
    '  ' + rounded.slice(i, i + 5).map(([x, y]) => `[${x}, ${y}]`).join(', ') + ','
  );
}

const body = `// Demo-only track trace for the RaceSync track stage.
// Copied read-only from the shared Monza FastF1 shape
// (backend/src/data/track-shapes/monza.json); regenerate with
// \`node .scratch-racesync/build-monza-demo.mjs\`. Nothing here is
// authoritative — it exists so the stage layout can render before the
// replay data wiring lands.

// [x, y] pairs in the circuit's own metres.
const MONZA_TRACK_POINTS = [
${rows.join('\n')}
];

export default MONZA_TRACK_POINTS;
`;

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, body);
console.log(`wrote ${rounded.length} points to ${target}`);
