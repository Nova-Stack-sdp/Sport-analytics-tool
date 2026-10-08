/**
 * Rate limits (one client can't exhaust the API for the rest) and the
 * response cache (repeated reads are served from memory). Unit tests use a
 * fake clock; the app-level tests use a mocked database, like the other
 * *-api tests.
 */
import { jest } from '@jest/globals';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { createResponseCache } from '../src/middleware/responseCache.js';

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { findMany: jest.fn(), groupBy: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
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
  mockPrisma.session.findMany.mockResolvedValue([]);
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.event.groupBy.mockResolvedValue([]);
  mockPrisma.driverCareerStats.findMany.mockResolvedValue([]);
});

// Minimal req/res doubles for the unit tests.
function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.type = () => res;
  return res;
}

describe('createRateLimiter', () => {
  test('allows `limit` requests per window, then 429 with Retry-After, then resets', () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    const req = { ip: '1.2.3.4' };
    const run = () => { const res = fakeRes(); const next = jest.fn(); limiter(req, res, next); return { res, next }; };

    for (let i = 0; i < 3; i += 1) expect(run().next).toHaveBeenCalled();
    t = 45_000;
    const blocked = run();
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers['Retry-After']).toBe('15');
    expect(blocked.res.headers['RateLimit-Remaining']).toBe('0');
    expect(blocked.res.body.detail).toMatch(/3 requests per 60 seconds/);

    t = 60_001; // new window
    expect(run().next).toHaveBeenCalled();
  });

  test('each client has its own allowance', () => {
    const limiter = createRateLimiter({ limit: 1, now: () => 0 });
    const call = (ip) => { const next = jest.fn(); limiter({ ip }, fakeRes(), next); return next; };
    expect(call('a')).toHaveBeenCalled();
    expect(call('b')).toHaveBeenCalled();
    expect(call('a')).not.toHaveBeenCalled();
  });
});

describe('createResponseCache', () => {
  function runThrough(cache, url, { status = 200, payload = { ok: url } } = {}) {
    const res = fakeRes();
    let routeRan = false;
    cache({ method: 'GET', originalUrl: url }, res, () => {
      routeRan = true;
      res.statusCode = status;
      res.json(payload);
    });
    return { res, routeRan };
  }

  test('serves a repeated GET from memory until it expires', () => {
    let t = 0;
    const cache = createResponseCache({ ttlMs: 60_000, now: () => t });
    expect(runThrough(cache, '/a').routeRan).toBe(true);
    const second = runThrough(cache, '/a');
    expect(second.routeRan).toBe(false);
    expect(second.res.headers['X-Cache']).toBe('HIT');
    expect(JSON.parse(second.res.body)).toEqual({ ok: '/a' });
    t = 60_001;
    expect(runThrough(cache, '/a').routeRan).toBe(true);
    expect(cache.stats()).toEqual(expect.objectContaining({ hits: 1, misses: 2 }));
  });

  test('never stores errors', () => {
    const cache = createResponseCache({ ttlMs: 60_000, now: () => 0 });
    runThrough(cache, '/missing', { status: 404, payload: { error: 'nope' } });
    expect(runThrough(cache, '/missing', { status: 404 }).routeRan).toBe(true);
  });

  test('drops the least recently used entry when full', () => {
    const cache = createResponseCache({ ttlMs: 60_000, maxEntries: 2, now: () => 0 });
    runThrough(cache, '/1');
    runThrough(cache, '/2');
    runThrough(cache, '/1'); // touch /1 so /2 is now the oldest
    runThrough(cache, '/3'); // evicts /2
    expect(runThrough(cache, '/1').routeRan).toBe(false);
    expect(runThrough(cache, '/2').routeRan).toBe(true);
  });

  test('ttl 0 turns it off', () => {
    const cache = createResponseCache({ ttlMs: 0 });
    runThrough(cache, '/a');
    expect(runThrough(cache, '/a').routeRan).toBe(true);
  });
});

describe('in the app', () => {
  test('a repeated public read is answered from cache without touching the database', async () => {
    const app = createApp({ cacheTtlMs: 60_000 });
    const first = await request(app).get('/api/v1/fixtures?season=2024');
    const second = await request(app).get('/api/v1/fixtures?season=2024');

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body);
    expect(second.headers['cache-control']).toBe('public, max-age=60');
    expect(mockPrisma.session.findMany).toHaveBeenCalledTimes(1);

    // A different filter is a different answer.
    await request(app).get('/api/v1/fixtures?season=2025');
    expect(mockPrisma.session.findMany).toHaveBeenCalledTimes(2);
  });

  test('clients can revalidate with ETag and get 304 Not Modified', async () => {
    const app = createApp({ cacheTtlMs: 60_000 });
    const first = await request(app).get('/api/v1/fixtures');
    const again = await request(app).get('/api/v1/fixtures').set('If-None-Match', first.headers.etag);
    expect(first.headers.etag).toBeDefined();
    expect(again.status).toBe(304);
  });

  test('the site\'s own statistics route is cached too, but exports never are', async () => {
    const app = createApp({ cacheTtlMs: 60_000 });
    await request(app).get('/api/fixtures');
    await request(app).get('/api/fixtures');
    expect(mockPrisma.session.findMany).toHaveBeenCalledTimes(1);

    await request(app).get('/api/v1/exports/driver-season-stats');
    const exportAgain = await request(app).get('/api/v1/exports/driver-season-stats');
    expect(exportAgain.headers['x-cache']).toBeUndefined();
    expect(mockPrisma.driverCareerStats.findMany).toHaveBeenCalledTimes(2);
  });

  test('the public API is rate limited per client, with standard headers', async () => {
    const app = createApp({ v1RateLimit: 2 });
    const ok = await request(app).get('/api/v1');
    await request(app).get('/api/v1');
    const blocked = await request(app).get('/api/v1');

    expect(ok.headers['ratelimit-limit']).toBe('2');
    expect(ok.headers['ratelimit-remaining']).toBe('1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.error).toBe('Too many requests');
  });

  test('exports have their own tighter limit', async () => {
    const app = createApp({ v1RateLimit: 100, exportRateLimit: 1 });
    expect((await request(app).get('/api/v1/exports/driver-season-stats')).status).toBe(200);
    expect((await request(app).get('/api/v1/exports/driver-season-stats')).status).toBe(429);
    expect((await request(app).get('/api/v1')).status).toBe(200); // the rest of v1 is unaffected
  });

  test('site and public-API limits are counted separately', async () => {
    const app = createApp({ siteRateLimit: 1, v1RateLimit: 100 });
    expect((await request(app).get('/api/fixtures')).status).toBe(200);
    expect((await request(app).get('/api/fixtures')).status).toBe(429);
    expect((await request(app).get('/api/v1')).status).toBe(200);
  });

  test('token exchanges have their own tight limit (POST /api/auth/session)', async () => {
    const app = createApp({ sessionRateLimit: 2 });
    // No idToken in the body: the route answers 400, but every hit still
    // counts — the point is that the token-exchange endpoint cannot be
    // hammered to spray or brute-force tokens.
    expect((await request(app).post('/api/auth/session').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/session').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/session').send({})).status).toBe(429);
  });
});
