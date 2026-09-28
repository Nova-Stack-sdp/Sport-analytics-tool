/**
 * Public v1 API routes, with the database mocked (same pattern as the other
 * *-api tests): filtering, paging, 400/404 behaviour, the traceability
 * endpoint, and file exports.
 */
import { jest } from '@jest/globals';

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { findMany: jest.fn(), findUnique: jest.fn() },
  entry: { findUnique: jest.fn(), findMany: jest.fn() },
  submission: { findMany: jest.fn() },
  driver: { findMany: jest.fn() },
  team: { findMany: jest.fn() },
  driverSessionStats: { findMany: jest.fn() },
  driverCareerStats: { findMany: jest.fn(), findUnique: jest.fn() },
  teamSeasonStats: { findMany: jest.fn() },
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => jest.clearAllMocks());

const FX = '0967e527-158c-452e-83c0-97c050873684';
const DRV = '11111111-2222-3333-4444-555555555555';
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const driver = { id: DRV, name: 'Lewis Hamilton', driverNumber: 44 };
const team = { id: uuid(900), name: 'Ferrari', season: 2025 };
const eventRow = (n, extra = {}) => ({
  id: uuid(n),
  sessionId: FX,
  eventType: 'lap_completed',
  lapNumber: n,
  occurredAt: new Date(Date.UTC(2025, 5, 1, 13, n)),
  payload: { lap_time_ms: 90_000 + n },
  sourceSubmissionId: uuid(500),
  supersededById: null,
  ingestedAt: new Date('2025-06-02T00:00:00Z'),
  entry: { driver, team },
  ...extra,
});

describe('GET /api/v1/events', () => {
  test('filters, orders oldest first, and returns a cursor when there is more', async () => {
    mockPrisma.event.findMany.mockResolvedValue([eventRow(1), eventRow(2), eventRow(3)]);

    const res = await request(createApp()).get(`/api/v1/events?fixture=${FX}&type=lap_completed&driverNumber=44&limit=2`);

    expect(res.status).toBe(200);
    expect(res.headers['api-version']).toBe('1');
    const args = mockPrisma.event.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      sessionId: FX,
      eventType: { in: ['lap_completed'] },
      entry: { driver: { driverNumber: 44 } },
      supersededById: null,
    });
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([{ occurredAt: 'asc' }, { id: 'asc' }]);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      id: uuid(1), fixtureId: FX, type: 'lap_completed', lap: 1,
      driver: { id: DRV, number: 44, name: 'Lewis Hamilton' },
      submissionId: uuid(500), supersededBy: null,
    }));
    expect(res.body.page.hasMore).toBe(true);

    // Following the cursor asks the database for the rows after the last one returned.
    await request(createApp()).get(`/api/v1/events?limit=2&cursor=${res.body.page.nextCursor}`);
    expect(mockPrisma.event.findMany.mock.calls[1][0]).toEqual(expect.objectContaining({ cursor: { id: uuid(2) }, skip: 1 }));
  });

  test('400 with a per-parameter explanation for bad filters', async () => {
    const res = await request(createApp()).get('/api/v1/events?type=lapp&limit=0&colour=red');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details).sort()).toEqual(['colour', 'limit', 'type']);
    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
  });

  test('400 for a cursor the API never issued', async () => {
    const res = await request(createApp()).get('/api/v1/events?cursor=abc');
    expect(res.status).toBe(400);
    expect(res.body.details.cursor).toMatch(/page\.nextCursor/);
  });
});

describe('GET /api/v1/fixtures', () => {
  test('filters and shapes fixtures with stable ids', async () => {
    mockPrisma.session.findMany.mockResolvedValue([{
      id: FX, type: 'Race', status: 'finished', openf1Key: 7953,
      startTime: new Date('2023-03-05T15:00:00Z'), endTime: null,
      meeting: { id: uuid(1), name: 'Bahrain Grand Prix', season: 2023, circuit: { id: uuid(2), name: 'Sakhir', country: 'Bahrain' } },
    }]);
    const res = await request(createApp()).get('/api/v1/fixtures?season=2023&sessionType=Race');
    expect(mockPrisma.session.findMany.mock.calls[0][0].where).toEqual({ type: 'Race', meeting: { season: 2023 } });
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      id: FX, season: 2023, sessionType: 'Race', externalIds: { openf1SessionKey: 7953 },
    }));
  });

  test('404 for an unknown fixture, 400 for a malformed id', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    expect((await request(createApp()).get(`/api/v1/fixtures/${FX}`)).status).toBe(404);
    expect((await request(createApp()).get('/api/v1/fixtures/123')).status).toBe(400);
  });
});

describe('GET /api/v1/fixtures/:id/statistics/:driverId (traceability)', () => {
  test('returns the figures, which event each came from, and the submission behind them', async () => {
    mockPrisma.entry.findUnique.mockResolvedValue({
      id: uuid(77), sessionId: FX, driver, team,
      sessionStats: { entryId: uuid(77), fastestLapMs: 90_001, avgLapMs: 90_001.5, totalPitTimeMs: 0, positionsGained: null, finalPosition: 1, points: 25 },
    });
    mockPrisma.event.findMany.mockResolvedValue([
      eventRow(1),
      eventRow(2),
      eventRow(3, { eventType: 'classification', lapNumber: null, payload: { final_position: 1, points: 25 } }),
    ]);
    mockPrisma.submission.findMany.mockResolvedValue([
      { id: uuid(500), source: 'openf1_sync', status: 'accepted', submittedAt: new Date('2025-06-02T00:00:00Z') },
    ]);

    const res = await request(createApp()).get(`/api/v1/fixtures/${FX}/statistics/${DRV}`);

    expect(res.status).toBe(200);
    const { statistics, statSources, events, submissions } = res.body.data;
    expect(statistics).toEqual(expect.objectContaining({ points: 25, finalPosition: 1, fastestLapMs: 90_001 }));
    expect(statSources.fastestLapMs).toEqual([uuid(1)]);
    expect(statSources.points).toEqual([uuid(3)]);
    expect(events.map((e) => e.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(submissions).toEqual([expect.objectContaining({ id: uuid(500), source: 'openf1_sync', eventCount: 3 })]);
  });

  test('404 when the driver did not take part', async () => {
    mockPrisma.entry.findUnique.mockResolvedValue(null);
    expect((await request(createApp()).get(`/api/v1/fixtures/${FX}/statistics/${DRV}`)).status).toBe(404);
  });
});

describe('GET /api/v1/statistics/drivers/:driverId/seasons/:season', () => {
  test('breaks the season total into the race results it was summed from', async () => {
    mockPrisma.driverCareerStats.findUnique.mockResolvedValue({ season: 2025, driverId: DRV, driver, points: 43, wins: 1, podiums: 2, dnfCount: 0 });
    mockPrisma.entry.findMany.mockResolvedValue([{
      session: { id: FX, type: 'Race', status: 'finished', startTime: new Date('2025-06-01T13:00:00Z'), meeting: { id: uuid(1), name: 'Canadian Grand Prix', season: 2025, circuit: { id: uuid(2), name: 'Montreal', country: 'Canada' } } },
      events: [{ id: uuid(3), sourceSubmissionId: uuid(500), payload: { final_position: 1, points: 25, status: 'finished' } }],
    }]);
    const res = await request(createApp()).get(`/api/v1/statistics/drivers/${DRV}/seasons/2025`);
    expect(res.status).toBe(200);
    expect(res.body.data.statistics.points).toBe(43);
    expect(res.body.data.results[0]).toEqual(expect.objectContaining({
      classificationEventId: uuid(3), submissionId: uuid(500), points: 25, finalPosition: 1,
    }));
  });
});

describe('GET /api/v1/exports/events', () => {
  test('downloads the filtered events as CSV, paging through the database in batches', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      eventRow(1, { session: { type: 'Race', meeting: { season: 2025, name: 'Canadian Grand Prix, Montreal' } } }),
    ]);
    const res = await request(createApp()).get(`/api/v1/exports/events?season=2025&type=lap_completed`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="events-2025-lap_completed.csv"');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toMatch(/^event_id,fixture_id,season,meeting/);
    expect(lines[1]).toContain('"Canadian Grand Prix, Montreal"');
    expect(mockPrisma.event.findMany.mock.calls[0][0].where).toEqual({
      session: { meeting: { season: 2025 } }, eventType: { in: ['lap_completed'] }, supersededById: null,
    });
  });

  test('JSON format is a valid JSON array', async () => {
    mockPrisma.event.findMany.mockResolvedValue([eventRow(1), eventRow(2)]);
    const res = await request(createApp()).get(`/api/v1/exports/events?fixture=${FX}&format=json`);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(res.text)).toHaveLength(2);
  });

  test('400 for an unsupported format', async () => {
    expect((await request(createApp()).get('/api/v1/exports/events?format=xml')).status).toBe(400);
  });
});

describe('/api/v1 index and unknown paths', () => {
  test('lists endpoints; unknown v1 paths get a helpful 404', async () => {
    const index = await request(createApp()).get('/api/v1');
    expect(index.body.version).toBe(1);
    expect(index.body.endpoints).toContain('GET /api/v1/events');
    const missing = await request(createApp()).get('/api/v1/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.hint).toMatch(/GET \/api\/v1/);
  });
});
