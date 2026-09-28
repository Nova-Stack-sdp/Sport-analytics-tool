/**
 * Idempotent ingestion: what counts as "the same event", and how a
 * re-submitted batch is split into new / unchanged / corrected events so
 * nothing is ever counted twice.
 */
import { eventIdentity, sameEventData, canonicalJson } from '../src/ingestion/eventIdentity.js';
import { planIngestion, summarizePlan } from '../src/ingestion/planIngestion.js';

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

describe('eventIdentity', () => {
  test('a lap is identified by car and lap number, not by its data', () => {
    expect(eventIdentity(lap('e1', 5, 91_000))).toBe(eventIdentity(lap('e1', 5, 95_000)));
    expect(eventIdentity(lap('e1', 5, 91_000))).not.toBe(eventIdentity(lap('e1', 6, 91_000)));
    expect(eventIdentity(lap('e1', 5, 91_000))).not.toBe(eventIdentity(lap('e2', 5, 91_000)));
  });

  test('classification and grid ignore their timestamps (they used to be the time of the sync)', () => {
    const a = { ...classification('e1', 1, 25), occurredAt: new Date('2026-09-01T10:00:00Z') };
    const b = { ...classification('e1', 1, 25), occurredAt: new Date('2026-09-20T18:30:00Z') };
    expect(eventIdentity(a)).toBe(eventIdentity(b));
  });

  test('the same event read back from the database (ISO strings) matches the in-memory one', () => {
    const inMemory = lap('e1', 3, 90_000);
    const fromDb = { ...inMemory, occurredAt: inMemory.occurredAt.toISOString() };
    expect(eventIdentity(fromDb)).toBe(eventIdentity(inMemory));
  });

  test('race control messages at the same moment stay distinct', () => {
    const at = new Date('2026-05-24T13:10:00Z');
    const a = { eventType: 'race_control_message', entryId: null, lapNumber: 4, occurredAt: at, payload: { category: 'Other', message_text: 'TRACK LIMITS CAR 1' } };
    const b = { ...a, payload: { category: 'Other', message_text: 'TRACK LIMITS CAR 44' } };
    expect(eventIdentity(a)).not.toBe(eventIdentity(b));
  });

  test('payload comparison ignores key order', () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalJson({ b: { d: 3, c: 2 }, a: 1 }));
    expect(sameEventData(lap('e1', 1, 90_000), lap('e1', 1, 90_000))).toBe(true);
    expect(sameEventData(lap('e1', 1, 90_000), lap('e1', 1, 90_001))).toBe(false);
  });
});

describe('planIngestion (re-submitting must not double-count)', () => {
  const stored = [
    { id: 'db-1', ...lap('e1', 1, 90_000), ingestedAt: '2026-05-25T00:00:00Z' },
    { id: 'db-2', ...lap('e1', 2, 89_000), ingestedAt: '2026-05-25T00:00:00Z' },
  ];

  test('re-sending exactly the same batch inserts nothing', () => {
    const plan = planIngestion([lap('e1', 1, 90_000), lap('e1', 2, 89_000)], stored);
    expect(summarizePlan(plan)).toEqual({ inserted: 0, corrected: 0, unchanged: 2, duplicatesInBatch: 0, rejected: 0 });
  });

  test('new events are inserted, changed ones become corrections of the stored event', () => {
    const plan = planIngestion([lap('e1', 1, 90_000), lap('e1', 2, 88_500), lap('e1', 3, 88_000)], stored);
    expect(plan.insert.map((e) => e.lapNumber)).toEqual([3]);
    expect(plan.corrections).toHaveLength(1);
    expect(plan.corrections[0].supersedesId).toBe('db-2');
    expect(plan.corrections[0].event.payload.lap_time_ms).toBe(88_500);
    expect(plan.unchanged).toHaveLength(1);
  });

  test('separate records that share an identity are each stored, and each matched on re-sync', () => {
    // Two position changes for the same car at the same instant.
    const at = new Date('2026-05-24T13:20:00Z');
    const change = (from, to) => ({ eventType: 'position_change', entryId: 'e44', lapNumber: null, occurredAt: at, payload: { from_position: from, to_position: to } });

    const first = planIngestion([change(5, 4), change(4, 3)], []);
    expect(first.insert).toHaveLength(2);
    expect(first.duplicates).toHaveLength(0);

    const stored = first.insert.map((e, i) => ({ ...e, id: `db-${i}`, ingestedAt: '2026-05-25T00:00:00Z' }));
    const again = planIngestion([change(5, 4), change(4, 3)], stored);
    expect(summarizePlan(again)).toEqual({ inserted: 0, corrected: 0, unchanged: 2, duplicatesInBatch: 0, rejected: 0 });
  });

  test('re-syncing a session that still holds old duplicate copies adds nothing more', () => {
    const at = new Date('2026-05-24T13:20:00Z');
    const flag = { eventType: 'flag_event', entryId: null, lapNumber: 12, occurredAt: at, payload: { flag: 'yellow', start_lap: 12, end_lap: null } };
    const stored = [
      { ...flag, id: 'f-run1', ingestedAt: '2026-05-01' },
      { ...flag, id: 'f-run2', ingestedAt: '2026-05-02' },
    ];
    const plan = planIngestion([flag], stored);
    expect(summarizePlan(plan)).toEqual({ inserted: 0, corrected: 0, unchanged: 1, duplicatesInBatch: 0, rejected: 0 });
  });

  test('the same lap twice in one batch is reported, not inserted twice', () => {
    const plan = planIngestion([lap('e2', 1, 90_000), lap('e2', 1, 90_000)], []);
    expect(plan.insert).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });

  test('when the store already holds duplicates, it compares against the newest copy', () => {
    const doubled = [
      { id: 'old', ...lap('e1', 1, 90_000), ingestedAt: '2026-05-01T00:00:00Z' },
      { id: 'new', ...lap('e1', 1, 91_000), ingestedAt: '2026-05-02T00:00:00Z' },
    ];
    const plan = planIngestion([lap('e1', 1, 91_000)], doubled);
    expect(plan.unchanged).toEqual([expect.objectContaining({ existingId: 'new' })]);
  });
});
