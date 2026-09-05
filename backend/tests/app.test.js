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

  test('unknown /api route returns 404', async () => {
    baseMocks();
    const app = createApp();
    const res = await request(app).get('/api/not-a-route');

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
