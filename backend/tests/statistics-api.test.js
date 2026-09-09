/**
 * Contract test for GET /api/statistics. Mocks Prisma the same way
 * overview-api.test.js does.
 */
import { jest } from '@jest/globals';

const mockPrisma = {
  meeting: { findMany: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
  entry: { findMany: jest.fn() },
  session: { findMany: jest.fn() },
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

describe('GET /api/statistics', () => {
  test('season view defaults to the most recent season and enriches with team/fastest lap', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([{ season: 2024 }, { season: 2023 }]);
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      { driverId: 'd1', points: 26, wins: 1, podiums: 1, driver: { name: 'Max VERSTAPPEN' } },
    ]);
    mockPrisma.entry.findMany.mockResolvedValue([
      {
        driverId: 'd1',
        team: { name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 78402 },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/statistics?view=season');

    expect(res.status).toBe(200);
    expect(res.body.season).toBe(2024);
    expect(res.body.availableSeasons).toEqual([2024, 2023]);
    expect(res.body.rows).toEqual([
      {
        driverId: 'd1',
        name: 'Max VERSTAPPEN',
        teamName: 'Red Bull Racing',
        points: 26,
        wins: 1,
        podiums: 1,
        fastestLapMs: 78402,
        fixturesCount: 1,
      },
    ]);
  });

  test('career view sums points across multiple seasons for the same driver', async () => {
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      { driverId: 'd1', season: 2023, points: 20, wins: 1, podiums: 1, driver: { name: 'Max VERSTAPPEN' } },
      { driverId: 'd1', season: 2024, points: 26, wins: 1, podiums: 1, driver: { name: 'Max VERSTAPPEN' } },
    ]);
    mockPrisma.entry.findMany.mockResolvedValue([
      {
        driverId: 'd1',
        team: { name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 79000 },
        session: { startTime: '2023-03-05T00:00:00.000Z' },
      },
      {
        driverId: 'd1',
        team: { name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 78402 },
        session: { startTime: '2024-03-02T00:00:00.000Z' },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/statistics?view=career');

    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([
      {
        driverId: 'd1',
        name: 'Max VERSTAPPEN',
        points: 46,
        wins: 2,
        podiums: 2,
        seasonsCount: 2,
        teamName: 'Red Bull Racing',
        fastestLapMs: 78402,
        fixturesCount: 2,
      },
    ]);
  });

  test('fixture view returns per-driver results for a session, sorted by finishing position', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 's1',
        meeting: { name: 'Bahrain Grand Prix', season: 2024 },
        type: 'Race',
      },
    ]);
    mockPrisma.entry.findMany.mockResolvedValue([
      {
        driverId: 'd2',
        driver: { name: 'Sergio PEREZ' },
        team: { name: 'Red Bull Racing' },
        sessionStats: { finalPosition: 2, points: 18, fastestLapMs: 79500, avgLapMs: 81000, totalPitTimeMs: 2400, positionsGained: 1 },
      },
      {
        driverId: 'd1',
        driver: { name: 'Max VERSTAPPEN' },
        team: { name: 'Red Bull Racing' },
        sessionStats: { finalPosition: 1, points: 26, fastestLapMs: 78402, avgLapMs: 80000, totalPitTimeMs: 2200, positionsGained: 0 },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/statistics?view=fixture&sessionId=s1');

    expect(res.status).toBe(200);
    expect(res.body.sessionLabel).toBe('Bahrain Grand Prix 2024 · Race');
    expect(res.body.rows.map((r) => r.driverId)).toEqual(['d1', 'd2']); // sorted by position
  });
});

describe('GET /api/statistics error handling', () => {
  test('returns 500 when the query fails', async () => {
    mockPrisma.meeting.findMany.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/statistics?view=season');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
