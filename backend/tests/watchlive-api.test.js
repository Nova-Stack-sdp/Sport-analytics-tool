import { jest } from '@jest/globals';

const mockPrisma = {
  externalApiCache: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockFetchBarcelonaRaceRaw = jest.fn();

const { Router } = await import('express');

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));
jest.unstable_mockModule('../src/routes/openf1.js', () => ({
  fetchBarcelonaRaceRaw: mockFetchBarcelonaRaceRaw,
  // Not used by these tests, but app.js also wires up raceReplay.js, which
  // imports this from the same module — jest.unstable_mockModule replaces
  // the whole module, so every export it uses needs a stub here too.
  fetchSessionTrackTelemetryRaw: jest.fn(),
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
  mockPrisma.externalApiCache.findUnique.mockResolvedValue(null);
  mockPrisma.externalApiCache.upsert.mockResolvedValue({});
});

describe('GET /api/watch-live', () => {
  test('returns the cached Barcelona bundle and validates state input', async () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ driver_number: 44, full_name: 'Lewis Hamilton', team_name: 'Ferrari' }],
      starting_grid: [{ driver_number: 44, position: 1 }],
      laps: [{ driver_number: 44, lap_number: 11, lap_duration: 80, date_start: '2026-06-14T13:19:06.289Z' }],
      pit: [],
      stints: [{ driver_number: 44, date: '2026-06-14T13:19:06.289Z', compound: 'HARD', stint_number: 2 }],
      position: [{ driver_number: 44, date: '2026-06-14T13:19:06.289Z', position: 1 }],
      car_data: [],
      location: [],
      race_control: [{ date: '2026-06-14T13:19:06.289Z', lap_number: 11, category: 'Flag', flag: 'GREEN', message: 'TRACK CLEAR' }],
      weather: [{ date: '2026-06-14T13:19:06.289Z', air_temperature: 28, track_temperature: 42, humidity: 48, rainfall: 0, wind_speed: 2 }],
    };
    mockFetchBarcelonaRaceRaw.mockResolvedValue(bundle);

    const stateRes = await request(createApp()).get('/api/watch-live/state?videoSeconds=923');
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.mapping).toMatchObject({ chunkId: 'opening-stint', openF1Timestamp: '2026-06-14T13:19:06.289Z' });

    const badStateRes = await request(createApp()).get('/api/watch-live/state?videoSeconds=invalid');
    expect(badStateRes.status).toBe(400);
    expect(badStateRes.body.error).toMatch(/videoSeconds.*finite number/i);
  });

  test('derives a track shape from live location telemetry when available', async () => {
    const bundle = {
      session_key: 11307,
      session: [{ session_name: 'Race' }],
      meeting: [{ meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ driver_number: 44, full_name: 'Lewis Hamilton' }],
      starting_grid: [{ driver_number: 44, position: 1 }],
      laps: [
        { driver_number: 44, lap_number: 1, date_start: '2026-06-14T13:03:27.854Z', lap_duration: 85 },
        { driver_number: 44, lap_number: 2, date_start: '2026-06-14T13:04:52.854Z', lap_duration: 85 },
        { driver_number: 44, lap_number: 3, date_start: '2026-06-14T13:06:17.854Z', lap_duration: 85 },
      ],
      location: Array.from({ length: 24 }, (_, index) => ({
        driver_number: 44,
        date: new Date(Date.parse('2026-06-14T13:03:50.000Z') + index * 1000).toISOString(),
        x: index,
        y: (index % 5) * 2,
      })),
      pit: [],
      stints: [],
      position: [],
      race_control: [],
      weather: [],
    };
    mockFetchBarcelonaRaceRaw.mockResolvedValue(bundle);

    const res = await request(createApp()).get('/api/watch-live/track-shape');

    expect(res.status).toBe(200);
    expect(['openf1-live', 'fastf1-static-fallback']).toContain(res.body.source);
    expect(Array.isArray(res.body.points)).toBe(true);
    expect(res.body.points.length).toBeGreaterThan(0);
  });
});