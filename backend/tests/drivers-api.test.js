import { jest } from '@jest/globals';

const mockPrisma = {
  meeting: { findFirst: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
  driver: { findUnique: jest.fn() },
  entry: { findMany: jest.fn() },
};

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

function buildApiSportsDriver(overrides = {}) {
  return {
    id: 9999,
    name: 'Max Verstappen',
    number: 1,
    nationality: 'Dutch',
    country: { code: 'NL' },
    image: 'https://example.com/max.png',
    teams: [{ team: { name: 'Red Bull Racing' } }],
    ...overrides,
  };
}

function buildOpenF1Driver(overrides = {}) {
  return {
    full_name: 'Max VERSTAPPEN',
    broadcast_name: 'M VERSTAPPEN',
    name_acronym: 'VER',
    first_name: 'Max',
    last_name: 'Verstappen',
    country_code: 'NL',
    headshot_url: 'https://openf1.org/max.png',
    team_name: 'Red Bull Racing',
    team_colour: '3671C6',
    ...overrides,
  };
}

function mockFetch(responses) {
  global.fetch = jest.fn((url) => {
    for (const r of responses) {
      if (url.includes(r.url)) {
        const status = r.status ?? 200;
        const ok = r.ok !== undefined ? r.ok : status < 400;
        if (status === 404) {
          return Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve({ detail: 'No results found.' }) });
        }
        if (!ok) {
          return Promise.resolve({ status, ok: false, text: () => Promise.resolve('error') });
        }
        return Promise.resolve({ status, ok: true, json: () => Promise.resolve(r.body) });
      }
    }
    return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve([]) });
  });
}

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.API_SPORTS_KEY;
  delete process.env.YOUTUBE_API_KEY;
});

afterEach(() => {
  delete global.fetch;
});

describe('GET /api/drivers', () => {
  test('returns enriched drivers from driverCareerStats with API-Sports data', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      {
        driverId: 'd1',
        points: 186,
        wins: 5,
        podiums: 8,
        driver: {
          id: 'd1',
          name: 'Max VERSTAPPEN',
          driverNumber: 1,
          entries: [
            {
              team: { name: 'Red Bull Racing' },
              session: { meeting: { season: 2024 } },
            },
          ],
        },
      },
    ]);
    mockFetch([{ url: 'v1.formula-1.api-sports.io/drivers', body: { response: [buildApiSportsDriver()] } }]);

    const app = createApp();
    const res = await request(app).get('/api/drivers');

    expect(res.status).toBe(200);
    expect(res.body.season).toBe(2024);
    expect(res.body.drivers).toHaveLength(1);
    expect(res.body.drivers[0]).toMatchObject({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      number: 1,
      points: 186,
      wins: 5,
      podiums: 8,
      teamName: 'Red Bull Racing',
      teamColor: '#3671C6',
      nationality: 'Dutch',
      countryCode: 'NL',
      flag: '🇳🇱',
      imageUrl: 'https://example.com/max.png',
    });
  });

  test('paginates the list, fetches API-Sports once, and prefers an OpenF1 headshot', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      {
        driverId: 'd1', points: 30, wins: 1, podiums: 1,
        driver: { id: 'd1', name: 'Driver One', driverNumber: 1, entries: [{ team: { name: 'Red Bull Racing' }, session: { startTime: '2024-03-02T15:00:00.000Z', openf1Key: 9553, meeting: { season: 2024 } } }] },
      },
      {
        driverId: 'd2', points: 20, wins: 0, podiums: 1,
        driver: { id: 'd2', name: 'Driver Two', driverNumber: 4, entries: [{ team: { name: 'McLaren Racing' }, session: { startTime: '2024-03-02T15:00:00.000Z', openf1Key: 9553, meeting: { season: 2024 } } }] },
      },
      {
        driverId: 'd3', points: 10, wins: 0, podiums: 0,
        driver: { id: 'd3', name: 'Driver Three', driverNumber: 16, entries: [{ team: { name: 'Ferrari' }, session: { startTime: '2024-03-02T15:00:00.000Z', openf1Key: 9553, meeting: { season: 2024 } } }] },
      },
    ]);
    mockFetch([
      {
        url: 'v1.formula-1.api-sports.io/drivers',
        body: { response: [
          buildApiSportsDriver({ number: 1, image: 'https://api-sports.test/one.png' }),
          buildApiSportsDriver({ id: 4444, number: 4, image: 'https://api-sports.test/two.png', teams: [{ team: { name: 'McLaren Racing' } }] }),
          buildApiSportsDriver({ id: 1616, number: 16, image: 'https://api-sports.test/three.png', teams: [{ team: { name: 'Ferrari' } }] }),
        ] },
      },
      {
        url: 'api.openf1.org/v1/drivers',
        body: [
          buildOpenF1Driver({ driver_number: 4, full_name: 'Driver TWO', headshot_url: 'https://api.openf1.org/two.png', team_name: 'McLaren Racing', team_colour: 'FF8000' }),
          buildOpenF1Driver({ driver_number: 16, full_name: 'Driver THREE', headshot_url: 'https://api.openf1.org/three.png', team_name: 'Ferrari', team_colour: 'E8002D' }),
        ],
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers?limit=2&offset=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, offset: 1, limit: 2, hasMore: false });
    expect(res.body.drivers).toHaveLength(2);
    expect(res.body.drivers[0]).toMatchObject({
      id: 'd2',
      name: 'Driver TWO',
      imageUrl: 'https://api.openf1.org/two.png',
      fallbackImageUrl: 'https://api-sports.test/two.png',
    });
    expect(global.fetch.mock.calls.filter(([url]) => url.includes('v1.formula-1.api-sports.io/drivers'))).toHaveLength(1);
  });

  test('falls back to entry list when career stats are empty', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driverCareerStats.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockPrisma.entry.findMany.mockResolvedValue([
      {
        driverId: 'd2',
        driver: { id: 'd2', name: 'Lando NORRIS', driverNumber: 4, entries: [] },
        session: { meeting: { season: 2024 } },
      },
    ]);
    mockFetch([{ url: 'v1.formula-1.api-sports.io/drivers', body: { response: [] } }]);

    const app = createApp();
    const res = await request(app).get('/api/drivers');

    expect(res.status).toBe(200);
    expect(res.body.drivers).toEqual([
      expect.objectContaining({ id: 'd2', name: 'Lando NORRIS', number: 4, points: 0, wins: 0, podiums: 0 }),
    ]);
  });

  test('uses current year when no meetings exist and ignores a failing API-Sports call', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue(null);
    mockPrisma.driverCareerStats.findMany.mockResolvedValue([
      {
        driverId: 'd1',
        points: 10,
        wins: 0,
        podiums: 0,
        driver: { id: 'd1', name: 'Driver One', driverNumber: 99, entries: [] },
      },
    ]);
    mockFetch([{ url: 'v1.formula-1.api-sports.io/drivers', status: 500, ok: false }]);

    const app = createApp();
    const res = await request(app).get('/api/drivers');

    expect(res.status).toBe(200);
    expect(res.body.season).toBe(new Date().getFullYear());
    expect(res.body.drivers[0].teamName).toBe('Unknown');
  });
});

describe('GET /api/drivers/:id', () => {
  test('returns 404 for an unknown driver', async () => {
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/drivers/unknown');

    expect(res.status).toBe(404);
  });

  test('returns full driver profile with OpenF1 and API-Sports enrichment', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 186, wins: 5, podiums: 8 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Race',
            startTime: '2024-03-02T15:00:00.000Z',
            openf1Key: 9553,
            meeting: { season: 2024, name: 'Bahrain Grand Prix', openf1Key: 1234 },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 1, points: 26 },
        },
      ],
    });

    mockFetch([
      {
        url: 'api.openf1.org/v1/drivers',
        body: [buildOpenF1Driver()],
      },
      {
        url: 'v1.formula-1.api-sports.io/drivers',
        body: { response: [buildApiSportsDriver({ grands_prix_entered: 100, world_championships: 3, career_points: 2500 })] },
      },
      {
        url: 'api.openf1.org/v1/session_result',
        body: [{ position: 1, points: 26, dnf: false, dns: false, dsq: false, number_of_laps: 57, gap_to_leader: 0, duration: 5400 }],
      },
      {
        url: 'api.openf1.org/v1/starting_grid',
        body: [{ position: 1 }],
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      number: 1,
      teamName: 'Red Bull Racing',
      teamColor: '#3671C6',
      nationality: 'Dutch',
      countryCode: 'NL',
      flag: '🇳🇱',
      season: 2024,
      seasonStats: { starts: 1, points: 26, wins: 1, podiums: 1, dnfCount: 0, poles: 1 },
    });
    expect(res.body.results[0]).toMatchObject({
      result: 1,
      dnf: false,
      fastestLap: false,
      points: 26,
      status: 'Finished',
      source: 'openf1',
    });
  });

  test('falls back to local stats when OpenF1 is unavailable and still counts DNFs', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 0, wins: 0, podiums: 0 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Race',
            startTime: '2024-03-02T15:00:00.000Z',
            openf1Key: 9553,
            meeting: { season: 2024, name: 'Bahrain Grand Prix', openf1Key: 1234 },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: null, points: 0 },
        },
        {
          id: 'e2',
          session: {
            id: 's2',
            type: 'Sprint',
            startTime: '2024-03-09T15:00:00.000Z',
            openf1Key: 9554,
            meeting: { season: 2024, name: 'Saudi Arabian Grand Prix', openf1Key: 1235 },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 2, points: 7 },
        },
      ],
    });

    mockFetch([
      { url: 'api.openf1.org/v1/drivers', status: 500, ok: false },
      { url: 'v1.formula-1.api-sports.io/drivers', body: { response: [] } },
      { url: 'api.openf1.org/v1/session_result', status: 500, ok: false },
      { url: 'api.openf1.org/v1/starting_grid', status: 500, ok: false },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.seasonStats.dnfCount).toBe(1);
    expect(res.body.results.some((r) => r.dnf)).toBe(true);
  });

  test('maps remote result statuses DSQ, DNS, and DNF correctly', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 0, wins: 0, podiums: 0 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Race',
            startTime: '2024-03-02T15:00:00.000Z',
            openf1Key: 9553,
            meeting: { season: 2024, name: 'Bahrain Grand Prix' },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: null,
        },
      ],
    });

    // Three sequential calls in this test: drivers, session_result, starting_grid.
    // We only hit one race, so fetch order matters. Use a deterministic mock.
    let callIndex = -1;
    const openF1Bodies = [
      [buildOpenF1Driver()],
      [{ position: 20, points: 0, dsq: true, dnf: false, dns: false, number_of_laps: 0, gap_to_leader: null, duration: null }],
      [{ position: 20 }],
    ];
    global.fetch = jest.fn((url) => {
      if (url.includes('api.openf1.org')) {
        callIndex += 1;
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(openF1Bodies[callIndex]) });
      }
      if (url.includes('v1.formula-1.api-sports.io')) {
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ response: [] }) });
      }
      return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve([]) });
    });

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('DSQ');
  });

  test('returns profile without openf1Key using local sessionStats', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 18, wins: 0, podiums: 1 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Race',
            startTime: '2024-03-02T15:00:00.000Z',
            openf1Key: null,
            meeting: { season: 2024, name: 'Bahrain Grand Prix' },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 2, points: 18 },
        },
      ],
    });
    mockFetch([
      { url: 'api.openf1.org/v1/drivers', body: [] },
      { url: 'v1.formula-1.api-sports.io/drivers', body: { response: [buildApiSportsDriver()] } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.results[0].source).toBe('local');
    expect(res.body.results[0].result).toBe(2);
  });

  test('falls back to non-race entry for latestEntry and currentTeam', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 0, wins: 0, podiums: 0 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Q',
            startTime: '2024-03-02T14:00:00.000Z',
            openf1Key: 9552,
            meeting: { season: 2024, name: 'Bahrain Grand Prix' },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 1, points: 0 },
        },
      ],
    });
    mockFetch([
      { url: 'api.openf1.org/v1/drivers', body: [buildOpenF1Driver()] },
      { url: 'v1.formula-1.api-sports.io/drivers', body: { response: [buildApiSportsDriver()] } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.teamName).toBe('Red Bull Racing');
  });

  test('tolerates API-Sports being unconfigured for the detail call', async () => {
    delete process.env.API_SPORTS_KEY;
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 26, wins: 1, podiums: 1 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Race',
            startTime: '2024-03-02T15:00:00.000Z',
            openf1Key: 9553,
            meeting: { season: 2024, name: 'Bahrain Grand Prix' },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 1, points: 26 },
        },
      ],
    });
    mockFetch([
      { url: 'api.openf1.org/v1/drivers', body: [buildOpenF1Driver()] },
      { url: 'api.openf1.org/v1/session_result', body: [{ position: 1, points: 26, dnf: false, dns: false, dsq: false, number_of_laps: 57, gap_to_leader: 0, duration: 5400 }] },
      { url: 'api.openf1.org/v1/starting_grid', body: [{ position: 1 }] },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.apiId).toBeNull();
  });

  test('handles driver with only a non-race entry lacking an openf1Key', async () => {
    process.env.API_SPORTS_KEY = 'test-key';
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Max VERSTAPPEN',
      driverNumber: 1,
      careerStats: [{ points: 0, wins: 0, podiums: 0 }],
      entries: [
        {
          id: 'e1',
          session: {
            id: 's1',
            type: 'Q',
            startTime: '2024-03-02T14:00:00.000Z',
            openf1Key: null,
            meeting: { season: 2024, name: 'Bahrain Grand Prix' },
          },
          team: { name: 'Red Bull Racing' },
          sessionStats: { finalPosition: 1, points: 0 },
        },
      ],
    });
    mockFetch([
      { url: 'v1.formula-1.api-sports.io/drivers', body: { response: [buildApiSportsDriver()] } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(200);
    expect(res.body.teamName).toBe('Red Bull Racing');
    expect(res.body.results).toEqual([]);
  });
});

describe('GET /api/drivers error handling', () => {
  test('returns 500 when listing drivers fails', async () => {
    mockPrisma.meeting.findFirst.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/drivers');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('returns 500 when fetching a driver fails', async () => {
    mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2024 });
    mockPrisma.driver.findUnique.mockRejectedValue(new Error('connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/drivers/d1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
