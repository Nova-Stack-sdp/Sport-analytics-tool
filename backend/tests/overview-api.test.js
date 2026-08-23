/**
 * Contract test for GET /api/overview.
 *
 * Mocks the Prisma client singleton (../src/lib/prisma.js) so this runs
 * without a live database — same spirit as signin-auth.test.js mocking its
 * dependency container, just for a Prisma-backed route instead.
 */
import { jest } from '@jest/globals';

const mockPrisma = {
  session: { count: jest.fn(), findFirst: jest.fn() },
  submission: { count: jest.fn(), findMany: jest.fn() },
  event: { count: jest.fn(), findMany: jest.fn() },
  meeting: { findFirst: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
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

function baseMocks() {
  mockPrisma.session.count.mockResolvedValue(0);
  mockPrisma.submission.count.mockResolvedValue(0);
  mockPrisma.event.count.mockResolvedValue(0);
  mockPrisma.meeting.findFirst.mockResolvedValue(null);
  mockPrisma.session.findFirst.mockResolvedValue(null);
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.submission.findMany.mockResolvedValue([]);
}

describe('GET /api/overview', () => {
  test('returns a well-formed empty response when the database has no data', async () => {
    baseMocks();
    const app = createApp();

    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      stats: {
        fixturesTracked: 0,
        sessionsFinished: 0,
        pendingSubmissions: 0,
        eventsLast24h: 0,
      },
      season: null,
      latestSession: null,
      recentEvents: [],
      leaderboard: [],
      teamComparison: [],
      submissionQueue: [],
    });
  });

  test('scopes leaderboard and team comparison to the most recent season', async () => {
    baseMocks();
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2026 });
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      {
        driverId: 'd1',
        points: 186,
        wins: 5,
        podiums: 8,
        driver: { name: 'Max Verstappen', driverNumber: 1 },
      },
    ]);
    mockPrisma.teamSeasonStats.findMany.mockResolvedValue([
      {
        teamId: 't1',
        points: 286,
        wins: 6,
        reliabilityRate: 0.94,
        team: { name: 'Red Bull Racing' },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body.season).toBe(2026);
    expect(res.body.leaderboard).toEqual([
      { driverId: 'd1', name: 'Max Verstappen', driverNumber: 1, points: 186, wins: 5, podiums: 8 },
    ]);
    expect(res.body.teamComparison).toEqual([
      { teamId: 't1', name: 'Red Bull Racing', points: 286, wins: 6, reliabilityRate: 0.94 },
    ]);
    expect(mockPrisma.driverCareerStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { season: 2026 } })
    );
  });

  test('returns 500 with a generic message if the database query fails', async () => {
    baseMocks();
    mockPrisma.session.count.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});