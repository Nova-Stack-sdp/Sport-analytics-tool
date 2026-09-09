import { jest } from '@jest/globals';

const mockPrisma = {
  meeting: { findFirst: jest.fn() },
  team: { findMany: jest.fn(), findUnique: jest.fn() },
};

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;
let clearApiSportsCache;

const TEAM_NAMES = [
  ['McLaren', 'McLaren Mastercard F1 Team'],
  ['Mercedes', 'Mercedes-AMG PETRONAS Formula One Team'],
  ['Red Bull Racing', 'Oracle Red Bull Racing'],
  ['Ferrari', 'Scuderia Ferrari HP'],
  ['Williams', 'Atlassian Williams F1 Team'],
  ['Racing Bulls', 'Visa Cash App Racing Bulls Formula One Team'],
  ['Aston Martin', 'Aston Martin Aramco Formula One Team'],
  ['Haas F1 Team', 'TGR Haas F1 Team'],
  ['Audi', 'Audi Revolut F1 Team'],
  ['Alpine', 'BWT Alpine Formula One Team'],
  ['Cadillac', 'Cadillac Formula 1 Team'],
];

function buildData() {
  const teams = TEAM_NAMES.map(([localName], index) => ({
    id: `team-${index + 1}`,
    name: localName,
    entries: [{
      driver: { id: `driver-${index + 1}`, name: `Driver ${index + 1}`, driverNumber: index + 1 },
      sessionStats: { finalPosition: index + 1, points: index === 0 ? 25 : 0 },
      session: {
        type: 'Race',
        openf1Key: 11307,
        startTime: '2026-06-14T13:00:00.000Z',
        meeting: { season: 2026 },
      },
    }],
  }));

  const apiTeams = TEAM_NAMES.map(([, apiName], index) => ({
    id: index + 101,
    name: apiName,
    logo: `https://example.test/team-${index + 1}.png`,
    base: `Base ${index + 1}`,
    chassis: `Chassis ${index + 1}`,
    engine: `Engine ${index + 1}`,
    first_team_entry: 2000 + index,
  }));

  const apiDrivers = teams.map((team, index) => ({
    id: index + 201,
    number: index + 1,
    image: `https://example.test/driver-${index + 1}.png`,
  }));

  const openF1Drivers = teams.map((team, index) => ({
    driver_number: index + 1,
    full_name: `Driver ${index + 1}`,
    team_name: team.name,
    team_colour: '112233',
    headshot_url: null,
  }));

  const sessionResults = teams.map((team, index) => ({
    driver_number: index + 1,
    position: index + 1,
    points: index === 0 ? 25 : 0,
    dnf: false,
    dns: false,
    dsq: false,
  }));

  return { teams, apiTeams, apiDrivers, openF1Drivers, sessionResults };
}

function mockFetch(data) {
  global.fetch = jest.fn((url) => {
    if (url === 'https://v1.formula-1.api-sports.io/teams') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: data.apiTeams }) });
    }
    if (url === 'https://v1.formula-1.api-sports.io/drivers') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: data.apiDrivers }) });
    }
    if (url.includes('api.openf1.org/v1/drivers')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data.openF1Drivers) });
    }
    if (url.includes('api.openf1.org/v1/session_result')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data.sessionResults) });
    }
    if (url.includes('commons.wikimedia.org')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ query: { pages: {} } }) });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ clearApiSportsCache } = await import('../src/lib/apiSports.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  clearApiSportsCache();
  process.env.API_SPORTS_KEY = 'test-key';

  const data = buildData();
  mockPrisma.meeting.findFirst.mockResolvedValue({ season: 2026 });
  mockPrisma.team.findMany.mockResolvedValue(data.teams);
  mockPrisma.team.findUnique.mockImplementation(({ where }) => (
    Promise.resolve(data.teams.find((team) => team.id === where.id) || null)
  ));
  mockFetch(data);
});

afterEach(() => {
  delete process.env.API_SPORTS_KEY;
  delete global.fetch;
});

describe('Teams API-Sports enrichment', () => {
  test('matches all 11 official 2026 team names and caches the team catalogue', async () => {
    const app = createApp();
    const first = await request(app).get('/api/teams');
    const second = await request(app).get('/api/teams');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.teams).toHaveLength(11);
    expect(first.body.teams.every((team) => team.apiId !== null)).toBe(true);
    expect(global.fetch.mock.calls.filter(([url]) => url === 'https://v1.formula-1.api-sports.io/teams')).toHaveLength(1);
  });

  test('returns profiles and driver images for every team using two provider calls', async () => {
    const app = createApp();

    for (let index = 0; index < TEAM_NAMES.length; index += 1) {
      const response = await request(app).get(`/api/teams/team-${index + 1}`);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        apiId: String(index + 101),
        name: TEAM_NAMES[index][0],
        base: `Base ${index + 1}`,
        chassis: `Chassis ${index + 1}`,
        engine: `Engine ${index + 1}`,
      });
      expect(response.body.drivers[0].imageUrl).toBe(`https://example.test/driver-${index + 1}.png`);
    }

    const providerCalls = global.fetch.mock.calls.filter(([url]) => url.includes('v1.formula-1.api-sports.io'));
    expect(providerCalls.map(([url]) => url)).toEqual([
      'https://v1.formula-1.api-sports.io/teams',
      'https://v1.formula-1.api-sports.io/drivers',
    ]);
  });
});
