import { describe, expect, test } from '@jest/globals';
import {
  buildBarcelonaOpenF1Chunks,
  createBarcelonaWatchLiveState,
} from '../src/routes/watchLive.js';

// Verifies speed is carried from raw car telemetry to the replay snapshot.
describe('Barcelona Watch Live speed', () => {
  test('uses the latest OpenF1 car_data speed at the mapped playback time', () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ driver_number: 44, full_name: 'Lewis Hamilton', team_name: 'Ferrari' }],
      laps: [{ date: '2026-06-14T13:19:06.289Z', lap_number: 11, lap_duration: 80 }],
      pit: [],
      stints: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44, compound: 'HARD', stint_number: 2 }],
      position: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44, position: 1 }],
      car_data: [{ date: '2026-06-14T13:19:06.289Z', driver_number: 44, speed: 287 }],
      race_control: [],
      weather: [],
    };
    const chunks = buildBarcelonaOpenF1Chunks(bundle);

    expect(createBarcelonaWatchLiveState(923, bundle, chunks).leaderboard).toEqual([
      expect.objectContaining({ driverNumber: 44, speedKph: 287 }),
    ]);
  });
});