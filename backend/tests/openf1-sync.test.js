import { jest } from '@jest/globals';

const mockRunDerivation = jest.fn();
const mockPlanIngestion = jest.fn();
const mockSummarizePlan = jest.fn();
const mockPrismaClient = jest.fn();
const mockPrismaPg = jest.fn();

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
  $disconnect: jest.fn(),
};

jest.unstable_mockModule('../src/derivation/index.js', () => ({
  runDerivationForSession: mockRunDerivation,
}));
jest.unstable_mockModule('../src/ingestion/planIngestion.js', () => ({
  planIngestion: mockPlanIngestion,
  summarizePlan: mockSummarizePlan,
}));
jest.unstable_mockModule('@prisma/adapter-pg', () => ({
  PrismaPg: mockPrismaPg,
}));
jest.unstable_mockModule('@prisma/client', () => ({
  default: {
    PrismaClient: mockPrismaClient,
    SubmissionSource: { openf1_sync: 'openf1_sync' },
    SubmissionStatus: {
      accepted: 'accepted',
      rejected: 'rejected',
      partially_accepted: 'partially_accepted',
    },
    EventType: {
      lap_completed: 'lap_completed',
      pit_stop: 'pit_stop',
      tyre_stint: 'tyre_stint',
      position_change: 'position_change',
      flag_event: 'flag_event',
      race_control_message: 'race_control_message',
      weather_snapshot: 'weather_snapshot',
      grid_position: 'grid_position',
      classification: 'classification',
    },
  },
}));

let syncJob;

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
    json: async () => body,
  };
}

function endpoint(url) {
  return new URL(url).pathname.split('/').pop();
}

function setupDimensionMocks() {
  db.circuit.upsert.mockResolvedValue({ id: 'circuit-1' });
  db.meeting.upsert.mockResolvedValue({ id: 'meeting-1', season: 2024 });
  db.session.upsert.mockResolvedValue({
    id: 'session-1',
    type: 'Race',
    startTime: sessionStart,
    endTime: sessionEnd,
  });
  db.team.upsert
    .mockResolvedValueOnce({ id: 'team-1' })
    .mockResolvedValueOnce({ id: 'team-1' });
  db.driver.upsert
    .mockResolvedValueOnce({ id: 'driver-1' })
    .mockResolvedValueOnce({ id: 'driver-11' });
  db.entry.upsert
    .mockResolvedValueOnce({ id: 'entry-1' })
    .mockResolvedValueOnce({ id: 'entry-11' });
}

function setupFetch({ laps = [], sessionName = 'Practice 1' } = {}) {
  const session = { ...sessionData, session_name: sessionName };
  global.fetch.mockImplementation(async (url) => {
    switch (endpoint(url)) {
      case 'sessions':
        return response(new URL(url).searchParams.has('session_key') ? [session] : [
          { session_key: 301, session_name: 'Qualifying' },
        ]);
      case 'meetings':
        return response([meetingData]);
      case 'drivers':
        return response(driversData);
      case 'laps':
        return response(laps);
      default:
        return response([]);
    }
  });
}

beforeAll(async () => {
  mockPrismaClient.mockReturnValue(db);
  syncJob = await import('../src/jobs/openf1-sync.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
    queueMicrotask(callback);
    return 0;
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(globalThis, 'fetch');
  setupDimensionMocks();
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

afterEach(() => {
  jest.restoreAllMocks();
});

describe('OpenF1 sync helper functions', () => {
  test('fetches JSON with query parameters, treats 404 as empty, retries 429, and rejects other errors', async () => {
    global.fetch
      .mockResolvedValueOnce(response([{ id: 1 }]))
      .mockResolvedValueOnce(response({ detail: 'No results found.' }, 404))
      .mockResolvedValueOnce(response({}, 429))
      .mockResolvedValueOnce(response([{ id: 2 }]))
      .mockResolvedValueOnce(response({}, 503));

    await expect(syncJob.fetchOpenF1('laps', { session_key: 300 })).resolves.toEqual([{ id: 1 }]);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.openf1.org/v1/laps?session_key=300'
    );
    await expect(syncJob.fetchOpenF1('pit', { session_key: 300 })).resolves.toEqual([]);
    await expect(syncJob.fetchOpenF1('weather')).resolves.toEqual([{ id: 2 }]);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3000);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 300);
    await expect(syncJob.fetchOpenF1('position')).rejects.toThrow(
      'OpenF1 request failed: https://api.openf1.org/v1/position -> 503'
    );
  });

  test('maps known and unknown session names and flag values', () => {
    expect(syncJob.mapSessionType('Practice 1')).toBe('FP1');
    expect(syncJob.mapSessionType('Practice 2')).toBe('FP2');
    expect(syncJob.mapSessionType('Practice 3')).toBe('FP3');
    expect(syncJob.mapSessionType('Qualifying')).toBe('Q');
    expect(syncJob.mapSessionType('Sprint Qualifying')).toBe('Q');
    expect(syncJob.mapSessionType('Sprint Shootout')).toBe('Q');
    expect(syncJob.mapSessionType('Sprint')).toBe('Sprint');
    expect(syncJob.mapSessionType('Race')).toBe('Race');
    expect(syncJob.mapSessionType('Unknown')).toBe('Q');

    expect(syncJob.mapFlag(null)).toBeNull();
    expect(syncJob.mapFlag('green')).toBe('green');
    expect(syncJob.mapFlag('CLEAR')).toBe('green');
    expect(syncJob.mapFlag('YELLOW')).toBe('yellow');
    expect(syncJob.mapFlag('DOUBLE YELLOW')).toBe('yellow');
    expect(syncJob.mapFlag('RED')).toBe('red');
    expect(syncJob.mapFlag('SAFETY CAR')).toBe('safety_car');
    expect(syncJob.mapFlag('VIRTUAL SAFETY CAR')).toBe('vsc');
    expect(syncJob.mapFlag('CHEQUERED')).toBe('chequered');
    expect(syncJob.mapFlag('BLUE')).toBe('blue');
    expect(syncJob.mapFlag('BLACK AND WHITE')).toBe('black_and_white');
    expect(syncJob.mapFlag('UNKNOWN')).toBeNull();
  });

  test('upserts session dimensions and rejects a missing OpenF1 session', async () => {
    setupFetch();
    const dimensions = await syncJob.syncDimensions('300');

    expect(dimensions).toEqual({
      sessionId: 'session-1',
      season: 2024,
      entryByDriverNumber: new Map([[1, 'entry-1'], [11, 'entry-11']]),
      meetingKey: 100,
      sessionName: 'Practice 1',
      sessionType: 'Race',
      sessionStart,
      sessionEnd,
    });
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

    global.fetch.mockResolvedValue(response([]));
    await expect(syncJob.syncDimensions(999)).rejects.toThrow(
      'No session found for session_key=999'
    );
  });

  test('resolves qualifying grids for races and sprint variants, and skips unavailable grids', async () => {
    global.fetch.mockResolvedValue(response([
      { session_key: 301, session_name: 'Qualifying' },
      { session_key: 300, session_name: 'Race' },
    ]));
    await expect(syncJob.resolveGridSessionKey(100, 'Practice 1')).resolves.toBeNull();
    await expect(syncJob.resolveGridSessionKey(100, 'Race')).resolves.toBe(301);

    global.fetch.mockResolvedValue(response([
      { session_key: 302, session_name: 'Sprint Shootout' },
    ]));
    await expect(syncJob.resolveGridSessionKey(100, 'Sprint')).resolves.toBe(302);

    global.fetch.mockResolvedValue(response([]));
    await expect(syncJob.resolveGridSessionKey(100, 'Race')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  test('collects normalized events and records invalid or unknown driver data', async () => {
    const records = {
      laps: [
        { driver_number: 1, lap_number: 1, lap_duration: 80.1234, duration_sector_1: 25.1, is_pit_out_lap: true },
        { driver_number: 9, lap_number: 2, lap_duration: 80 },
        { driver_number: 1, lap_number: 3, lap_duration: 0 },
      ],
      pit: [
        { driver_number: 1, lap_number: 4, date: '2024-03-02T14:10:00Z', pit_duration: 2.5 },
        { driver_number: 9, lap_number: 4, date: '2024-03-02T14:10:00Z' },
        { driver_number: 1, lap_number: 5, date: '2024-03-02T14:11:00Z', pit_duration: -1 },
      ],
      stints: [
        { driver_number: 1, lap_start: 1, lap_end: 20, compound: 'MEDIUM', stint_number: 1, tyre_age_at_start: 3 },
        { driver_number: 9, lap_start: 1 },
      ],
      position: [
        { driver_number: 1, date: '2024-03-02T14:00:02Z', position: 2 },
        { driver_number: 1, date: '2024-03-02T14:00:01Z', position: 2 },
        { driver_number: 1, date: '2024-03-02T14:00:03Z', position: 1 },
        { driver_number: 9, date: '2024-03-02T14:00:01Z', position: 3 },
      ],
      race_control: [
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
      starting_grid: [
        { driver_number: 1, position: 1 },
        { driver_number: 9, position: 2 },
      ],
      session_result: [
        { driver_number: 1, position: 1, points: 26, dsq: false, dnf: false },
        { driver_number: 11, position: 2, points: 18, dsq: true, dnf: false },
        { driver_number: 9, position: 3, points: 15 },
      ],
    };
    global.fetch.mockImplementation(async (url) => response(records[endpoint(url)] || []));

    const { events, rejections } = await syncJob.collectEvents(
      300,
      new Map([[1, 'entry-1'], [11, 'entry-11']]),
      301,
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
    const gridRequest = global.fetch.mock.calls
      .map(([url]) => new URL(url))
      .find((url) => url.pathname.endsWith('/starting_grid'));
    expect(gridRequest.searchParams.get('session_key')).toBe('301');
  });

  test('does not request starting-grid data when no qualifying key was resolved', async () => {
    global.fetch.mockResolvedValue(response([]));
    const result = await syncJob.collectEvents(300, new Map(), null, {
      sessionStart,
      sessionEnd,
    });
    expect(result).toEqual({ events: [], rejections: [] });
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/starting_grid'),
      expect.anything()
    );
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
    setupFetch({ laps: [validLap, { driver_number: 99, lap_number: 2, lap_duration: 80 }] });
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

    const submission = await syncJob.syncSession('300');

    expect(submission).toMatchObject({ id: 'submission-1', status: 'partially_accepted' });
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
    setupFetch();
    mockPlanIngestion.mockReturnValue({
      insert: [],
      corrections: [],
      unchanged: [],
      duplicates: [],
    });
    tx.submission.create.mockResolvedValue({ id: 'submission-2', status: 'accepted' });

    await syncJob.syncSession(300);

    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'accepted', validationErrors: undefined }),
    });
    expect(tx.event.createMany).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
    expect(mockRunDerivation).not.toHaveBeenCalled();
  });

  test('marks a sync rejected when all collected records are invalid', async () => {
    setupFetch({ laps: [{ driver_number: 99, lap_number: 1, lap_duration: 80 }] });
    tx.submission.create.mockResolvedValue({ id: 'submission-3', status: 'rejected' });

    await syncJob.syncSession(300);

    expect(tx.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'rejected',
        validationErrors: [expect.objectContaining({ eventType: 'lap_completed' })],
      }),
    });
    expect(mockRunDerivation).not.toHaveBeenCalled();
  });
});
