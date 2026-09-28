/**
 * Repair plan for sessions that were already double-inserted before the
 * sync became idempotent (see scripts/dedupe-events.js).
 */
import { planDuplicateCleanup } from '../src/ingestion/planDuplicateCleanup.js';

const START = new Date('2026-05-24T13:00:00Z');

// A stored lap row. `sub` is the submission (sync run) that inserted it.
function lapRow(id, sub, ingestedAt, lapTimeMs, extra = {}) {
  return {
    id,
    sourceSubmissionId: sub,
    ingestedAt,
    supersededById: null,
    eventType: 'lap_completed',
    entryId: 'e1',
    lapNumber: 1,
    occurredAt: START,
    payload: { lap_time_ms: lapTimeMs },
    ...extra,
  };
}

// Two genuinely separate position changes for the same car at the same
// instant — same identity, different data, arriving in ONE submission.
function positionRow(id, sub, ingestedAt, from, to) {
  return {
    id,
    sourceSubmissionId: sub,
    ingestedAt,
    supersededById: null,
    eventType: 'position_change',
    entryId: 'e44',
    lapNumber: null,
    occurredAt: new Date('2026-05-24T13:20:00Z'),
    payload: { from_position: from, to_position: to, cause: 'on_track' },
  };
}

describe('planDuplicateCleanup (repairing already-doubled sessions)', () => {
  test('deletes copies a later sync re-inserted, keeping the first sync\'s event', () => {
    const plan = planDuplicateCleanup([
      lapRow('a', 'run1', '2026-05-01', 90_000),
      lapRow('b', 'run2', '2026-05-02', 90_000),
      lapRow('c', 'run3', '2026-05-03', 90_000),
      lapRow('solo', 'run1', '2026-05-01', 88_000, { lapNumber: 2 }),
    ]);
    expect(plan.deleteIds.sort()).toEqual(['b', 'c']);
    expect(plan.supersede).toEqual([]);
    expect(plan.duplicateGroups).toBe(1);
  });

  test('never touches separate records that arrived together in one submission', () => {
    // Exactly the pattern that showed up in the real dry run: same car, same
    // instant, several records — all from a single sync run.
    const plan = planDuplicateCleanup([
      positionRow('p1', 'run1', '2026-05-01', 5, 4),
      positionRow('p2', 'run1', '2026-05-01', 4, 3),
      positionRow('p3', 'run1', '2026-05-01', 4, 3), // even an identical one
    ]);
    expect(plan).toEqual({ deleteIds: [], supersede: [], skipped: [], duplicateGroups: 0 });
  });

  test('when a whole session was re-synced, only the second run\'s copies go — siblings survive', () => {
    const plan = planDuplicateCleanup([
      positionRow('p1', 'run1', '2026-05-01', 5, 4),
      positionRow('p2', 'run1', '2026-05-01', 4, 3),
      positionRow('p1-again', 'run2', '2026-05-02', 5, 4),
      positionRow('p2-again', 'run2', '2026-05-02', 4, 3),
    ]);
    expect(plan.deleteIds.sort()).toEqual(['p1-again', 'p2-again']);
    expect(plan.supersede).toEqual([]);
  });

  test('a changed value from a later sync is kept as a correction of the older one', () => {
    const plan = planDuplicateCleanup([
      lapRow('a', 'run1', '2026-05-01', 90_000),
      lapRow('b', 'run2', '2026-05-02', 90_000),
      lapRow('c', 'run3', '2026-05-03', 91_500),
    ]);
    expect(plan.deleteIds).toEqual(['b']);
    expect(plan.supersede).toEqual([{ id: 'a', supersededById: 'c' }]);
  });

  test('extra records a later sync added (not copies) are kept', () => {
    const plan = planDuplicateCleanup([
      positionRow('p1', 'run1', '2026-05-01', 5, 4),
      positionRow('p1-again', 'run2', '2026-05-02', 5, 4),
      positionRow('p-new', 'run2', '2026-05-02', 4, 3),
    ]);
    expect(plan.deleteIds).toEqual(['p1-again']);
    expect(plan.supersede).toEqual([]);
  });

  test('never deletes an event that an earlier correction points at', () => {
    const plan = planDuplicateCleanup([
      lapRow('orig', 'run0', '2026-04-01', 85_000, { supersededById: 'b' }),
      lapRow('a', 'run1', '2026-05-01', 90_000),
      lapRow('b', 'run2', '2026-05-02', 90_000),
    ]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.skipped).toEqual([expect.objectContaining({ eventId: 'b' })]);
  });

  test('a clean session needs no changes', () => {
    const plan = planDuplicateCleanup([
      lapRow('a', 'run1', '2026-05-01', 90_000),
      lapRow('b', 'run1', '2026-05-01', 91_000, { lapNumber: 2 }),
    ]);
    expect(plan).toEqual({ deleteIds: [], supersede: [], skipped: [], duplicateGroups: 0 });
  });
});
