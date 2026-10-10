import { eventDetail, formatLapTime } from './eventDetails';

const d = (eventType, payload) => eventDetail({ eventType, payload });

test('lap times read like timing screens', () => {
  expect(formatLapTime(95123)).toBe('1:35.123');
  expect(formatLapTime(59004)).toBe('59.004s');
  expect(formatLapTime(null)).toBeNull();
});

test('each event type gets a readable detail line', () => {
  expect(d('lap_completed', { lap_time_ms: 95123, is_pit_out_lap: true })).toBe('1:35.123 · pit out lap');
  expect(d('pit_stop', { pit_duration_ms: 24510 })).toBe('24.5 s in the pit lane');
  expect(d('tyre_stint', { stint_number: 2, compound: 'hard', start_lap: 19, end_lap: 38 })).toBe('Stint 2 · HARD · laps 19–38');
  expect(d('position_change', { from_position: 5, to_position: 4 })).toBe('P5 → P4');
  expect(d('flag_event', { flag: 'DOUBLE_YELLOW' })).toBe('DOUBLE YELLOW flag');
  expect(d('race_control_message', { message_text: 'SAFETY CAR DEPLOYED' })).toBe('SAFETY CAR DEPLOYED');
  expect(d('weather_snapshot', { air_temp: 28, track_temp: 41, rainfall: 0 })).toBe('Air 28°C · Track 41°C');
  expect(d('classification', { final_position: 1, points: 25, status: 'finished' })).toBe('P1 · 25 pts');
  expect(d('classification', { final_position: null, points: 0, status: 'dnf', reason: 'Gearbox' })).toBe('DNF · Gearbox');
  expect(d('grid_position', { position: 3 })).toBe('Grid P3');
});

test('missing values are skipped, never shown as null', () => {
  expect(d('lap_completed', { lap_time_ms: null, is_pit_out_lap: false })).toBeNull();
  expect(d('tyre_stint', { stint_number: 1, compound: 'SOFT', start_lap: 1, end_lap: null })).toBe('Stint 1 · SOFT · laps 1–?');
  expect(d('unknown_type', { x: 1 })).toBeNull();
  expect(eventDetail({ eventType: 'pit_stop' })).toBeNull();
});
