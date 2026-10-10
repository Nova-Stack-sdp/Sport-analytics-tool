import { jest } from '@jest/globals';
import { createOpenF1Client } from '../src/ingestion/openf1/client.js';
import { gridSessionKey, mapOpenF1Records } from '../src/ingestion/openf1/mapEvents.js';
import { STAGES, syncOpenF1Session } from '../src/ingestion/openf1/syncSession.js';

// ---------------------------------------------------------------------------
// The client: concurrent, but never more than the rate limit in any second
// ---------------------------------------------------------------------------

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
}

const okResponse = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

describe('createOpenF1Client', () => {
  test('starts no more than 3 requests in any rolling second, however many are asked for at once', async () => {
    const clock = fakeClock();
    const startedAt = [];
    const client = createOpenF1Client({
      ...clock,
      fetchImpl: async () => {
        startedAt.push(clock.now());
        return okResponse([]);
      },
    });
    await Promise.all(Array.from({ length: 8 }, (_, i) => client.get('laps', { i })));
    expect(startedAt).toHaveLength(8);
    for (let i = 3; i < startedAt.length; i += 1) {
      expect(startedAt[i] - startedAt[i - 3]).toBeGreaterThanOrEqual(1000);
    }
    // 8 requests at 3 a second: the last starts a little after 2 s, not ~4 s
    // as one-after-another with a pause would take.
    expect(startedAt.at(-1)).toBeLessThan(2100);
  });

  test('a 429 is retried with backoff; a 404 is "no results"', async () => {
    const clock = fakeClock();
    const responses = [{ ok: false, status: 429 }, { ok: false, status: 429 }, okResponse([{ lap: 1 }])];
    const client = createOpenF1Client({ ...clock, fetchImpl: async () => responses.shift() });
    await expect(client.get('laps')).resolves.toEqual([{ lap: 1 }]);
    expect(client.stats.retries).toBe(2);

    const empty = createOpenF1Client({ ...clock, fetchImpl: async () => ({ ok: false, status: 404 }) });
    await expect(empty.get('pit')).resolves.toEqual([]);
  });

  test('other failures surface, and response sizes are counted', async () => {
    const clock = fakeClock();
    const failing = createOpenF1Client({ ...clock, fetchImpl: async () => ({ ok: false, status: 500 }) });
    await expect(failing.get('laps')).rejects.toThrow('-> 500');

    const client = createOpenF1Client({ ...clock, fetchImpl: async () => okResponse({ a: 1 }) });
    await client.get('weather');
    expect(client.stats.bytes).toBe(JSON.stringify({ a: 1 }).length);
  });
});

// ---------------------------------------------------------------------------
// The mapping: OpenF1 records -> event rows
// ---------------------------------------------------------------------------

describe('mapOpenF1Records', () => {
  const entries = new Map([[1, 'entry-1'], [16, 'entry-16']]);
  const timing = { sessionStart: new Date('2024-03-02T15:00:00Z'), sessionEnd: new Date('2024-03-02T17:00:00Z') };

  test('every kind of record becomes its event; what cannot be mapped is rejected with a reason', () => {
    const { events, rejections } = mapOpenF1Records(
      {
        laps: [
          { driver_number: 1, lap_number: 1, lap_duration: 97.284, date_start: null },
          { driver_number: 99, lap_number: 1, lap_duration: 98 },
          { driver_number: 16, lap_number: 1, lap_duration: -1 },
        ],
        pits: [{ driver_number: 1, lap_number: 17, pit_duration: 22.4, date: '2024-03-02T15:40:00Z' }],
        stints: [{ driver_number: 1, stint_number: 1, compound: 'SOFT', lap_start: 1, lap_end: 17 }],
        positions: [
          { driver_number: 16, position: 2, date: '2024-03-02T15:01:00Z' },
          { driver_number: 16, position: 2, date: '2024-03-02T15:02:00Z' },
          { driver_number: 16, position: 1, date: '2024-03-02T15:03:00Z' },
        ],
        raceControl: [
          { category: 'Flag', flag: 'GREEN', lap_number: 1, date: '2024-03-02T15:00:00Z' },
          { category: 'Flag', flag: 'PURPLE', lap_number: 2, date: '2024-03-02T15:02:00Z' },
          { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED', lap_number: 5, date: '2024-03-02T15:08:00Z' },
        ],
        weather: [{ air_temperature: 18.4, track_temperature: 23.2, humidity: 46, rainfall: 0, wind_speed: 2, date: '2024-03-02T15:00:00Z' }],
        grid: [{ driver_number: 1, position: 1 }],
        results: [{ driver_number: 1, position: 1, points: 26, dnf: false, dsq: false }],
      },
      entries,
      timing
    );
    const types = events.map((e) => e.eventType);
    expect(types).toEqual([
      'lap_completed', 'pit_stop', 'tyre_stint', 'position_change', 'flag_event',
      'race_control_message', 'weather_snapshot', 'grid_position', 'classification',
    ]);
    expect(events[0]).toMatchObject({ entryId: 'entry-1', occurredAt: timing.sessionStart, payload: { lap_time_ms: 97284 } });
    expect(events[1].payload.exit_time).toBe('2024-03-02T15:40:22.400Z');
    // Position changes only when the position actually changes.
    expect(events[3].payload).toEqual({ from_position: 2, to_position: 1, cause: 'on_track' });
    expect(events[8]).toMatchObject({ occurredAt: timing.sessionEnd, payload: { status: 'finished', points: 26 } });
    expect(rejections.map((r) => r.reason)).toEqual([
      'unknown driver_number 99',
      'lap_duration is not positive',
      'unrecognized flag value "PURPLE"',
    ]);
  });

  test("a race's grid lives under its qualifying session; a sprint's under its shootout", () => {
    const sessions = [
      { session_name: 'Sprint Shootout', session_key: 11 },
      { session_name: 'Qualifying', session_key: 12 },
    ];
    expect(gridSessionKey('Race', sessions)).toBe(12);
    expect(gridSessionKey('Sprint', sessions)).toBe(11);
    expect(gridSessionKey('Practice 1', sessions)).toBeNull();
    expect(gridSessionKey('Race', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The pipeline, against an in-memory OpenF1 and database
// ---------------------------------------------------------------------------

function fakeOpenF1(sessionName = 'Race') {
  const data = {
    'sessions?session_key=9472': [{ session_key: 9472, session_name: sessionName, meeting_key: 1229, country_name: 'Bahrain', date_start: '2024-03-02T15:00:00Z', date_end: '2024-03-02T17:00:00Z' }],
    'meetings?meeting_key=1229': [{ meeting_key: 1229, meeting_name: 'Bahrain Grand Prix', year: 2024, circuit_key: 63, circuit_short_name: 'Sakhir', country_name: 'Bahrain', location: 'Sakhir', date_start: '2024-02-29T00:00:00Z' }],
    'drivers?session_key=9472': [
      { driver_number: 1, full_name: 'Max VERSTAPPEN', team_name: 'Red Bull Racing' },
      { driver_number: 11, full_name: 'Sergio PEREZ', team_name: 'Red Bull Racing' },
    ],
    'sessions?meeting_key=1229': [{ session_name: 'Qualifying', session_key: 9468 }],
    'laps?session_key=9472': [
      { driver_number: 1, lap_number: 1, lap_duration: 97.3, date_start: '2024-03-02T15:03:00Z' },
      { driver_number: 11, lap_number: 1, lap_duration: 98.1, date_start: '2024-03-02T15:03:00Z' },
    ],
    'starting_grid?session_key=9468': [{ driver_number: 1, position: 1 }, { driver_number: 11, position: 2 }],
    'session_result?session_key=9472': [
      { driver_number: 1, position: 1, points: 26 },
      { driver_number: 11, position: 2, points: 18 },
    ],
  };
  const asked = [];
  return {
    asked,
    stats: { bytes: 0 },
    get: async (path, params = {}) => {
      const key = `${path}?${new URLSearchParams(params)}`;
      asked.push(key);
      return data[key] ?? [];
    },
  };
}

function fakePrisma() {
  let id = 0;
  const upsert = jest.fn(async ({ create }) => ({ id: `row-${(id += 1)}`, ...create }));
  const written = [];
  const tx = {
    submission: { create: jest.fn(async ({ data }) => ({ id: 'sub-1', ...data })) },
    event: {
      createMany: jest.fn(async ({ data }) => {
        written.push(...data);
        return { count: data.length };
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    written,
    tx,
    circuit: { upsert },
    meeting: { upsert },
    session: { upsert: jest.fn(async ({ create }) => ({ id: 'session-1', ...create })) },
    team: { upsert },
    driver: { upsert },
    entry: { upsert },
    event: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (work) => work(tx)),
  };
}

describe('syncOpenF1Session', () => {
  test('runs every stage in order for any race, reporting each with its time', async () => {
    const client = fakeOpenF1();
    const prisma = fakePrisma();
    const progress = [];
    const prepareReplay = jest.fn(async () => ({ totalLaps: 1 }));
    const runDerivation = jest.fn(async () => {});

    const result = await syncOpenF1Session(9472, {
      prisma,
      client,
      runDerivation,
      prepareReplay,
      onProgress: (event) => progress.push(event),
    });

    const done = progress.filter((p) => p.state === 'done').map((p) => p.stage);
    expect(done).toEqual(STAGES);
    expect(progress.find((p) => p.stage === 'session' && p.state === 'done').detail).toBe('Bahrain Race · 2 drivers');
    expect(Object.keys(result.timings)).toEqual(STAGES);

    // The grid came from the meeting's qualifying session, as OpenF1 stores it.
    expect(client.asked).toContain('starting_grid?session_key=9468');
    // One team row for the two Red Bull drivers.
    expect(prisma.team.upsert.mock.calls.filter(([a]) => a.where.name_season).length).toBe(1);

    expect(prisma.written.map((e) => e.eventType).sort()).toEqual([
      'classification', 'classification', 'grid_position', 'grid_position', 'lap_completed', 'lap_completed',
    ]);
    expect(result).toMatchObject({ sessionId: 'session-1', changed: true, summary: { inserted: 6 } });
    expect(prepareReplay).toHaveBeenCalledWith('session-1');
    expect(runDerivation).toHaveBeenCalledWith(prisma, 'session-1');
  });

  test('deferred derivation: the race is ready first, the statistics finish after', async () => {
    let finishDerivation;
    const runDerivation = jest.fn(() => new Promise((resolve) => { finishDerivation = resolve; }));
    const progress = [];
    const result = await syncOpenF1Session(9472, {
      prisma: fakePrisma(),
      client: fakeOpenF1(),
      runDerivation,
      deferDerivation: true,
      onProgress: (event) => progress.push(event),
    });
    // Returned — ready — while the derivation is still running.
    expect(result.derivation).toBeInstanceOf(Promise);
    expect(progress.some((p) => p.stage === 'derive' && p.state === 'done')).toBe(false);
    await Promise.resolve();
    finishDerivation();
    await result.derivation;
    expect(progress.at(-1)).toMatchObject({ stage: 'derive', state: 'done' });
  });

  test('a session with nothing new skips the derivation; an unknown session is an error', async () => {
    const prisma = fakePrisma();
    const client = fakeOpenF1('Practice 1');
    const runDerivation = jest.fn();
    // Everything already stored: the plan inserts nothing.
    prisma.event.findMany.mockImplementation(async () => []);
    const first = await syncOpenF1Session(9472, { prisma, client, runDerivation });
    expect(first.changed).toBe(true);
    // Practice has no grid to fetch.
    expect(client.asked.some((k) => k.startsWith('starting_grid'))).toBe(false);

    await expect(
      syncOpenF1Session(1, { prisma: fakePrisma(), client: fakeOpenF1(), runDerivation })
    ).rejects.toThrow('OpenF1 has no session with session_key=1');
    await expect(
      syncOpenF1Session('abc', { prisma: fakePrisma(), client: fakeOpenF1(), runDerivation })
    ).rejects.toThrow('Invalid session_key');
  });
});
