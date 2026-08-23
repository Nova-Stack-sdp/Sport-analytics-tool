import { jest } from '@jest/globals';

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn() },
  submission: { findMany: jest.fn() },
  entry: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { findMany: jest.fn() },
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

describe('GET /api/timetravel/context', () => {
  test('returns checkpoints from real submission history and entries for the driver selector', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: 's1', type: 'Race', meeting: { name: 'Bahrain Grand Prix', season: 2023 } },
    ]);
    mockPrisma.submission.findMany.mockResolvedValue([
      { id: 'sub1', submittedAt: '2026-08-15T12:59:10.000Z', status: 'accepted', source: 'openf1_sync' },
      { id: 'sub2', submittedAt: '2026-08-19T00:41:19.000Z', status: 'accepted', source: 'openf1_sync' },
    ]);
    mockPrisma.entry.findMany.mockResolvedValue([
      { id: 'e1', driverId: 'd1', driver: { name: 'Max VERSTAPPEN' } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/timetravel/context?sessionId=s1');

    expect(res.status).toBe(200);
    expect(res.body.checkpoints).toHaveLength(2);
    expect(res.body.entries).toEqual([{ entryId: 'e1', driverId: 'd1', name: 'Max VERSTAPPEN' }]);
  });
});

describe('GET /api/timetravel/changelog', () => {
  test('returns 400 without entryId', async () => {
    const app = createApp();
    const res = await request(app).get('/api/timetravel/changelog');
    expect(res.status).toBe(400);
  });

  test('returns classification history in ingestion order, flagging corrected entries', async () => {
    mockPrisma.entry.findUnique.mockResolvedValue({
      id: 'e1',
      driver: { name: 'Max VERSTAPPEN' },
      team: { name: 'Red Bull Racing' },
    });
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: 'ev1',
        occurredAt: '2026-08-15T13:00:00.000Z',
        ingestedAt: '2026-08-15T13:01:00.000Z',
        payload: { final_position: 1, points: 25 },
        supersededById: 'ev2',
      },
      {
        id: 'ev2',
        occurredAt: '2026-08-19T00:41:00.000Z',
        ingestedAt: '2026-08-19T00:41:19.000Z',
        payload: { final_position: 1, points: 26 },
        supersededById: null,
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/timetravel/changelog?entryId=e1');

    expect(res.status).toBe(200);
    expect(res.body.history[0]).toMatchObject({ isOriginal: true, wasCorrectedLater: true });
    expect(res.body.history[1]).toMatchObject({ isOriginal: false, wasCorrectedLater: false });
  });
});

describe('GET /api/timetravel/asof', () => {
  test('includes an event whose own submission was submitted exactly at the cutoff', async () => {
    // Regression test: ingestedAt and submittedAt can round to different
    // milliseconds after serialization even when written in the same
    // transaction — the filter must key off submittedAt on both sides so
    // an event isn't excluded from its own checkpoint.
    mockPrisma.event.findMany.mockResolvedValue([
      {
        eventType: 'classification',
        payload: { final_position: 2, points: 18 },
        sourceSubmission: { submittedAt: '2026-08-19T01:26:32.172Z' },
        supersededBy: null,
      },
    ]);

    const app = createApp();
    const res = await request(app).get(
      '/api/timetravel/asof?sessionId=s1&entryId=e1&date=2026-08-19T01:26:32.172Z'
    );

    expect(res.status).toBe(200);
    expect(res.body.stats.points).toBe(18);
  });

  test('excludes events from submissions submitted after the cutoff, and excludes events superseded before it', async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        eventType: 'classification',
        payload: { final_position: 1, points: 25 },
        sourceSubmission: { submittedAt: '2026-08-15T13:01:00.000Z' },
        supersededBy: { sourceSubmission: { submittedAt: '2026-08-19T00:41:19.000Z' } },
      },
      {
        eventType: 'classification',
        payload: { final_position: 1, points: 26 },
        sourceSubmission: { submittedAt: '2026-08-19T00:41:19.000Z' },
        supersededBy: null,
      },
    ]);

    const app = createApp();

    // As of a date before the correction landed: only the original event
    // should be live, so points should read 25.
    const resBefore = await request(app).get(
      '/api/timetravel/asof?sessionId=s1&entryId=e1&date=2026-08-16T00:00:00.000Z'
    );
    expect(resBefore.status).toBe(200);
    expect(resBefore.body.stats.points).toBe(25);

    // As of a date after the correction: the corrected value should show.
    const resAfter = await request(app).get(
      '/api/timetravel/asof?sessionId=s1&entryId=e1&date=2026-08-20T00:00:00.000Z'
    );
    expect(resAfter.body.stats.points).toBe(26);
  });

  test('returns 400 for a malformed date', async () => {
    const app = createApp();
    const res = await request(app).get('/api/timetravel/asof?sessionId=s1&entryId=e1&date=not-a-date');
    expect(res.status).toBe(400);
  });
});