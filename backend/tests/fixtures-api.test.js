import { jest } from '@jest/globals';

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  driverSessionStats: { count: jest.fn() },
};

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.event.count.mockResolvedValue(0);
});

const SESSION = {
  id: 's1',
  type: 'Race',
  status: 'finished',
  startTime: '2024-03-02T15:00:00.000Z',
  meeting: { name: 'Bahrain Grand Prix', season: 2024, circuit: { name: 'Sakhir', country: 'Bahrain' } },
};
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const E3 = '33333333-3333-4333-8333-333333333333';

describe('GET /api/fixtures', () => {
  test('flags a fixture as corrected when it has a superseded event', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 's1',
        type: 'Race',
        startTime: '2024-03-02T15:00:00.000Z',
        status: 'finished',
        meeting: { name: 'Bahrain Grand Prix', season: 2024, circuit: { name: 'Sakhir', country: 'Bahrain' } },
      },
      {
        id: 's2',
        type: 'Q',
        startTime: '2023-03-03T15:00:00.000Z',
        status: 'finished',
        meeting: { name: 'Australian Grand Prix', season: 2023, circuit: { name: 'Albert Park', country: 'Australia' } },
      },
    ]);
    mockPrisma.event.groupBy.mockResolvedValue([{ sessionId: 's1', _count: { _all: 1 } }]);

    const app = createApp();
    const res = await request(app).get('/api/fixtures');

    expect(res.status).toBe(200);
    expect(res.body.fixtures.find((f) => f.id === 's1').hasCorrections).toBe(true);
    expect(res.body.fixtures.find((f) => f.id === 's2').hasCorrections).toBe(false);
  });

  test('reports how many current events each fixture has', async () => {
    mockPrisma.session.findMany.mockResolvedValue([SESSION, { ...SESSION, id: 's2' }]);
    mockPrisma.event.groupBy.mockImplementation(({ by, where }) => {
      if (by.length === 1 && where.supersededById === null) {
        return Promise.resolve([{ sessionId: 's1', _count: { _all: 1520 } }]);
      }
      return Promise.resolve([]);
    });
    const res = await request(createApp()).get('/api/fixtures');
    expect(res.body.fixtures.map((f) => f.eventCount)).toEqual([1520, 0]);
  });

  test('flags replayReady only for a fixture with laps, position changes, and a classification', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 's1', // has all three required types
        type: 'Race',
        startTime: '2024-03-02T15:00:00.000Z',
        status: 'finished',
        meeting: { name: 'Bahrain Grand Prix', season: 2024, circuit: { name: 'Sakhir', country: 'Bahrain' } },
      },
      {
        id: 's2', // never synced — missing all three
        type: 'Race',
        startTime: '2023-03-03T15:00:00.000Z',
        status: 'finished',
        meeting: { name: 'Australian Grand Prix', season: 2023, circuit: { name: 'Albert Park', country: 'Australia' } },
      },
    ]);
    // The route makes two separate event.groupBy calls (corrections — by
    // sessionId alone — then event-type coverage — by sessionId+eventType).
    // Distinguish them by the shape of `by` rather than call order.
    mockPrisma.event.groupBy.mockImplementation(({ by }) => {
      if (by.length === 1) {
        return Promise.resolve([]); // no corrections in this test
      }
      return Promise.resolve([
        { sessionId: 's1', eventType: 'lap_completed' },
        { sessionId: 's1', eventType: 'position_change' },
        { sessionId: 's1', eventType: 'classification' },
      ]);
    });

    const app = createApp();
    const res = await request(app).get('/api/fixtures');

    expect(res.status).toBe(200);
    expect(res.body.fixtures.find((f) => f.id === 's1').replayReady).toBe(true);
    expect(res.body.fixtures.find((f) => f.id === 's2').replayReady).toBe(false);
  });
});

describe('GET /api/fixtures/:sessionId/events', () => {
  test('returns 404 for an unknown fixture', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/fixtures/unknown/events');

    expect(res.status).toBe(404);
  });

  test('returns the current event log in race order, with details and correction flags', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: E1, eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z',
        payload: { lap_time_ms: 95123 }, supersededById: null, supersedes: null,
        entry: { driver: { name: 'Max VERSTAPPEN' } },
      },
      {
        id: E2, eventType: 'flag_event', lapNumber: 2, occurredAt: '2024-03-02T15:06:00.000Z',
        payload: { flag: 'YELLOW' }, supersededById: null, supersedes: { id: E3 }, entry: null,
      },
    ]);
    mockPrisma.event.count.mockResolvedValue(2);
    mockPrisma.driverSessionStats.count.mockResolvedValue(20);

    const res = await request(createApp()).get('/api/fixtures/s1/events');

    expect(res.status).toBe(200);
    expect(res.body.derivedStatsCount).toBe(20);
    expect(res.body.session).toMatchObject({ id: 's1', season: 2024, country: 'Bahrain', type: 'Race' });
    expect(res.body.events).toEqual([
      { id: E1, eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z', driverName: 'Max VERSTAPPEN',
        payload: { lap_time_ms: 95123 }, isCorrection: false, superseded: false },
      { id: E2, eventType: 'flag_event', lapNumber: 2, occurredAt: '2024-03-02T15:06:00.000Z', driverName: null,
        payload: { flag: 'YELLOW' }, isCorrection: true, superseded: false },
    ]);
    expect(res.body.page).toEqual({ total: 2, nextCursor: null });
    const args = mockPrisma.event.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ sessionId: 's1', supersededById: null });
    expect(args.orderBy).toEqual([{ occurredAt: 'asc' }, { id: 'asc' }]);
    expect(args.take).toBe(201);
  });

  test('pages through the log with a cursor instead of silently stopping at 200', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    const row = (id) => ({ id, eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z', payload: {}, supersededById: null, supersedes: null, entry: null });
    mockPrisma.event.findMany.mockResolvedValue([row(E1), row(E2), row(E3)]);
    mockPrisma.event.count.mockResolvedValue(9);

    const res = await request(createApp()).get(`/api/fixtures/s1/events?limit=2&cursor=${E3}`);

    expect(res.body.events.map((e) => e.id)).toEqual([E1, E2]);
    expect(res.body.page).toEqual({ total: 9, nextCursor: E2 });
    expect(mockPrisma.event.findMany.mock.calls[0][0]).toMatchObject({ take: 3, cursor: { id: E3 }, skip: 1 });
  });

  test('filters by event type and can include replaced versions', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    mockPrisma.event.findMany.mockResolvedValue([]);
    await request(createApp()).get('/api/fixtures/s1/events?type=pit_stop&includeSuperseded=true');
    const { where } = mockPrisma.event.findMany.mock.calls[0][0];
    expect(where.eventType).toBe('pit_stop');
    expect(where).not.toHaveProperty('supersededById');
    expect(mockPrisma.event.count).toHaveBeenCalledWith({ where });
  });

  test.each([
    ['type=bogus', /type must be one of/],
    ['limit=0', /limit must be/],
    ['limit=501', /limit must be/],
    ['limit=abc', /limit must be/],
    ['cursor=not-an-id', /cursor must be/],
  ])('rejects %s with 400', async (query, message) => {
    const res = await request(createApp()).get(`/api/fixtures/s1/events?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/fixtures error handling', () => {
  test('returns 500 when listing fixtures fails', async () => {
    mockPrisma.session.findMany.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/fixtures');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('returns 500 when fetching fixture events fails', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 's1',
      type: 'Race',
      status: 'finished',
      startTime: '2024-03-02T15:00:00.000Z',
      meeting: { name: 'Bahrain Grand Prix', circuit: { name: 'Sakhir' } },
    });
    mockPrisma.event.findMany.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/fixtures/s1/events');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});