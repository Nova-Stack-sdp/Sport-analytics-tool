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

  test('downloads an export through the configured API with filters and credentials', async () => {
    process.env.REACT_APP_API_URL = 'https://api.example.test';
    const blob = new Blob(['[]']);
    global.fetch.mockResolvedValue({ ok: true, blob: async () => blob });
    const client = loadClient();
    expect(await client.downloadDatasetExport({ dataset: 'events', season: '2025', format: 'json' })).toBe(blob);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/exports/events?format=json&season=2025',
      expect.objectContaining({ credentials: 'include' }),
    );
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

    // Every request also carries { credentials: 'include' } for the session cookie.
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.test/api/teams', expect.any(Object));
  });

  test('notification fetching sends the current Firebase token in the Authorization header', async () => {
    global.fetch.mockResolvedValue(successfulResponse([]));
    const client = loadClient();
    const getIdToken = jest.fn().mockResolvedValue('notification-token');
    client.setAuthTokenProvider(getIdToken);

    await expect(client.getNotifications()).resolves.toEqual([]);

    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/notifications'),
      expect.objectContaining({ headers: { Authorization: 'Bearer notification-token' } }));
  });

  test('rejects with a useful status message when the backend responds unsuccessfully', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue({ ok: false, status: 503, json: jest.fn() });
    const client = loadClient();

    await expect(client.getDrivers()).rejects.toThrow(
      'Request to /api/drivers failed with status 503'
    );
  });

  test('builds versioned driver image URLs so a replaced photo is not stale-cached', () => {
    delete process.env.REACT_APP_API_URL;
    const client = loadClient();

    expect(client.getDriverImageUrl('d1')).toBe(`${FALLBACK_API_URL}/api/drivers/d1/image`);
    expect(client.getDriverImageUrl('d1', 123)).toBe(`${FALLBACK_API_URL}/api/drivers/d1/image?v=123`);
  });

  test('getSession uses the cookie by default and a Bearer header when given an ID token', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue(successfulResponse({ uid: 'u1', admin: true }));
    const client = loadClient();

    await client.getSession();
    await expect(client.getSession('tok')).resolves.toEqual({ uid: 'u1', admin: true });

    expect(global.fetch).toHaveBeenNthCalledWith(1, `${FALLBACK_API_URL}/api/auth/me`, {
      credentials: 'include',
      signal: expect.any(AbortSignal),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${FALLBACK_API_URL}/api/auth/me`, {
      credentials: 'include',
      headers: { Authorization: 'Bearer tok' },
      signal: expect.any(AbortSignal),
    });
  });

  test('turns its own request timeout into a clear, flagged error', async () => {
    jest.useFakeTimers();
    try {
      delete process.env.REACT_APP_API_URL;
      global.fetch.mockImplementation((url, { signal } = {}) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('signal is aborted without reason', 'AbortError'))
          );
        })
      );
      const client = loadClient();

      const pending = client.getOverview();
      const assertion = expect(pending).rejects.toMatchObject({
        message: 'The server took too long to respond. Please try again.',
        timedOut: true,
      });
      jest.advanceTimersByTime(10000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  test('uploadDriverImage PUTs the raw file with the caller\'s ID token', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue({ ok: true, status: 201, json: jest.fn().mockResolvedValue({ uploadedImageVersion: 5 }) });
    const client = loadClient();
    const file = new File([new Uint8Array(4)], 'max.png', { type: 'image/png' });

    const result = await client.uploadDriverImage('d1', file, 'tok');

    expect(result).toEqual({ uploadedImageVersion: 5 });
    expect(global.fetch).toHaveBeenCalledWith(`${FALLBACK_API_URL}/api/drivers/d1/image`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'image/png' },
      body: file,
    });
  });

  test('uploadDriverImage surfaces the server\'s error message', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue({ ok: false, status: 413, json: jest.fn().mockResolvedValue({ error: 'Image is too large (max 2 MB)' }) });
    const client = loadClient();
    const file = new File([new Uint8Array(4)], 'max.png', { type: 'image/png' });

    await expect(client.uploadDriverImage('d1', file, 'tok')).rejects.toThrow('Image is too large (max 2 MB)');
  });
  test('attaches the registered Firebase ID token as a Bearer header on every request', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue(successfulResponse({ submissionId: 's1', status: 'pending' }));
    const client = loadClient();
    client.setAuthTokenProvider(() => Promise.resolve('fresh-token'));

    await client.submitData({ session_key: 1, laps: [] });
    await client.listSubmissions('pending');

    expect(global.fetch).toHaveBeenNthCalledWith(1, `${FALLBACK_API_URL}/api/submissions`, expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fresh-token' },
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${FALLBACK_API_URL}/api/submissions?status=pending`, expect.objectContaining({
      headers: { Authorization: 'Bearer fresh-token' },
    }));
  });

  test('keeps an explicit Authorization header and falls back to the cookie when no token is available', async () => {
    delete process.env.REACT_APP_API_URL;
    global.fetch.mockResolvedValue(successfulResponse({ uid: 'u1' }));
    const client = loadClient();

    client.setAuthTokenProvider(() => Promise.resolve('provider-token'));
    await client.getSession('explicit');
    client.setAuthTokenProvider(() => Promise.reject(new Error('offline')));
    await client.getOverview();

    expect(global.fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer explicit' });
    expect(global.fetch.mock.calls[1][1].headers).toBeUndefined();
  });

  describe('admin dataset helpers', () => {
    test('list, detail, delete and restore call the admin dataset endpoints', async () => {
      process.env.REACT_APP_API_URL = 'https://api.example.test';
      global.fetch.mockResolvedValue(successfulResponse({ ok: true }));
      const client = loadClient();

      await client.listAdminDatasets('deleted');
      await client.getAdminDataset('sub 1');
      await client.deleteAdminDataset('sub-1');
      await client.restoreAdminDataset('sub-1');

      const calls = global.fetch.mock.calls.map(([url, opts]) => [url, opts.method ?? 'GET']);
      expect(calls).toEqual([
        ['https://api.example.test/api/admin/datasets?view=deleted', 'GET'],
        ['https://api.example.test/api/admin/datasets/sub%201', 'GET'],
        ['https://api.example.test/api/admin/datasets/sub-1', 'DELETE'],
        ['https://api.example.test/api/admin/datasets/sub-1/restore', 'POST'],
      ]);
    });

    test('downloadAdminDataset returns the file as a Blob plus whether it is the original', async () => {
      process.env.REACT_APP_API_URL = 'https://api.example.test';
      const blob = new Blob(['{"laps":[]}'], { type: 'application/json' });
      const headers = { get: jest.fn((name) => (name === 'X-Dataset-Upload' ? 'rebuilt' : null)) };
      global.fetch.mockResolvedValue({ ok: true, status: 200, headers, blob: jest.fn().mockResolvedValue(blob), json: jest.fn() });
      const client = loadClient();

      const result = await client.downloadAdminDataset('old-1');

      expect(global.fetch.mock.calls[0][0]).toBe('https://api.example.test/api/admin/datasets/old-1/upload');
      expect(result).toEqual({ blob, kind: 'rebuilt' });
    });

    test('a failed download rejects with the backend error, not a Blob', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 404, json: jest.fn().mockResolvedValue({ error: 'Dataset not found' }) });
      const client = loadClient();
      await expect(client.downloadAdminDataset('nope')).rejects.toMatchObject({ status: 404, body: { error: 'Dataset not found' } });
    });
  });
});
