import { describe, expect, test } from '@jest/globals';
import {
  Barcelona_video_chunks,
  buildBarcelonaOpenF1Chunks,
  mapBarcelonaVideoTime,
} from '../src/routes/watchLive.js';

describe('Barcelona video mapping', () => {
  test('maps every verified calibration point to its OpenF1 timestamp', () => {
    for (const [chunkIndex, chunk] of Barcelona_video_chunks.entries()) {
      const anchors = chunk.calibrationAnchors.slice(chunkIndex === 0 ? 0 : 1);
      for (const anchor of anchors) {
        expect(mapBarcelonaVideoTime(anchor.videoSeconds)).toMatchObject({
          chunkId: chunk.id,
          openF1Timestamp: anchor.openF1Timestamp,
        });
      }
    }

    expect(mapBarcelonaVideoTime(-1)).toBeNull();
    expect(() => mapBarcelonaVideoTime(Number.NaN)).toThrow(TypeError);
  });

  test('partitions date-bearing OpenF1 resources without mutating the raw bundle', () => {
    const bundle = {
      laps: [
        { date: '2026-06-14T13:03:27.854Z', lap_number: 1 },
        { date: '2026-06-14T13:41:28.951Z', lap_number: 27 },
        { date: '2026-06-14T13:55:32.753Z', lap_number: 38 },
      ],
      pit: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44 }],
      stints: [],
      position: [],
      race_control: [],
      weather: [],
    };

    const chunks = buildBarcelonaOpenF1Chunks(bundle);

    expect(chunks).toHaveLength(4);
    expect(chunks[0].resources.laps).toEqual([{ date: '2026-06-14T13:03:27.854Z', lap_number: 1 }]);
    expect(chunks[1].resources.pit).toEqual([{ date: '2026-06-14T13:19:06.289Z', driver_number: 44 }]);
    expect(chunks[3].resources.laps).toEqual([{ date: '2026-06-14T13:55:32.753Z', lap_number: 38 }]);
    expect(chunks.flatMap((chunk) => chunk.resources.laps)).toHaveLength(3);
    expect(bundle.laps).toHaveLength(3);
  });
});