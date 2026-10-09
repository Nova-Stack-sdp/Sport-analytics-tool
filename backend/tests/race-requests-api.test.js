import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
  },
}));

const mockPrisma = {
  session: { findMany: jest.fn() },
  event: { groupBy: jest.fn() },
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let createRaceRequestsRouter;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ createRaceRequestsRouter } = await import('../src/routes/raceRequests.js'));
  ({ default: request } = await import('supertest'));
});

const NOW = new Date('2024-06-01T00:00:00Z');
const OPENF1 = {
  9472: {
    session_key: 9472,
    session_name: 'Race',
    country_name: 'Bahrain',
    location: 'Sakhir',
    circuit_short_name: 'Sakhir',
    date_start: '2024-03-02T15:00:00+00:00',
    date_end: '2024-03-02T17:00:00+00:00',
  },
  9480: {
    session_key: 9480,
    session_name: 'Race',
    country_name: 'Saudi Arabia',
    location: 'Jeddah',
    circuit_short_name: 'Jeddah',
    date_start: '2024-03-09T17:00:00+00:00',
    date_end: '2024-03-09T19:00:00+00:00',
  },
  9488: {
    session_key: 9488,
    session_name: 'Race',
    country_name: 'Australia',
    location: 'Melbourne',
    circuit_short_name: 'Melbourne',
    date_start: '2024-03-24T04:00:00+00:00',
    date_end: '2024-03-24T06:00:00+00:00',
  },
  9999: {
    session_key: 9999,
    session_name: 'Race',
    country_name: 'Abu Dhabi',
    location: 'Yas Marina',
    circuit_short_name: 'Yas Marina Circuit',
    date_start: '2024-12-08T13:00:00+00:00',
    date_end: '2024-12-08T15:00:00+00:00',
  },
  9001: { session_key: 9001, session_name: 'Qualifying', date_end: '2024-03-01T17:00:00+00:00' },
};

// The database: Bahrain is stored and replayable, Saudi Arabia is stored but
// missing its classification, Australia isn't stored at all.
function storeSessions(rows) {
  mockPrisma.session.findMany.mockImplementation(async ({ where }) =>
    rows.filter((row) => where.openf1Key.in.includes(row.openf1Key))
  );
  mockPrisma.event.groupBy.mockImplementation(async ({ where }) =>
    rows
      .filter((row) => where.sessionId.in.includes(row.id))
      .flatMap((row) => row.types.map((eventType) => ({ sessionId: row.id, eventType })))
  );
}
const FULL = ['lap_completed', 'position_change', 'classification'];

function makeApp({ runSync = jest.fn(async () => {}) } = {}) {
  const router = createRaceRequestsRouter({
    fetchSessions: jest.fn(async () => [OPENF1[9472], OPENF1[9480], OPENF1[9488], OPENF1[9999]]),
    fetchSession: jest.fn(async (key) => OPENF1[key] ?? null),
    runSync,
    now: () => NOW,
  });
  return createApp({ raceRequestsRouter: router });
}

const authed = (req) => req.set('Authorization', 'Bearer good-token');
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
  mockVerifyIdToken.mockResolvedValue({ uid: 'fan-uid', email: 'fan@example.com' });
  storeSessions([
    { id: 's-bahrain', openf1Key: 9472, types: FULL },
    { id: 's-saudi', openf1Key: 9480, types: ['lap_completed', 'position_change'] },
  ]);
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

describe('GET /api/race-requests/available', () => {
  test("lists the season's races with where each one stands here, in calendar order", async () => {
    const res = await request(makeApp()).get('/api/race-requests/available?year=2024');
    expect(res.status).toBe(200);
    expect(res.body.races.map((r) => [r.sessionKey, r.status])).toEqual([
      [9472, 'ready'],
      [9480, 'synced'],
      [9488, 'missing'],
      [9999, 'upcoming'],
    ]);
    expect(res.body.races[0]).toMatchObject({
      name: 'Bahrain Grand Prix',
      location: 'Sakhir',
      sessionId: 's-bahrain',
    });
  });

  test('refuses a season OpenF1 has no lap data for, or one that has not started', async () => {
    for (const year of ['2022', '2025', 'abc']) {
      const res = await request(makeApp()).get(`/api/race-requests/available?year=${year}`);
      expect(res.status).toBe(400);
    }
  });

  test('says so when OpenF1 cannot be reached', async () => {
    const router = createRaceRequestsRouter({
      fetchSessions: jest.fn(async () => {
        throw new Error('down');
      }),
      now: () => NOW,
    });
    const res = await request(createApp({ raceRequestsRouter: router })).get(
      '/api/race-requests/available?year=2024'
    );
    expect(res.status).toBe(502);
  });
});

describe('POST /api/race-requests', () => {
  test('needs a signed-in user', async () => {
    const res = await request(makeApp()).post('/api/race-requests').send({ sessionKey: 9488 });
    expect(res.status).toBe(401);
  });

  test('queues a sync, runs it, and reports the race ready with its new session', async () => {
    let finishSync;
    // The sync reports its stages as it goes; this one stops mid-way.
    const runSync = jest.fn(
      (key, { onProgress }) =>
        new Promise((resolve) => {
          onProgress({ stage: 'session', state: 'start' });
          onProgress({ stage: 'session', state: 'done', ms: 420, detail: 'Australia Race · 20 drivers' });
          onProgress({ stage: 'fetch', state: 'start' });
          finishSync = resolve;
        })
    );
    const app = makeApp({ runSync });
    const queued = await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9488 });
    expect(queued.status).toBe(202);
    expect(runSync).toHaveBeenCalledWith(9488, { onProgress: expect.any(Function) });

    // While it runs, the request shows each stage and the time so far.
    const during = await request(app).get('/api/race-requests/9488');
    expect(during.body.status).toBe('syncing');
    expect(during.body.stages).toEqual([
      { stage: 'session', state: 'done', ms: 420, detail: 'Australia Race · 20 drivers' },
      { stage: 'fetch', state: 'start', ms: null, detail: null },
    ]);
    expect(during.body.elapsedMs).toEqual(expect.any(Number));
    // The season list shows the request too.
    const listed = await request(app).get('/api/race-requests/available?year=2024');
    expect(listed.body.races.find((r) => r.sessionKey === 9488).status).toBe('syncing');

    // The job writes the race; the request then reads it back as ready.
    storeSessions([
      { id: 's-bahrain', openf1Key: 9472, types: FULL },
      { id: 's-australia', openf1Key: 9488, types: FULL },
    ]);
    finishSync();
    await settle();
    await settle();
    const done = await request(app).get('/api/race-requests/9488');
    expect(done.body).toMatchObject({ status: 'ready', sessionId: 's-australia' });
    expect(done.body.readyMs).toEqual(expect.any(Number));
  });

  test('runs one sync at a time, in the order asked', async () => {
    const order = [];
    const pending = [];
    const runSync = jest.fn(
      (key) =>
        new Promise((resolve) => {
          order.push(key);
          pending.push(resolve);
        })
    );
    const app = makeApp({ runSync });
    await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9488 });
    const second = await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9480 });
    expect(second.status).toBe(202);
    expect(order).toEqual([9488]);
    const waiting = await request(app).get('/api/race-requests/9480');
    expect(waiting.body).toMatchObject({ status: 'queued', position: 1 });

    pending[0]();
    await settle();
    await settle();
    expect(order).toEqual([9488, 9480]);
  });

  test('asking twice for a race already on its way does not queue it twice', async () => {
    const runSync = jest.fn(() => new Promise(() => {}));
    const app = makeApp({ runSync });
    await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9488 });
    const again = await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9488 });
    expect(again.status).toBe(202);
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test('a race already replayable answers at once, without a sync', async () => {
    const runSync = jest.fn();
    const res = await authed(request(makeApp({ runSync })).post('/api/race-requests')).send({
      sessionKey: 9472,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', sessionId: 's-bahrain' });
    expect(runSync).not.toHaveBeenCalled();
  });

  test('refuses what RaceSync cannot replay: bad keys, unknown, non-race and unfinished sessions', async () => {
    const app = makeApp();
    const cases = [
      [{ sessionKey: 'x' }, 400],
      [{ sessionKey: 123456 }, 404],
      [{ sessionKey: 9001 }, 400],
      [{ sessionKey: 9999 }, 400],
    ];
    for (const [body, status] of cases) {
      const res = await authed(request(app).post('/api/race-requests')).send(body);
      expect(res.status).toBe(status);
    }
  });

  test('a failed sync, or one that leaves the race unreplayable, says why', async () => {
    const app = makeApp({
      runSync: jest.fn(async (key) => {
        if (key === 9488) throw new Error('OpenF1 rate limit');
      }),
    });
    await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9488 });
    await settle();
    expect((await request(app).get('/api/race-requests/9488')).body).toMatchObject({
      status: 'failed',
      error: 'OpenF1 rate limit',
    });

    // Saudi Arabia syncs "fine" but still lacks its classification.
    await authed(request(app).post('/api/race-requests')).send({ sessionKey: 9480 });
    await settle();
    await settle();
    const saudi = await request(app).get('/api/race-requests/9480');
    expect(saudi.body.status).toBe('failed');
    expect(saudi.body.error).toMatch(/not carry enough lap data/);
  });
});

describe('GET /api/race-requests/:sessionKey', () => {
  test('a race nobody asked for, that is not stored, is a 404', async () => {
    const res = await request(makeApp()).get('/api/race-requests/9488');
    expect(res.status).toBe(404);
  });
});
