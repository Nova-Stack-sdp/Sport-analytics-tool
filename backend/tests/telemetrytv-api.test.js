import { jest } from '@jest/globals';

const mockPrisma = {
  externalApiCache: { findMany: jest.fn() },
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

function raceRow(key, overrides = {}) {
  const {
    eventName = 'Ontario Honda Dealers Indy Toronto',
    sessionDate = '7/20/2025',
    totalLaps = 90,
    fieldSize = 27,
    youtubeId = 'UO4c-wMLhso',
    embedStartSeconds = 184,
    videoDurationSeconds = 7759,
  } = overrides;
  return {
    key,
    payload: {
      session: { eventName, sessionDate, sessionType: 'R', totalLaps, fieldSize },
      video: { youtubeId, embedStartSeconds, videoDurationSeconds },
    },
  };
}

describe('GET /api/telemetry-tv/races', () => {
  test('returns the cached INDYCAR races with their video calibration', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      raceRow('indycar:indianapolis-500-2024-race:v1', {
        eventName: '108th Running of the Indianapolis 500',
        sessionDate: '5/26/2024',
        totalLaps: 200,
        fieldSize: 33,
        youtubeId: 'fWwonhySrWg',
        embedStartSeconds: 10353,
        videoDurationSeconds: 20625,
      }),
      raceRow('indycar:toronto-2025-race:v1'),
    ]);

    const res = await request(createApp()).get('/api/telemetry-tv/races');

    expect(res.status).toBe(200);
    expect(res.body.races).toHaveLength(2);
    expect(res.body.races[0]).toEqual({
      slug: 'toronto-2025',
      eventName: 'Ontario Honda Dealers Indy Toronto',
      sessionDate: '7/20/2025',
      totalLaps: 90,
      fieldSize: 27,
      video: { youtubeId: 'UO4c-wMLhso', embedStartSeconds: 184, videoDurationSeconds: 7759 },
    });
    expect(res.body.races[1]).toMatchObject({
      slug: 'indianapolis-500-2024',
      video: { youtubeId: 'fWwonhySrWg', embedStartSeconds: 10353 },
    });
  });

  test('orders races newest first', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      raceRow('indycar:long-beach-2023-race:v1', { sessionDate: '4/16/2023' }),
      raceRow('indycar:toronto-2025-race:v1', { sessionDate: '7/20/2025' }),
      raceRow('indycar:sonsio-ims-2024-race:v1', { sessionDate: '5/11/2024' }),
    ]);

    const res = await request(createApp()).get('/api/telemetry-tv/races');

    expect(res.body.races.map((race) => race.slug)).toEqual([
      'toronto-2025',
      'sonsio-ims-2024',
      'long-beach-2023',
    ]);
  });

  test('keeps only the highest bundle version for a slug', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      raceRow('indycar:toronto-2025-race:v1', { youtubeId: 'old-video' }),
      raceRow('indycar:toronto-2025-race:v2', { youtubeId: 'new-video' }),
    ]);

    const res = await request(createApp()).get('/api/telemetry-tv/races');

    expect(res.body.races).toHaveLength(1);
    expect(res.body.races[0].video.youtubeId).toBe('new-video');
  });

  test('ignores cache rows outside the indycar race bundle convention', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      raceRow('indycar:toronto-2025-race:v1'),
      { key: 'openf1:barcelona-2026-race:v2', payload: {} },
      { key: 'indycar:toronto-2025-qualifying:v1', payload: {} },
    ]);

    const res = await request(createApp()).get('/api/telemetry-tv/races');

    expect(res.body.races.map((race) => race.slug)).toEqual(['toronto-2025']);
  });

  test('returns an empty catalogue when no races are cached', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([]);

    const res = await request(createApp()).get('/api/telemetry-tv/races');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ races: [] });
  });
});

describe('GET /api/telemetry-tv/races/:slug', () => {
  test('returns the latest cached lap-by-lap race bundle', async () => {
    const row = raceRow('indycar:toronto-2025-race:v2');
    row.payload = {
      ...row.payload,
      classification: [{ CarNumber: '5', DriverName: "Pato O'Ward", PositionFinish: 1 }],
      leaderLaps: [{ lap: 1, car: '26', lapTime: '01:04.0188', speed: 100.433, flag: 'Green' }],
      lapChart: { positions: { 1: { 1: '26' } }, flags: { 1: 1 }, legend: { 26: { driver: 'Herta, Colton' } } },
      stats: { avgSpeedMph: 88.972 },
    };
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      raceRow('indycar:toronto-2025-race:v1'),
      row,
    ]);

    const res = await request(createApp()).get('/api/telemetry-tv/races/toronto-2025');

    expect(res.status).toBe(200);
    expect(res.body.race).toMatchObject({
      slug: 'toronto-2025',
      classification: [{ CarNumber: '5', PositionFinish: 1 }],
      leaderLaps: [{ lap: 1, car: '26', flag: 'Green' }],
      lapChart: { positions: { 1: { 1: '26' } } },
      stats: { avgSpeedMph: 88.972 },
    });
  });

  test('returns 404 for a race slug without a cached bundle', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([]);

    const res = await request(createApp()).get('/api/telemetry-tv/races/not-cached');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/race not found/i);
  });
});
