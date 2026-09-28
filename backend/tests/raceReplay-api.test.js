import { jest } from '@jest/globals';

const mockPrisma = {
  session: { findUnique: jest.fn() },
  entry: { findMany: jest.fn() },
  event: { findMany: jest.fn() },
};

const mockFetchSessionTrackTelemetryRaw = jest.fn();

const { Router } = await import('express');

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../src/routes/openf1.js', () => ({
  fetchSessionTrackTelemetryRaw: mockFetchSessionTrackTelemetryRaw,
  // watchLive.js imports this from the same module — needs a stub here too
  // since jest.unstable_mockModule replaces the whole module, not just the
  // export raceReplay.js itself cares about.
  fetchBarcelonaRaceRaw: jest.fn(),
  openF1Router: Router(),
}));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

const SESSION = {
  id: 's1',
  openf1Key: 999,
  type: 'Race',
  meeting: { name: 'Test Grand Prix', circuit: { name: 'A Made-Up Circuit' } },
};

describe('GET /api/race-replay/:sessionId/state', () => {
  test('returns 404 for an unknown fixture', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const res = await request(createApp()).get('/api/race-replay/unknown/state?lap=1');
    expect(res.status).toBe(404);
  });

  test('returns 400 for a fixture with no synced lap data', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    mockPrisma.entry.findMany.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);

    const res = await request(createApp()).get('/api/race-replay/s1/state?lap=1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no synced lap data/i);
  });

  test('validates lap is a non-negative finite number', async () => {
    const res = await request(createApp()).get('/api/race-replay/s1/state?lap=not-a-number');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lap must be/i);
  });

  test('returns a reconstructed leaderboard for a valid session and lap', async () => {
    // A sessionId not used by any earlier test in this file — the route
    // keeps a short-lived in-memory context cache keyed by sessionId, so
    // reusing 's1' here would silently serve the previous test's (empty)
    // cached context instead of hitting these mocks again.
    mockPrisma.session.findUnique.mockResolvedValue({ ...SESSION, id: 's-leaderboard' });
    mockPrisma.entry.findMany.mockResolvedValue([
      { id: 'e1', driver: { driverNumber: 1, name: 'Driver One' }, team: { name: 'Team One' } },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      { eventType: 'grid_position', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:00:00Z', payload: { position: 1 } },
      { eventType: 'lap_completed', entryId: 'e1', lapNumber: 1, occurredAt: '2024-01-01T00:02:00Z', payload: { lap_time_ms: 90000 } },
      { eventType: 'classification', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:02:10Z', payload: { final_position: 1, points: 25, status: 'finished' } },
      { eventType: 'position_change', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:01:00Z', payload: { from_position: 2, to_position: 1 } },
    ]);

    const res = await request(createApp()).get('/api/race-replay/s-leaderboard/state?lap=1');

    expect(res.status).toBe(200);
    expect(res.body.atEnd).toBe(true);
    expect(res.body.leaderboard).toHaveLength(1);
    expect(res.body.leaderboard[0]).toMatchObject({ driverName: 'Driver One', position: 1, status: 'finished' });
    expect(res.body.session).toMatchObject({ meetingName: 'Test Grand Prix', circuitName: 'A Made-Up Circuit' });
  });
});

describe('GET /api/race-replay/:sessionId/track-shape', () => {
  test('returns 404 for an unknown fixture', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);
    const res = await request(createApp()).get('/api/race-replay/unknown/track-shape');
    expect(res.status).toBe(404);
  });

  test('prefers real live OpenF1 telemetry when available', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    mockFetchSessionTrackTelemetryRaw.mockResolvedValue({
      laps: [
        { driver_number: 1, lap_number: 1, date_start: '2024-01-01T00:00:00Z' },
        { driver_number: 1, lap_number: 2, date_start: '2024-01-01T00:02:00Z' },
        { driver_number: 1, lap_number: 3, date_start: '2024-01-01T00:04:00Z' },
      ],
      // Falls within the derivation's chosen reference window: a lap
      // "roughly a third of the way through" a 3-lap session picks lap 2
      // (date_start 00:02:00Z) as the window start, lap 3 (00:04:00Z) as
      // the window end.
      location: Array.from({ length: 20 }, (_, i) => ({
        driver_number: 1,
        date: new Date(Date.parse('2024-01-01T00:02:10Z') + i * 1000).toISOString(),
        x: i,
        y: i % 3,
      })),
    });

    const res = await request(createApp()).get('/api/race-replay/s1/track-shape');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('openf1-live');
    expect(Array.isArray(res.body.points)).toBe(true);
    expect(res.body.points.length).toBeGreaterThan(0);
  });

  test('falls back to 404 (not a fabricated shape) when no real telemetry exists anywhere', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION); // circuit name has no static file
    mockFetchSessionTrackTelemetryRaw.mockResolvedValue(null);

    const res = await request(createApp()).get('/api/race-replay/s1/track-shape');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no real track telemetry/i);
  });

  test('does not fail the request if OpenF1 itself errors — falls through instead', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(SESSION);
    mockFetchSessionTrackTelemetryRaw.mockRejectedValue(new Error('OpenF1 unreachable'));

    const res = await request(createApp()).get('/api/race-replay/s1/track-shape');

    expect(res.status).toBe(404); // no static shape for this made-up circuit either
    expect(res.body.error).toMatch(/no real track telemetry/i);
  });
});