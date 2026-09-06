import { describe, expect, test } from '@jest/globals';
import {
  Barcelona_video_chunks,
  buildBarcelonaOpenF1Chunks,
  createBarcelonaWatchLiveState,
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

  test('creates a normalized state from records at the mapped timestamp', () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ driver_number: 44, full_name: 'Lewis Hamilton', team_name: 'Ferrari' }],
      laps: [{ date: '2026-06-14T13:19:06.289Z', lap_number: 11 }],
      pit: [],
      stints: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44, compound: 'HARD', stint_number: 2 }],
      position: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44, position: 1 }],
      race_control: [{ date: '2026-06-14T13:19:06.289Z', lap_number: 11, category: 'Flag', flag: 'GREEN', message: 'TRACK CLEAR' }],
      weather: [{ date: '2026-06-14T13:19:06.289Z', air_temperature: 28, track_temperature: 42, humidity: 48, rainfall: 0, wind_speed: 2 }],
    };
    const chunks = buildBarcelonaOpenF1Chunks(bundle);

    expect(createBarcelonaWatchLiveState(923, bundle, chunks)).toMatchObject({
      mapping: { chunkId: 'first-strategy-cycle', openF1Timestamp: '2026-06-14T13:19:06.289Z' },
      session: { sessionKey: 11307, currentLap: 11, totalLaps: 11 },
      leaderboard: [{ position: 1, driverNumber: 44, driverName: 'Lewis Hamilton', teamName: 'Ferrari', tyreCompound: 'HARD', stintNumber: 2 }],
      weather: { airTemperature: 28, trackTemperature: 42, humidity: 48, rainfall: 0, windSpeed: 2 },
      recentRaceControl: [{ lapNumber: 11, category: 'Flag', flag: 'GREEN', message: 'TRACK CLEAR' }],
    });
  });
});