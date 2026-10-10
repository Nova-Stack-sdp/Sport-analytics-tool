import { jest } from '@jest/globals';

const mockPrisma = {
  session: { count: jest.fn(), findFirst: jest.fn() },
  submission: { count: jest.fn(), findMany: jest.fn() },
  event: { count: jest.fn(), findMany: jest.fn() },
  meeting: { findFirst: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
  teamSeasonStats: { findMany: jest.fn() },
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
  delete process.env.FRONTEND_ORIGIN;
});

function baseMocks() {
  mockPrisma.session.count.mockResolvedValue(0);
  mockPrisma.submission.count.mockResolvedValue(0);
  mockPrisma.event.count.mockResolvedValue(0);
  mockPrisma.meeting.findFirst.mockResolvedValue(null);
  mockPrisma.session.findFirst.mockResolvedValue(null);
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.submission.findMany.mockResolvedValue([]);
  mockPrisma.driverCareerStats.findMany.mockResolvedValue([]);
  mockPrisma.teamSeasonStats.findMany.mockResolvedValue([]);
}

describe('App-level endpoints', () => {
  test('GET / returns service status', async () => {
    const app = createApp();
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'sport-analytics-backend' });
  });

  test('GET /health returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('removed TelemetryTV state endpoint returns 404', async () => {
    baseMocks();
    const app = createApp();
    const res = await request(app).get('/api/telemetry-tv/state?videoSeconds=12');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('cors allows all origins when FRONTEND_ORIGIN is *', async () => {
    process.env.FRONTEND_ORIGIN = '*';
    baseMocks();
    const app = createApp();
    const res = await request(app).get('/').set('Origin', 'https://anywhere.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('cors allows specific comma-separated origins', async () => {
    process.env.FRONTEND_ORIGIN = 'https://a.example.com, https://b.example.com';
    baseMocks();
    const app = createApp();
    const res = await request(app).get('/').set('Origin', 'https://b.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://b.example.com');
  });

  test('preflight request handles allowed origin and method headers', async () => {
    process.env.FRONTEND_ORIGIN = 'https://app.example.com';
    baseMocks();
    const app = createApp();
    const res = await request(app)
      .options('/api/overview')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });
});

describe('security headers and the CSRF origin guard', () => {
  test('sets the standard hardening headers on every response', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    // helmet also removes the framework fingerprint.
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('rejects a cross-site POST whose Origin is not on the allowlist', async () => {
    process.env.FRONTEND_ORIGIN = 'https://app.example.com';
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  test('lets the allowlisted frontend and origin-less clients through', async () => {
    process.env.FRONTEND_ORIGIN = 'https://app.example.com';
    const app = createApp();

    const fromApp = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://app.example.com');
    expect(fromApp.status).toBe(200);

    // curl, server-to-server calls and the test suite send no Origin.
    const fromCli = await request(app).post('/api/auth/logout');
    expect(fromCli.status).toBe(200);
  });

  test('never blocks reads, and a wildcard origin keeps its wildcard meaning', async () => {
    process.env.FRONTEND_ORIGIN = 'https://app.example.com';
    const app = createApp();
    const read = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(read.status).toBe(200);

    process.env.FRONTEND_ORIGIN = '*';
    const wild = createApp();
    const post = await request(wild)
      .post('/api/auth/logout')
      .set('Origin', 'https://anywhere.example.com');
    expect(post.status).toBe(200);
  });
});
