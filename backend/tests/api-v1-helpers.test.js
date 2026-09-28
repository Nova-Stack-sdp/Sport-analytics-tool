/**
 * Pure building blocks of the public v1 API: parameter validation, filter ->
 * query translation, cursor paging, CSV writing, and the stat -> source
 * event mapping behind the traceability endpoint.
 */
import { parseQuery, parsers, pagingSpec } from '../src/api/v1/params.js';
import { eventFilterSpec, eventWhere, fixtureFilterSpec, fixtureWhere } from '../src/api/v1/filters.js';
import { encodeCursor, decodeCursor, pageArgs, buildPage } from '../src/api/v1/pagination.js';
import { csvCell, csvRow } from '../src/api/v1/csv.js';
import { sessionStatSources } from '../src/api/v1/serializers.js';

const ID = '0967e527-158c-452e-83c0-97c050873684';

describe('parseQuery', () => {
  test('parses supported filters into typed values', () => {
    const { values, errors } = parseQuery(
      { season: '2024', type: 'lap_completed,pit_stop', includeSuperseded: 'true', limit: '25' },
      { ...eventFilterSpec, ...pagingSpec }
    );
    expect(errors).toBeNull();
    expect(values).toEqual({ season: 2024, type: ['lap_completed', 'pit_stop'], includeSuperseded: true, limit: 25 });
  });

  test('explains every bad or unknown parameter instead of ignoring it', () => {
    const { errors } = parseQuery(
      { season: 'twenty', type: 'lap', limit: '0', seasn: '2024', driver: 'max' },
      { ...eventFilterSpec, ...pagingSpec }
    );
    expect(Object.keys(errors).sort()).toEqual(['driver', 'limit', 'seasn', 'season', 'type']);
    expect(errors.seasn).toMatch(/not a supported parameter/);
    expect(errors.type).toMatch(/unknown value\(s\) lap/);
  });

  test('rejects a parameter given twice', () => {
    expect(parseQuery({ season: ['2023', '2024'] }, { season: parsers.int() }).errors).toEqual({ season: 'must be given once' });
  });
});

describe('filters -> Prisma where', () => {
  test('event filters narrow by fixture, season, type, driver, lap range and time', () => {
    const from = new Date('2024-03-02T15:00:00Z');
    expect(eventWhere({
      fixture: ID, season: 2024, sessionType: 'Race', type: ['pit_stop'],
      driverNumber: 44, lapFrom: 10, lapTo: 20, from,
    })).toEqual({
      sessionId: ID,
      session: { type: 'Race', meeting: { season: 2024 } },
      eventType: { in: ['pit_stop'] },
      entry: { driver: { driverNumber: 44 } },
      lapNumber: { gte: 10, lte: 20 },
      occurredAt: { gte: from },
      supersededById: null,
    });
  });

  test('corrected-away events are excluded unless asked for', () => {
    expect(eventWhere({})).toEqual({ supersededById: null });
    expect(eventWhere({ includeSuperseded: true })).toEqual({});
  });

  test('fixture filters', () => {
    expect(parseQuery({ circuit: 'monza', status: 'finished' }, fixtureFilterSpec).errors).toBeNull();
    expect(fixtureWhere({ season: 2025, circuit: 'monza', sessionType: 'Sprint' })).toEqual({
      type: 'Sprint',
      meeting: { season: 2025, circuit: { name: { contains: 'monza', mode: 'insensitive' } } },
    });
  });
});

describe('cursor paging', () => {
  test('a cursor round-trips, and a made-up one is refused', () => {
    expect(decodeCursor(encodeCursor(ID))).toBe(ID);
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(encodeCursor('drop table event'))).toBeNull();
  });

  test('fetches one extra row to know whether there is another page', () => {
    expect(pageArgs({ limit: 10, cursorId: null })).toEqual({ take: 11 });
    expect(pageArgs({ limit: 10, cursorId: ID })).toEqual({ take: 11, cursor: { id: ID }, skip: 1 });

    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000` }));
    const { data, page } = buildPage(rows, 10);
    expect(data).toHaveLength(10);
    expect(page).toEqual({ limit: 10, hasMore: true, nextCursor: encodeCursor(rows[9].id) });
    expect(buildPage(rows.slice(0, 3), 10).page).toEqual({ limit: 10, hasMore: false, nextCursor: null });
  });
});

describe('CSV', () => {
  test('quotes commas, quotes and line breaks; writes objects as JSON', () => {
    expect(csvCell('Red Bull, Racing')).toBe('"Red Bull, Racing"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvCell(null)).toBe('');
    expect(csvRow([1, 'x', null])).toBe('1,x,\r\n');
  });

  test('never lets a cell run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell(-3)).toBe('-3'); // a negative number is just a number
  });
});

describe('sessionStatSources (which events each figure came from)', () => {
  const ev = (id, eventType, payload) => ({ id, eventType, payload });
  const events = [
    ev('lap1', 'lap_completed', { lap_time_ms: 95_000, is_pit_out_lap: false }),
    ev('lap2', 'lap_completed', { lap_time_ms: 91_000, is_pit_out_lap: false }),
    ev('lap3', 'lap_completed', { lap_time_ms: 80_000, is_pit_out_lap: true }), // excluded, like the derivation
    ev('lap4', 'lap_completed', { lap_time_ms: null, is_pit_out_lap: false }),
    ev('pit1', 'pit_stop', { pit_duration_ms: 22_000 }),
    ev('grid', 'grid_position', { position: 4 }),
    ev('result', 'classification', { final_position: 1, points: 25 }),
  ];

  test('points at the same events the derivation used', () => {
    expect(sessionStatSources(events)).toEqual({
      fastestLapMs: ['lap2'],
      avgLapMs: ['lap1', 'lap2'],
      totalPitTimeMs: ['pit1'],
      finalPosition: ['result'],
      points: ['result'],
      positionsGained: ['grid', 'result'],
    });
  });

  test('empty sources when the events are missing', () => {
    expect(sessionStatSources([])).toEqual({
      fastestLapMs: [], avgLapMs: [], totalPitTimeMs: [], finalPosition: [], points: [], positionsGained: [],
    });
  });
});
