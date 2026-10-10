import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTrackShapeFile } from '../scripts/generate-track-shape-from-openf1.js';

// Three laps for driver 1; the derivation traces lap 2 (a third of the way
// in), so the location samples sit between lap 2 and lap 3 start times.
const laps = [
  { driver_number: 1, lap_number: 1, date_start: '2026-10-04T07:00:00Z' },
  { driver_number: 1, lap_number: 2, date_start: '2026-10-04T07:02:00Z' },
  { driver_number: 1, lap_number: 3, date_start: '2026-10-04T07:04:00Z' },
];
const location = [
  { driver_number: 1, date: '2026-10-04T07:02:05Z', x: 0, y: 0 }, // idle transponder sample
  ...Array.from({ length: 30 }, (_, i) => ({
    driver_number: 1,
    date: new Date(Date.parse('2026-10-04T07:02:10Z') + i * 1000).toISOString(),
    x: 100 + i,
    y: 200 - i,
  })),
];

let dir;
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'track-shapes-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

test('writes a real OpenF1 trace under the name the backend looks up', async () => {
  const fetchTelemetry = jest.fn().mockResolvedValue({ laps, location });
  const result = await buildTrackShapeFile({ sessionKey: 11731, circuitName: 'Kuala Lumpur', fetchTelemetry, outputDir: dir });

  expect(fetchTelemetry).toHaveBeenCalledWith(11731);
  expect(result.path).toBe(path.join(dir, 'kuala-lumpur.json'));
  const file = JSON.parse(await readFile(result.path, 'utf-8'));
  expect(file).toMatchObject({ source: 'openf1', sourceDriver: '1', session: 'OpenF1 session_key 11731', circuit: 'Kuala Lumpur' });
  expect(file.points.length).toBe(30);
  expect(file.points).not.toContainEqual({ x: 0, y: 0 });
});

test('never overwrites an existing outline unless forced', async () => {
  await writeFile(path.join(dir, 'kuala-lumpur.json'), '{"points":[]}');
  const fetchTelemetry = jest.fn().mockResolvedValue({ laps, location });
  await expect(buildTrackShapeFile({ sessionKey: 11731, circuitName: 'Kuala Lumpur', fetchTelemetry, outputDir: dir }))
    .rejects.toThrow(/already exists/);
  expect(fetchTelemetry).not.toHaveBeenCalled();

  await buildTrackShapeFile({ sessionKey: 11731, circuitName: 'Kuala Lumpur', fetchTelemetry, outputDir: dir, force: true });
  const file = JSON.parse(await readFile(path.join(dir, 'kuala-lumpur.json'), 'utf-8'));
  expect(file.points.length).toBe(30);
});

test('writes nothing when OpenF1 has no data, rather than inventing a shape', async () => {
  const fetchTelemetry = jest.fn().mockResolvedValue(null);
  await expect(buildTrackShapeFile({ sessionKey: 11731, circuitName: 'Kuala Lumpur', fetchTelemetry, outputDir: dir }))
    .rejects.toThrow(/no session or no location data/);
  await expect(readFile(path.join(dir, 'kuala-lumpur.json'))).rejects.toThrow();
});

test('rejects a bad session key or a missing circuit name', async () => {
  const fetchTelemetry = jest.fn();
  await expect(buildTrackShapeFile({ sessionKey: NaN, circuitName: 'Kuala Lumpur', fetchTelemetry, outputDir: dir }))
    .rejects.toThrow(/session_key/);
  await expect(buildTrackShapeFile({ sessionKey: 11731, circuitName: '', fetchTelemetry, outputDir: dir }))
    .rejects.toThrow(/circuit name/);
  expect(fetchTelemetry).not.toHaveBeenCalled();
});
