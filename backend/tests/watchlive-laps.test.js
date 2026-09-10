import { describe, expect, test } from '@jest/globals';
import {
  buildBarcelonaOpenF1Chunks,
  createBarcelonaWatchLiveState,
} from '../src/routes/watchLive.js';

// Field shapes below are copied from an actual cached OpenF1 bundle for
// session 11307 (verified via a direct DB query), not assumed — this is
// what caught the real bug: /laps uses `date_start`, not `date` like every
// other OpenF1 resource, and it was silently filtered out of every chunk
// before currentLap ever got a chance to compute correctly.
describe('Barcelona lap counting', () => {
  test('currentLap advances as laps complete, using real lap record field names', () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ driver_number: 63, full_name: 'George Russell', team_name: 'Mercedes' }],
      laps: [
        { driver_number: 63, lap_number: 1, date_start: '2026-06-14T13:03:27.854000+00:00', lap_duration: 84.94 },
        { driver_number: 63, lap_number: 2, date_start: '2026-06-14T13:04:52.800000+00:00', lap_duration: 83.1 },
        { driver_number: 63, lap_number: 3, date_start: '2026-06-14T13:06:15.900000+00:00', lap_duration: 82.9 },
      ],
      pit: [],
      stints: [{ date: '2026-06-14T13:00:00.000Z', driver_number: 63, compound: 'MEDIUM', stint_number: 1 }],
      position: [{ date: '2026-06-14T13:00:00.000Z', driver_number: 63, position: 1 }],
      car_data: [],
      location: [],
      race_control: [],
      weather: [],
    };
    const chunks = buildBarcelonaOpenF1Chunks(bundle);

    // Before lap 1 has completed (its date_start).
    const beforeLap1 = createBarcelonaWatchLiveState(0, bundle, chunks);
    expect(beforeLap1.session.currentLap).toBe(0);

    // videoSeconds 110 interpolates (via the real opening-stint calibration
    // anchors) to real time ~13:05:07, which is past lap 2's date_start
    // (13:04:52.8) but before lap 3's (13:06:15.9).
    const afterLap2 = createBarcelonaWatchLiveState(110, bundle, chunks);
    expect(afterLap2.session.currentLap).toBe(2);
  });

  test('a lap missing date_start does not crash chunk building', () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [],
      laps: [{ driver_number: 63, lap_number: 1 }], // no date_start at all
      pit: [],
      stints: [],
      position: [],
      car_data: [],
      location: [],
      race_control: [],
      weather: [],
    };
    expect(() => buildBarcelonaOpenF1Chunks(bundle)).not.toThrow();
  });
});