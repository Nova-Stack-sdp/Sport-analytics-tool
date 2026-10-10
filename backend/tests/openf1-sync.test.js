import { jest } from '@jest/globals';

// The OpenF1 sync now lives in src/ingestion/openf1/ (client.js, mapEvents.js,
// syncSession.js); src/jobs/openf1-sync.js is only its command-line entry.
// These cases pin the details of the fetch, the mappings, the dimension
// upserts and the submission status rules. openf1-ingestion.test.js covers
// the rate limiter and the pipeline's stages.

const mockPlanIngestion = jest.fn();
const mockSummarizePlan = jest.fn();

jest.unstable_mockModule('../src/ingestion/planIngestion.js', () => ({
  planIngestion: mockPlanIngestion,
  summarizePlan: mockSummarizePlan,
}));

const { createOpenF1Client } = await import('../src/ingestion/openf1/client.js');
const { gridSessionKey, mapFlag, mapOpenF1Records, mapSessionType } = await import(
  '../src/ingestion/openf1/mapEvents.js'
);
const { syncOpenF1Session } = await import('../src/ingestion/openf1/syncSession.js');

const tx = {
  submission: { create: jest.fn() },
  event: {
    createMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const db = {
  circuit: { upsert: jest.fn() },
  meeting: { upsert: jest.fn() },
  session: { upsert: jest.fn() },
  team: { upsert: jest.fn() },
  driver: { upsert: jest.fn() },
  entry: { upsert: jest.fn() },
  event: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockRunDerivation = jest.fn();

const sessionStart = new Date('2024-03-02T14:00:00.000Z');
const sessionEnd = new Date('2024-03-02T16:00:00.000Z');
const meetingData = {
  meeting_key: 100,
  circuit_key: 200,
  circuit_short_name: 'Bahrain',
  country_name: 'Bahrain',
  location: 'Sakhir',
  year: 2024,
  meeting_name: 'Bahrain Grand Prix',
  date_start: '2024-03-01T00:00:00Z',
};
const sessionData = {
  session_key: 300,
  meeting_key: 100,
  session_name: 'Race',
  date_start: sessionStart.toISOString(),
  date_end: sessionEnd.toISOString(),
};
const driversData = [
  { driver_number: 1, full_name: 'Max VERSTAPPEN', team_name: 'Red Bull Racing' },
  { driver_number: 11, full_name: 'Sergio PEREZ', team_name: 'Red Bull Racing' },
];

function response(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function fakeClock() {
  let t = 0;
  const waits = [];
  return {
    waits,
    now: () => t,
    sleep: async (ms) => {
      waits.push(ms);
      t += ms;
    },
  };
}

// An OpenF1 stand-in for the pipeline: answers by endpoint, records each ask.
function fakeClient({ laps = [], sessionName = 'Practice 1', meetingSessions } = {}) {
  const session = { ...sessionData, session_name: sessionName };
  const asked = [];
  return {
    asked,
    stats: { bytes: 0 },
    get: async (path, params = {}) => {
      asked.push({ path, params });
      switch (path) {
        case 'sessions':
          if ('session_key' in params) return params.session_key === 300 ? [session] : [];
          return meetingSessions ?? [{ session_key: 301, session_name: 'Qualifying' }];
        case 'meetings':
          return [meetingData];
        case 'drivers':
          return driversData;
        case 'laps':
          return laps;
        default:
          return [];
      }
    },
  };
}

function sync(sessionKey, client) {
  return syncOpenF1Session(sessionKey, { prisma: db, client, runDerivation: mockRunDerivation });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.circuit.upsert.mockResolvedValue({ id: 'circuit-1' });
  db.meeting.upsert.mockResolvedValue({ id: 'meeting-1', season: 2024 });
  db.session.upsert.mockResolvedValue({
    id: 'session-1',
    type: 'Race',
    startTime: sessionStart,
    endTime: sessionEnd,
  });
  db.team.upsert.mockResolvedValue({ id: 'team-1' });
  db.driver.upsert.mockImplementation(async ({ where }) => ({ id: `driver-${where.driverNumber}` }));
  db.entry.upsert.mockImplementation(async ({ create }) => ({
    id: create.driverId.replace('driver-', 'entry-'),
  }));
  tx.submission.create.mockResolvedValue({
    id: 'submission-1',
    status: 'partially_accepted',
  });
  tx.event.createMany.mockResolvedValue({ count: 1 });
  tx.event.create.mockResolvedValue({ id: 'corrected-event' });
  tx.event.update.mockResolvedValue({});
  db.event.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((callback) => callback(tx));
  mockRunDerivation.mockResolvedValue(undefined);
  mockPlanIngestion.mockReturnValue({
    insert: [],
    corrections: [],
    unchanged: [],
    duplicates: [],
  });
  mockSummarizePlan.mockImplementation((plan, rejected) => ({
    inserted: plan.insert.length,
    corrected: plan.corrections.length,
    unchanged: plan.unchanged.length,
    duplicatesInBatch: plan.duplicates.length,
    rejected,
  }));
});

describe('OpenF1 sync helper functions', () => {
  test('fetches JSON with query parameters, treats 404 as empty, retries 429, and rejects other errors', async () => {
    const clock = fakeClock();
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response([{ id: 1 }]))
      .mockResolvedValueOnce(response({ detail: 'No results found.' }, 404))
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response([{ id: 2 }]))
      .mockResolvedValueOnce(response({}, 503));
    const client = createOpenF1Client({ ...clock, fetchImpl, retryBaseMs: 600 });

    await expect(client.get('laps', { session_key: 300 })).resolves.toEqual([{ id: 1 }]);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openf1.org/v1/laps?session_key=300');
    await expect(client.get('pit', { session_key: 300 })).resolves.toEqual([]);
    await expect(client.get('weather')).resolves.toEqual([{ id: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(clock.waits).toContain(600);
    expect(client.stats).toMatchObject({ requests: 4, retries: 1 });
    await expect(client.get('position')).rejects.toThrow(
      'OpenF1 request failed: https://api.openf1.org/v1/position -> 503'
    );
  });

  test('gives up on a 429 that outlasts the retries', async () => {
    const clock = fakeClock();
    const fetchImpl = jest.fn(async () => response({}, 429));
    const client = createOpenF1Client({ ...clock, fetchImpl, maxRetries: 2, retryBaseMs: 100 });

    await expect(client.get('laps')).rejects.toThrow('-> 429');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(clock.waits.filter((ms) => ms === 100 || ms === 200)).toEqual([100, 200]);
  });

  test('maps known and unknown session names and flag values', () => {
    expect(mapSessionType('Practice 1')).toBe('FP1');
    expect(mapSessionType('Practice 2')).toBe('FP2');
    expect(mapSessionType('Practice 3')).toBe('FP3');
    expect(mapSessionType('Qualifying')).toBe('Q');
    expect(mapSessionType('Sprint Qualifying')).toBe('Q');
    expect(mapSessionType('Sprint Shootout')).toBe('Q');
    expect(mapSessionType('Sprint')).toBe('Sprint');
    expect(mapSessionType('Race')).toBe('Race');
    expect(mapSessionType('Unknown')).toBe('Q');

    expect(mapFlag(null)).toBeNull();
    expect(mapFlag('green')).toBe('green');
    expect(mapFlag('CLEAR')).toBe('green');
    expect(mapFlag('YELLOW')).toBe('yellow');
    expect(mapFlag('DOUBLE YELLOW')).toBe('yellow');
    expect(mapFlag('RED')).toBe('red');
    expect(mapFlag('SAFETY CAR')).toBe('safety_car');
    expect(mapFlag('VIRTUAL SAFETY CAR')).toBe('vsc');
    expect(mapFlag('CHEQUERED')).toBe('chequered');
    expect(mapFlag('BLUE')).toBe('blue');
    expect(mapFlag('BLACK AND WHITE')).toBe('black_and_white');
    expect(mapFlag('UNKNOWN')).toBeNull();
  });

  test('upserts session dimensions and rejects a missing OpenF1 session', async () => {
    const result = await sync('300', fakeClient());

    expect(result.sessionId).toBe('session-1');
    expect(db.circuit.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { openf1Key: 200 },
      create: expect.objectContaining({ name: 'Bahrain', country: 'Bahrain' }),
    }));
    expect(db.meeting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { openf1Key: 100 },
      create: expect.objectContaining({ circuitId: 'circuit-1', season: 2024 }),
    }));
    expect(db.session.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { openf1Key: 300 },
      create: expect.objectContaining({ meetingId: 'meeting-1', type: 'FP1', status: 'finished' }),
    }));
    expect(db.entry.upsert).toHaveBeenCalledTimes(2);
    expect(db.entry.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { sessionId: 'session-1', driverId: 'driver-11', teamId: 'team-1' },
    }));

    await expect(sync(999, fakeClient())).rejects.toThrow(
      'OpenF1 has no session with session_key=999'
    );
  });

  test('resolves qualifying grids for races and sprint variants, and skips unavailable grids', () => {
    const raceWeekend = [
      { session_key: 301, session_name: 'Qualifying' },
      { session_key: 300, session_name: 'Race' },
    ];
    expect(gridSessionKey('Practice 1', raceWeekend)).toBeNull();
    expect(gridSessionKey('Race', raceWeekend)).toBe(301);

    expect(gridSessionKey('Sprint', [{ session_key: 302, session_name: 'Sprint Shootout' }])).toBe(302);
    expect(gridSessionKey('Sprint', [
      { session_key: 302, session_name: 'Sprint Shootout' },
      { session_key: 303, session_name: 'Sprint Qualifying' },
    ])).toBe(303);

    expect(gridSessionKey('Race', [])).toBeNull();
    expect(gridSessionKey('Race', undefined)).toBeNull();
  });

  test('collects normalized events and records invalid or unknown driver data', () => {
    const records = {
      laps: [
        { driver_number: 1, lap_number: 1, lap_duration: 80.1234, duration_sector_1: 25.1, is_pit_out_lap: true },
        { driver_number: 9, lap_number: 2, lap_duration: 80 },
        { driver_number: 1, lap_number: 3, lap_duration: 0 },
      ],
      pits: [
        { driver_number: 1, lap_number: 4, date: '2024-03-02T14:10:00Z', pit_duration: 2.5 },
        { driver_number: 9, lap_number: 4, date: '2024-03-02T14:10:00Z' },
        { driver_number: 1, lap_number: 5, date: '2024-03-02T14:11:00Z', pit_duration: -1 },
      ],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 20, compound: 'MEDIUM', stint_number: 1, tyre_age_at_start: 3 },
        { driver_number: 9, lap_start: 1 },
      ],
      positions: [
        { driver_number: 1, date: '2024-03-02T14:00:02Z', position: 2 },
        { driver_number: 1, date: '2024-03-02T14:00:01Z', position: 2 },
        { driver_number: 1, date: '2024-03-02T14:00:03Z', position: 1 },
        { driver_number: 9, date: '2024-03-02T14:00:01Z', position: 3 },
      ],
      raceControl: [
        { category: 'Flag', flag: 'GREEN', date: '2024-03-02T14:00:00Z', lap_number: 1 },
        { category: 'Flag', flag: 'UNKNOWN', date: '2024-03-02T14:00:00Z', lap_number: 1 },
        { category: 'Other', message: 'Track clear', date: '2024-03-02T14:00:00Z', lap_number: 1 },
      ],
      weather: [{
        date: '2024-03-02T14:00:00Z',
        air_temperature: 30,
        track_temperature: 45,
        humidity: 50,
        rainfall: 0,
        wind_speed: 3,
      }],
      grid: [
        { driver_number: 1, position: 1 },
        { driver_number: 9, position: 2 },
      ],
      results: [
        { driver_number: 1, position: 1, points: 26, dsq: false, dnf: false },
        { driver_number: 11, position: 2, points: 18, dsq: true, dnf: false },
        { driver_number: 9, position: 3, points: 15 },
      ],
    };

    const { events, rejections } = mapOpenF1Records(
      records,
      new Map([[1, 'entry-1'], [11, 'entry-11']]),
      { sessionStart, sessionEnd }
    );

    expect(events.map((event) => event.eventType)).toEqual([
      'lap_completed',
      'pit_stop',
      'tyre_stint',
      'position_change',
      'flag_event',
      'race_control_message',
      'weather_snapshot',
      'grid_position',
      'classification',
      'classification',
    ]);
    expect(events[0]).toMatchObject({
      entryId: 'entry-1',
      lapNumber: 1,
      occurredAt: sessionStart,
      payload: { lap_time_ms: 80123, sector1_ms: 25100, is_pit_out_lap: true, position: null },
    });
    expect(events[1].payload).toMatchObject({
      pit_duration_ms: 2500,
      entry_time: '2024-03-02T14:10:00.000Z',
      exit_time: '2024-03-02T14:10:02.500Z',
    });
    expect(events[3].payload).toEqual({ from_position: 2, to_position: 1, cause: 'on_track' });
    expect(events[8].payload).toMatchObject({ final_position: 1, points: 26, status: 'finished' });
    expect(events[9].payload).toMatchObject({ final_position: 2, points: 18, status: 'dsq' });
    expect(rejections.map(({ eventType }) => eventType)).toEqual([
      'lap_completed',
      'lap_completed',
      'pit_stop',
      'pit_stop',
      'tyre_stint',
      'position_change',
      'flag_event',
      'grid_position',
      'classification',
    ]);
  });

  test('maps nothing from an empty session', () => {
    expect(mapOpenF1Records({}, new Map(), { sessionStart, sessionEnd })).toEqual({
      events: [],
      rejections: [],
    });
  });

  test('asks for the grid under the qualifying key, and not at all when none was found', async () => {
    const withQualifying = fakeClient({ sessionName: 'Race' });
    await sync(300, withQualifying);
    const gridAsks = withQualifying.asked.filter(({ path }) => path === 'starting_grid');
    expect(gridAsks).toEqual([{ path: 'starting_grid', params: { session_key: 301 } }]);

    const noQualifying = fakeClient({ sessionName: 'Race', meetingSessions: [] });
    await sync(300, noQualifying);
    expect(noQualifying.asked.some(({ path }) => path === 'starting_grid')).toBe(false);
  });
});

describe('OpenF1 session sync', () => {
  test('saves inserts and corrections, reports partial acceptance, and reruns derivation', async () => {
    const validLap = {
      driver_number: 1,
      lap_number: 1,
      lap_duration: 80,
      date_start: '2024-03-02T14:01:00Z',
    };
    const insertEvent = {
      entryId: 'entry-1',
      eventType: 'lap_completed',
      lapNumber: 2,
      occurredAt: new Date('2024-03-02T14:02:00Z'),
      payload: { lap_time_ms: 81000 },
    };
    const correctionEvent = { ...insertEvent, lapNumber: 3 };
    const client = fakeClient({ laps: [validLap, { driver_number: 99, lap_number: 2, lap_duration: 80 }] });
    db.event.findMany.mockResolvedValue([{
      id: 'old-event',
      eventType: 'lap_completed',
      entryId: 'entry-1',
      lapNumber: 3,
      occurredAt: correctionEvent.occurredAt,
      payload: { lap_time_ms: 82000 },
      ingestedAt: sessionEnd,
    }]);
    mockPlanIngestion.mockReturnValue({
      insert: [insertEvent],
      corrections: [{ event: correctionEvent, supersedesId: 'old-event' }],
      unchanged: [insertEvent],
      duplicates: [],
    });

    const result = await sync('300', client);

    expect(result.submission).toMatchObject({ id: 'submission-1', status: 'partially_accepted' });
    expect(result.changed).toBe(true);
    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'openf1_sync',
        submitterId: null,
        sessionId: 'session-1',
        status: 'partially_accepted',
        validationErrors: expect.arrayContaining([
          expect.objectContaining({ reason: 'unknown driver_number 99' }),
        ]),
        summary: expect.objectContaining({
          inserted: 1,
          corrected: 1,
          unchanged: 1,
          rejected: 1,
        }),
      }),
    });
    expect(tx.event.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        sessionId: 'session-1',
        sourceSubmissionId: 'submission-1',
        lapNumber: 2,
      })],
    });
    expect(tx.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session-1',
        sourceSubmissionId: 'submission-1',
        lapNumber: 3,
      }),
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'old-event' },
      data: { supersededById: 'corrected-event' },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 15000,
      timeout: 60000,
    });
    expect(mockRunDerivation).toHaveBeenCalledWith(db, 'session-1');
  });

  test('marks an empty clean sync accepted and skips derivation when there are no changes', async () => {
    tx.submission.create.mockResolvedValue({ id: 'submission-2', status: 'accepted' });

    const result = await sync(300, fakeClient());

    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'accepted', validationErrors: undefined }),
    });
    expect(tx.event.createMany).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(result.changed).toBe(false);
    expect(mockRunDerivation).not.toHaveBeenCalled();
  });

  test('marks a sync rejected when all collected records are invalid', async () => {
    tx.submission.create.mockResolvedValue({ id: 'submission-3', status: 'rejected' });

    await sync(300, fakeClient({ laps: [{ driver_number: 99, lap_number: 1, lap_duration: 80 }] }));

    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'rejected',
        validationErrors: [expect.objectContaining({ eventType: 'lap_completed' })],
      }),
    });
    expect(mockRunDerivation).not.toHaveBeenCalled();
  });
});
