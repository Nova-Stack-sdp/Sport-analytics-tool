/**
 * Repair plan for sessions that were already double-inserted before the
 * sync became idempotent (see scripts/dedupe-events.js).
 */
import { planDuplicateCleanup } from '../src/ingestion/planDuplicateCleanup.js';

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

describe('planDuplicateCleanup (repairing already-doubled sessions)', () => {
  const row = (id, ingestedAt, lapTimeMs, extra = {}) => ({
    id, ingestedAt, supersededById: null, ...lap('e1', 1, lapTimeMs), ...extra,
  });

  test('deletes exact copies and keeps the first one ingested', () => {
    const plan = planDuplicateCleanup([
      row('a', '2026-05-01', 90_000),
      row('b', '2026-05-02', 90_000),
      row('c', '2026-05-03', 90_000),
      row('solo', '2026-05-01', 88_000, { lapNumber: 2 }),
    ]);
    expect(plan.deleteIds.sort()).toEqual(['b', 'c']);
    expect(plan.supersede).toEqual([]);
    expect(plan.duplicateGroups).toBe(1);
  });

  test('a copy with different data is kept as a correction of the older one', () => {
    const plan = planDuplicateCleanup([
      row('a', '2026-05-01', 90_000),
      row('b', '2026-05-02', 90_000),
      row('c', '2026-05-03', 91_500),
    ]);
    expect(plan.deleteIds).toEqual(['b']);
    expect(plan.supersede).toEqual([{ id: 'a', supersededById: 'c' }]);
  });

  test('never deletes an event that an earlier correction points at', () => {
    const plan = planDuplicateCleanup([
      row('orig', '2026-04-01', 85_000, { supersededById: 'b' }),
      row('a', '2026-05-01', 90_000),
      row('b', '2026-05-02', 90_000),
    ]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.skipped).toEqual([expect.objectContaining({ eventId: 'b' })]);
  });

  test('a clean session needs no changes', () => {
    const plan = planDuplicateCleanup([row('a', '2026-05-01', 90_000), row('b', '2026-05-01', 91_000, { lapNumber: 2 })]);
    expect(plan).toEqual({ deleteIds: [], supersede: [], skipped: [], duplicateGroups: 0 });
  });
});
