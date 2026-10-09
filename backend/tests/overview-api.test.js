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
  meeting: { findFirst: jest.fn(), findMany: jest.fn() },
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
  mockPrisma.meeting.findMany.mockResolvedValue([]);
  mockPrisma.session.findFirst.mockResolvedValue(null);
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.submission.findMany.mockResolvedValue([]);
  mockPrisma.driverCareerStats.findMany.mockResolvedValue([]);
  mockPrisma.teamSeasonStats.findMany.mockResolvedValue([]);
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
        seasonsCovered: 0,
        pendingSubmissions: 0,
        lastDataUpdate: null,
      },
      season: null,
      latestSession: null,
      recentEvents: [],
      leaderboard: [],
      teamComparison: [],
      recentUpdates: [],
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
      expect.objectContaining({
        where: { season: 2026 },
        orderBy: [{ points: 'desc' }, { wins: 'desc' }, { podiums: 'desc' }],
      })
    );
  });

  test('returns recent events from the latest session', async () => {
    baseMocks();
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 's1',
      type: 'Race',
      status: 'finished',
      startTime: '2024-03-02T15:00:00.000Z',
      meeting: { name: 'Bahrain Grand Prix', circuit: { name: 'Sakhir', country: 'Bahrain' } },
    });
    mockPrisma.event.findMany.mockResolvedValue([
      { id: 'e1', eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z', entry: { driver: { name: 'Lando Norris' } } },
      { id: 'e2', eventType: 'flag_event', lapNumber: null, occurredAt: '2024-03-02T15:04:00.000Z', entry: null },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body.latestSession).toMatchObject({ id: 's1', meetingName: 'Bahrain Grand Prix' });
    expect(res.body.recentEvents).toEqual([
      { id: 'e1', eventType: 'lap_completed', lapNumber: 1, occurredAt: '2024-03-02T15:05:00.000Z', driverName: 'Lando Norris' },
      { id: 'e2', eventType: 'flag_event', lapNumber: null, occurredAt: '2024-03-02T15:04:00.000Z', driverName: null },
    ]);
  });

  test('counts distinct seasons instead of repeating the fixture count', async () => {
    baseMocks();
    mockPrisma.session.count.mockResolvedValue(42);
    mockPrisma.meeting.findMany.mockResolvedValue([{ season: 2024 }, { season: 2025 }]);
    const res = await request(createApp()).get('/api/overview');
    expect(res.body.stats).toMatchObject({ fixturesTracked: 42, seasonsCovered: 2 });
    expect(mockPrisma.meeting.findMany).toHaveBeenCalledWith({ distinct: ['season'], select: { season: true } });
  });

  test('recent updates are published race data, newest publication first, with the session they cover', async () => {
    baseMocks();
    const sync = {
      id: 'sync-1', source: 'openf1_sync', status: 'accepted', submittedAt: '2026-10-01T10:00:00.000Z', reviewedAt: null,
      summary: { inserted: 312, corrected: 2 },
      session: { id: 's9', type: 'Race', meeting: { name: 'Singapore Grand Prix' } },
    };
    const upload = {
      id: 'up-1', source: 'manual_upload', status: 'accepted', submittedAt: '2026-09-01T10:00:00.000Z', reviewedAt: '2026-10-05T08:00:00.000Z',
      summary: null,
      session: { id: 's8', type: 'Sprint', meeting: { name: 'Baku Grand Prix' } },
    };
    mockPrisma.submission.findMany
      .mockResolvedValueOnce([sync, upload])
      .mockResolvedValueOnce([upload]);

    const res = await request(createApp()).get('/api/overview');

    expect(res.body.recentUpdates).toEqual([
      { id: 'up-1', source: 'manual_upload', status: 'accepted', publishedAt: '2026-10-05T08:00:00.000Z',
        session: { id: 's8', type: 'Sprint', meetingName: 'Baku Grand Prix' }, eventsAdded: null, eventsCorrected: null },
      { id: 'sync-1', source: 'openf1_sync', status: 'accepted', publishedAt: '2026-10-01T10:00:00.000Z',
        session: { id: 's9', type: 'Race', meetingName: 'Singapore Grand Prix' }, eventsAdded: 312, eventsCorrected: 2 },
    ]);
    expect(res.body.stats.lastDataUpdate).toBe('2026-10-05T08:00:00.000Z');
    const [bySubmitted, byReviewed] = mockPrisma.submission.findMany.mock.calls.map(([args]) => args.where);
    expect(bySubmitted).toEqual({ deletedAt: null, status: { in: ['accepted', 'partially_accepted'] }, purpose: 'race_data' });
    expect(byReviewed).toMatchObject({ reviewedAt: { not: null }, purpose: 'race_data' });
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
