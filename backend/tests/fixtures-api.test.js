import { jest } from '@jest/globals';

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { groupBy: jest.fn(), findMany: jest.fn() },
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
});

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
});

describe('GET /api/fixtures/:sessionId/events', () => {
  test('returns 404 for an unknown fixture', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/fixtures/unknown/events');

    expect(res.status).toBe(404);
  });

  test('returns the chronological event log with driver names and correction flags', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 's1',
      type: 'Race',
      status: 'finished',
      startTime: '2024-03-02T15:00:00.000Z',
      meeting: { name: 'Bahrain Grand Prix', circuit: { name: 'Sakhir' } },
    });
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'e1',
        eventType: 'lap_completed',
        lapNumber: 1,
        occurredAt: '2024-03-02T15:05:00.000Z',
        supersededById: null,
        entry: { driver: { name: 'Max VERSTAPPEN' } },
      },
      {
        id: 'e2',
        eventType: 'flag_event',
        lapNumber: 2,
        occurredAt: '2024-03-02T15:06:00.000Z',
        supersededById: 'e3',
        entry: null,
      },
    ]);
    mockPrisma.driverSessionStats.count.mockResolvedValue(20);

    const app = createApp();
    const res = await request(app).get('/api/fixtures/s1/events');

    expect(res.status).toBe(200);
    expect(res.body.derivedStatsCount).toBe(20);
    expect(res.body.events).toEqual([
      { id: 'e1', eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z', driverName: 'Max VERSTAPPEN', corrected: false },
      { id: 'e2', eventType: 'flag_event', lapNumber: 2, occurredAt: '2024-03-02T15:06:00.000Z', driverName: null, corrected: true },
    ]);
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
