const FALLBACK_API_URL = 'https://sport--backend-api--7kcwxz9xblx5.code.run';

function loadClient() {
  let client;
  jest.isolateModules(() => {
    client = require('./client');
  });
  return client;
}

function successfulResponse(body = { ok: true }) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('API client', () => {
  const originalApiUrl = process.env.REACT_APP_API_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetModules();
    if (originalApiUrl === undefined) {
      delete process.env.REACT_APP_API_URL;
    } else {
      process.env.REACT_APP_API_URL = originalApiUrl;
    }
    global.fetch = originalFetch;
  });

  test('uses the fallback URL and sends every API helper to its expected endpoint', async () => {
    delete process.env.REACT_APP_API_URL;
    const response = successfulResponse({ source: 'backend' });
    global.fetch.mockResolvedValue(response);
    const client = loadClient();

    await expect(client.getOverview()).resolves.toEqual({ source: 'backend' });
    await client.getStatistics();
    await client.getStatistics({ view: 'drivers', season: 2026, sessionId: 'session-1' });
    await client.getFixtures();
    await client.getFixtureEvents('session-1');
    await client.getTimeTravelContext();
    await client.getTimeTravelContext('session-1');
    await client.getTimeTravelChangelog('entry-1');
    await client.getTimeTravelAsOf({ sessionId: 'session-1', entryId: 'entry-1', date: '2026-05-04' });
    await client.getPopularVideos();
    await client.getTeams();
    await client.getTeam('team-1');
    await client.getDrivers();
    await client.getDriver('driver-1');

    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      `${FALLBACK_API_URL}/api/overview`,
      `${FALLBACK_API_URL}/api/statistics`,
      `${FALLBACK_API_URL}/api/statistics?view=drivers&season=2026&sessionId=session-1`,
      `${FALLBACK_API_URL}/api/fixtures`,
      `${FALLBACK_API_URL}/api/fixtures/session-1/events`,
      `${FALLBACK_API_URL}/api/timetravel/context`,
      `${FALLBACK_API_URL}/api/timetravel/context?sessionId=session-1`,
      `${FALLBACK_API_URL}/api/timetravel/changelog?entryId=entry-1`,
      `${FALLBACK_API_URL}/api/timetravel/asof?sessionId=session-1&entryId=entry-1&date=2026-05-04`,
      `${FALLBACK_API_URL}/api/videos/popular`,
      `${FALLBACK_API_URL}/api/teams`,
      `${FALLBACK_API_URL}/api/teams/team-1`,
      `${FALLBACK_API_URL}/api/drivers`,
      `${FALLBACK_API_URL}/api/drivers/driver-1`,
    ]);
    expect(response.json).toHaveBeenCalledTimes(14);
  });

  test('uses a configured API URL', async () => {
    process.env.REACT_APP_API_URL = 'https://api.example.test';
    global.fetch.mockResolvedValue(successfulResponse());
    const client = loadClient();

    await client.getTeams();

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/teams');
  });

  test('rejects with a useful status message when the backend responds unsuccessfully', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue({ ok: false, status: 503, json: jest.fn() });
    const client = loadClient();

    await expect(client.getDrivers()).rejects.toThrow(
      'Request to /api/drivers failed with status 503'
    );
  });
});
