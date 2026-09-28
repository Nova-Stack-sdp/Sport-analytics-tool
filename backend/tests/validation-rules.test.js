/**
 * Validation rules: impossible or conflicting event data is rejected with a
 * reason instead of reaching the event log.
 */
import { validateEvents } from '../src/ingestion/validationRules.js';

const START = new Date('2026-05-24T13:00:00Z');
const END = new Date('2026-05-24T14:45:00Z');

function lap(entryId, lapNumber, lapTimeMs, extra = {}) {
  return {
    eventType: 'lap_completed',
    entryId,
    lapNumber,
    occurredAt: new Date(START.getTime() + lapNumber * 90_000),
    payload: { lap_time_ms: lapTimeMs, is_pit_out_lap: false },
    ...extra,
  };
}

function classification(entryId, position, points) {
  return { eventType: 'classification', entryId, lapNumber: null, occurredAt: END, payload: { final_position: position, points, status: 'finished' } };
}

describe('validateEvents (impossible or conflicting data)', () => {
  const context = { entryCount: 20, sessionType: 'Race', sessionStart: START, sessionEnd: END };
  const rulesFor = (events, ctx = context) => validateEvents(events, ctx).rejections.map((r) => r.rule);

  test('accepts ordinary race data', () => {
    const events = [
      lap('e1', 1, 95_000),
      lap('e1', 2, 91_000),
      { eventType: 'pit_stop', entryId: 'e1', lapNumber: 20, occurredAt: new Date(START.getTime() + 1_800_000), payload: { pit_duration_ms: 22_400 } },
      classification('e1', 1, 25),
      classification('e2', 2, 18),
      { eventType: 'grid_position', entryId: 'e1', lapNumber: null, occurredAt: START, payload: { position: 3 } },
    ];
    const { accepted, rejections } = validateEvents(events, context);
    expect(rejections).toEqual([]);
    expect(accepted).toHaveLength(events.length);
  });

  test('rejects impossible lap times and lap numbers, with a reason', () => {
    const { rejections } = validateEvents([lap('e1', 3, 4_000), lap('e1', 0, 90_000)], context);
    expect(rejections.map((r) => r.rule)).toEqual(['lap_time', 'lap_number']);
    expect(rejections[0].reason).toMatch(/4000 ms/);
  });

  test('allows a very long lap that spans a red flag, and laps with no time', () => {
    expect(rulesFor([lap('e1', 7, 45 * 60_000), lap('e1', 1, null)])).toEqual([]);
  });

  test('rejects positions outside the field and non-changes', () => {
    const at = new Date(START.getTime() + 600_000);
    expect(rulesFor([
      { eventType: 'position_change', entryId: 'e1', lapNumber: null, occurredAt: at, payload: { from_position: 3, to_position: 25 } },
      { eventType: 'position_change', entryId: 'e1', lapNumber: null, occurredAt: at, payload: { from_position: 4, to_position: 4 } },
    ])).toEqual(['position_range', 'position_change']);
  });

  test('rejects two cars classified in the same position', () => {
    const { rejections } = validateEvents([classification('e1', 1, 25), classification('e2', 1, 25)], context);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toEqual(expect.objectContaining({ rule: 'conflict' }));
  });

  test('rejects impossible points for the session type', () => {
    expect(rulesFor([classification('e1', 1, 30)])).toEqual(['points']);
    expect(rulesFor([classification('e1', 1, 25)], { ...context, sessionType: 'Sprint' })).toEqual(['points']);
    expect(rulesFor([classification('e1', 1, 3)], { ...context, sessionType: 'Q' })).toEqual(['points']);
  });

  test('rejects events stamped nowhere near the session, and backwards stints', () => {
    expect(rulesFor([
      lap('e1', 2, 90_000, { occurredAt: new Date('2025-01-01T00:00:00Z') }),
      { eventType: 'tyre_stint', entryId: 'e1', lapNumber: 30, occurredAt: START, payload: { stint_number: 2, start_lap: 30, end_lap: 12 } },
    ])).toEqual(['timestamp', 'stint_laps']);
  });

  test('rejects a zero or negative pit stop', () => {
    const at = new Date(START.getTime() + 1_000_000);
    expect(rulesFor([
      { eventType: 'pit_stop', entryId: 'e1', lapNumber: 10, occurredAt: at, payload: { pit_duration_ms: 0 } },
    ])).toEqual(['pit_duration']);
  });
});
