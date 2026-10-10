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
  teamSeasonStats: { findMany: jest.fn() },
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
        team: { id: 't1', name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 78402 },
        session: { type: 'Race', startTime: '2024-03-02T15:00:00.000Z' },
      },
      {
        driverId: 'd1',
        team: { id: 't1', name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 77000 },
        session: { type: 'Q', startTime: '2024-03-01T15:00:00.000Z' },
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
        teamId: 't1',
        teamName: 'Red Bull Racing',
        teamColor: '#3671C6',
        teamCode: 'RBR',
        points: 26,
        wins: 1,
        podiums: 1,
        fastestLapMs: 77000,
        racesCount: 1, // the qualifying session is not a race
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
        team: { id: 't0', name: 'Red Bull Racing' },
        sessionStats: { fastestLapMs: 79000 },
        session: { type: 'Race', startTime: '2023-03-05T00:00:00.000Z' },
      },
      {
        driverId: 'd1',
        team: { id: 't1', name: 'Oracle Red Bull Racing' },
        sessionStats: { fastestLapMs: 78402 },
        session: { type: 'Sprint', startTime: '2024-03-02T00:00:00.000Z' },
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
        teamId: 't1', // the most recent team
        teamName: 'Oracle Red Bull Racing',
        teamColor: '#3671C6',
        teamCode: 'RBR',
        fastestLapMs: 78402,
        racesCount: 2,
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
    expect(res.body.availableSessions).toEqual([{ id: 's1', label: 'Bahrain Grand Prix 2024 · Race', season: 2024, type: 'Race' }]);
    expect(mockPrisma.session.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(res.body.rows[0]).toMatchObject({ teamColor: '#3671C6', teamCode: 'RBR' });
  });

  test('fixture view: an unknown session is a 404, not an empty table', async () => {
    mockPrisma.session.findMany.mockResolvedValue([{ id: 's1', meeting: { name: 'X', season: 2024 }, type: 'Race' }]);
    const res = await request(createApp()).get('/api/statistics?view=fixture&sessionId=nope');
    expect(res.status).toBe(404);
  });

  test('season view: ties are broken by wins, then podiums', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([{ season: 2024 }]);
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      { driverId: 'a', points: 50, wins: 0, podiums: 3, driver: { name: 'A' } },
      { driverId: 'b', points: 50, wins: 1, podiums: 1, driver: { name: 'B' } },
      { driverId: 'c', points: 60, wins: 0, podiums: 0, driver: { name: 'C' } },
    ]);
    mockPrisma.entry.findMany.mockResolvedValue([]);
    const res = await request(createApp()).get('/api/statistics?view=season&season=2024');
    expect(res.body.rows.map((r) => r.driverId)).toEqual(['c', 'b', 'a']);
  });

  test('constructors view: team standings for a season, with colours and reliability', async () => {
    mockPrisma.meeting.findMany.mockResolvedValue([{ season: 2025 }, { season: 2024 }]);
    mockPrisma.teamSeasonStats.findMany.mockResolvedValue([
      { teamId: 't2', points: 400, wins: 4, reliabilityRate: 0.9, team: { id: 't2', name: 'Ferrari' } },
      { teamId: 't1', points: 600, wins: 10, reliabilityRate: 0.95, team: { id: 't1', name: 'McLaren' } },
    ]);
    const res = await request(createApp()).get('/api/statistics?view=constructors');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ view: 'constructors', season: 2025, availableSeasons: [2025, 2024] });
    expect(res.body.rows).toEqual([
      { teamId: 't1', teamName: 'McLaren', teamColor: '#FF8000', teamCode: 'MCL', name: 'McLaren', points: 600, wins: 10, reliabilityRate: 0.95 },
      { teamId: 't2', teamName: 'Ferrari', teamColor: '#E8002D', teamCode: 'FER', name: 'Ferrari', points: 400, wins: 4, reliabilityRate: 0.9 },
    ]);
    expect(mockPrisma.teamSeasonStats.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { season: 2025 } }));
  });

  test.each([
    ['view=bogus', /view must be one of/],
    ['view=season&season=abc', /season must be a year/],
    ['view=constructors&season=1800', /season must be a year/],
  ])('rejects %s with 400', async (query, message) => {
    const res = await request(createApp()).get(`/api/statistics?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
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
