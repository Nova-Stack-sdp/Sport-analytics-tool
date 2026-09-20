/**
 * Tests for the httpOnly cookie auth layer:
 *   POST /api/auth/session  — Firebase ID token → cookie exchange
 *   POST /api/auth/logout   — clear the cookie
 *   GET  /api/auth/me       — session check from cookie
 *
 * Also covers the cookie-reading path in requireAuth (Bearer header is
 * already covered by require-auth-middleware.test.js).
 *
 * Mocks firebase-admin the same way as require-auth-middleware.test.js so
 * no real Firebase project is needed.  Prisma is mocked too because the
 * app module imports route modules that import prisma at the top level.
 */
import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
const mockAuth = jest.fn(() => ({ verifyIdToken: mockVerifyIdToken }));
const mockInitializeApp = jest.fn(() => ({ name: 'fake-app' }));
const mockCert = jest.fn((sa) => sa);

jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: mockInitializeApp,
    credential: { cert: mockCert },
    auth: mockAuth,
  },
}));

// Prisma is imported transitively by the other route modules loaded in
// app.js — provide a stub so those imports don't blow up.
const mockPrisma = {};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test' });
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

// ------------------------------------------------------------------
// POST /api/auth/session
// ------------------------------------------------------------------
describe('POST /api/auth/session', () => {
  test('sets an httpOnly cookie and returns the user for a valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    const app = createApp();

    const res = await request(app)
      .post('/api/auth/session')
      .send({ idToken: 'valid-firebase-token' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'u1', email: 'a@b.com' });

    // Verify the Set-Cookie header contains the httpOnly __session cookie.
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toMatch(/__session=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test('returns 400 when idToken is missing from the body', async () => {
    const app = createApp();

    const res = await request(app).post('/api/auth/session').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('returns 401 when the Firebase token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
    const app = createApp();

    const res = await request(app)
      .post('/api/auth/session')
      .send({ idToken: 'bad-token' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });
});

// ------------------------------------------------------------------
// POST /api/auth/logout
// ------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
  test('clears the __session cookie', async () => {
    const app = createApp();

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    // clearCookie sets the expiry in the past and an empty value.
    expect(cookie).toMatch(/__session=/);
  });
});

// ------------------------------------------------------------------
// GET /api/auth/me
// ------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  test('returns the user when a valid cookie is present', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u2', email: 'me@test.com' });
    const app = createApp();

    // First establish a session to get a cookie, then call /me with it.
    const agent = request.agent(app);
    await agent
      .post('/api/auth/session')
      .send({ idToken: 'valid-token' });

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'u2', email: 'me@test.com' });
  });

  test('returns 401 when no cookie or header is present', async () => {
    const app = createApp();

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  test('works with a Bearer header as well as a cookie', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u3', email: 'bearer@test.com' });
    const app = createApp();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer header-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid: 'u3', email: 'bearer@test.com' });
  });
});
