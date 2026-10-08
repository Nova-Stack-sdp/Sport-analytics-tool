/**
 * Tests for account creation that waits for the email code:
 *   POST /api/auth/signup/request — note a pending sign-up, mail a code
 *   POST /api/auth/signup/confirm — check a code, THEN create the account
 *
 * These two routes are public on purpose — no account (and so no token)
 * exists until the code is confirmed, which is the whole point: nothing is
 * created before the address proves itself.
 *
 * firebase-admin is mocked the same way as email-verification-api.test.js;
 * what matters here is that admin.auth().createUser is called ONLY from
 * /confirm, and only after a matching code.
 */
import { jest } from '@jest/globals';
import {
  MAX_ATTEMPTS,
  codesMatch,
  hashCode,
} from '../src/lib/emailVerificationCodes.js';

const mockCreateUser = jest.fn();
const mockAuth = jest.fn(() => ({
  createUser: mockCreateUser,
}));

jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: mockAuth,
  },
}));

const mockPendingSignup = {
  findFirst: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: { pendingSignup: mockPendingSignup },
}));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test' });
  mockPendingSignup.findFirst.mockResolvedValue(null);
  mockPendingSignup.count.mockResolvedValue(0);
  mockPendingSignup.create.mockResolvedValue({ id: 'signup-1' });
  mockPendingSignup.update.mockResolvedValue({});
  mockPendingSignup.updateMany.mockResolvedValue({ count: 1 });
  mockCreateUser.mockResolvedValue({ uid: 'new-uid' });
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_FROM;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAILERSEND_API_KEY;
});

function requestSignup(app, body = { email: 'ana@example.test' }) {
  return request(app).post('/api/auth/signup/request').send(body);
}

function confirmSignup(app, body = {}) {
  return request(app)
    .post('/api/auth/signup/confirm')
    .send({
      email: 'ana@example.test',
      code: '123456',
      password: 'longenough1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      ...body,
    });
}

/** A stored pending-signup row as the database would hand it back. */
function liveSignup(overrides = {}) {
  return {
    id: 'signup-1',
    email: 'ana@example.test',
    codeHash: hashCode('123456'),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    attempts: 0,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// POST /api/auth/signup/request
// ------------------------------------------------------------------
describe('POST /api/auth/signup/request', () => {
  test('rejects an address that cannot be one', async () => {
    const res = await requestSignup(createApp(), { email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
    expect(mockPendingSignup.create).not.toHaveBeenCalled();
  });

  test('mails a six-digit code and stores only its hash — never a password', async () => {
    const res = await requestSignup(createApp());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(res.body.email).toBe('an***@example.test');
    expect(res.body.expiresInMinutes).toBe(10);
    expect(res.body.resendAfterSeconds).toBe(60);

    // The console provider has no inbox, so the response carries the code —
    // and the row that was written must not be that code.
    expect(res.body.devCode).toMatch(/^\d{6}$/);
    const { data } = mockPendingSignup.create.mock.calls[0][0];
    expect(data.email).toBe('ana@example.test');
    expect(data.codeHash).toBe(hashCode(res.body.devCode));
    expect(data.codeHash).not.toBe(res.body.devCode);
    // The password does not exist yet at this stage — nothing to store.
    expect(data).not.toHaveProperty('password');

    const ttlMs = data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(9 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  test('lowercases and trims the address before touching anything', async () => {
    const res = await requestSignup(createApp(), { email: '  Ana@Example.Test  ' });

    expect(res.status).toBe(200);
    expect(mockPendingSignup.findFirst.mock.calls[0][0].where.email).toBe('ana@example.test');
    expect(mockPendingSignup.create.mock.calls[0][0].data.email).toBe('ana@example.test');
  });

  test('never asks Firebase about the address, so a taken one cannot be told apart', async () => {
    const res = await requestSignup(createApp());

    expect(res.status).toBe(200);
    // Uniformity by construction: /request performs no existence lookup at
    // all — no account is touched until /confirm has a matching code.
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('refuses a resend inside the cooldown window and says how long to wait', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(
      liveSignup({ createdAt: new Date(Date.now() - 10 * 1000) })
    );

    const res = await requestSignup(createApp());

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RESEND_COOLDOWN');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(45);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(50);
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfterSeconds));
    expect(mockPendingSignup.create).not.toHaveBeenCalled();
  });

  test('stops after the daily send limit for one address', async () => {
    mockPendingSignup.count.mockResolvedValue(10);

    const res = await requestSignup(createApp());

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('DAILY_LIMIT');

    const { where } = mockPendingSignup.count.mock.calls[0][0];
    expect(where.email).toBe('ana@example.test');
    const windowMs = Date.now() - where.createdAt.gte.getTime();
    expect(windowMs).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000);
    expect(windowMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    expect(mockPendingSignup.create).not.toHaveBeenCalled();
  });

  test('spends the previous live code when issuing a new one', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(
      liveSignup({ createdAt: new Date(Date.now() - 90 * 1000) })
    );

    const res = await requestSignup(createApp());

    expect(res.status).toBe(200);
    expect(mockPendingSignup.updateMany).toHaveBeenCalledWith({
      where: { email: 'ana@example.test', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  test('reports a mail failure as 502 and does not leave a usable code behind', async () => {
    // A real provider with no key configured: sendVerificationEmail throws
    // before any network call.
    process.env.EMAIL_PROVIDER = 'resend';

    const res = await requestSignup(createApp());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    // The row that was created must be spent, otherwise the user's retry
    // would hit their own cooldown for an email that never arrived.
    expect(mockPendingSignup.update).toHaveBeenCalledWith({
      where: { id: 'signup-1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  test('sends through a real provider and never echoes the code back', async () => {
    process.env.EMAIL_PROVIDER = 'mailersend';
    process.env.MAILERSEND_API_KEY = 'mlsn-test-key';
    process.env.EMAIL_FROM = 'NovaStack-F1 <no-reply@example.test>';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => '' });

    try {
      const res = await requestSignup(createApp());

      expect(res.status).toBe(200);
      // Production must never see the code in the response body.
      expect(res.body.devCode).toBeUndefined();

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.mailersend.com/v1/email');
      const body = JSON.parse(init.body);
      expect(body.to).toEqual([{ email: 'ana@example.test' }]);
      // Whatever was mailed is six digits and matches the stored hash.
      const mailed = body.text.match(/\b\d{6}\b/);
      expect(mailed).not.toBeNull();
      expect(codesMatch(mailed[0], mockPendingSignup.create.mock.calls[0][0].data.codeHash)).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ------------------------------------------------------------------
// POST /api/auth/signup/confirm
// ------------------------------------------------------------------
describe('POST /api/auth/signup/confirm', () => {
  test('creates the account only after the code matches — verified from birth', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup());

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('created');
    expect(res.body.email).toBe('ana@example.test');
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'longenough1',
      displayName: 'Ada Lovelace',
      emailVerified: true,
    });
  });

  test('spends the code before creating the account, so a failure cannot be replayed', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup());
    mockCreateUser.mockRejectedValue(new Error('admin backend down'));

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CREATE_FAILED');
    // The burn happened, and first — the safe direction (see the route).
    expect(mockPendingSignup.update).toHaveBeenCalledWith({
      where: { id: 'signup-1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(mockPendingSignup.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateUser.mock.invocationCallOrder[0]
    );
  });

  test('names the existing account to a code holder instead of creating a duplicate', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup());
    mockCreateUser.mockRejectedValue({ code: 'auth/email-already-exists', message: 'exists' });

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
    expect(res.body.error).toMatch(/sign in/i);
  });

  test('rejects a code that is not six digits without touching the database', async () => {
    const res = await confirmSignup(createApp(), { code: '12ab' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORMAT');
    expect(mockPendingSignup.findFirst).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('rejects a password below the form minimum before touching anything', async () => {
    const res = await confirmSignup(createApp(), { password: 'short12' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
    expect(mockPendingSignup.findFirst).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('rejects an invalid address before touching anything', async () => {
    const res = await confirmSignup(createApp(), { email: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('answers with NO_PENDING_SIGNUP when nothing is waiting for the address', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(null);

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_PENDING_SIGNUP');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('burns an expired code and says so', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(
      liveSignup({ expiresAt: new Date(Date.now() - 1000) })
    );

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(410);
    expect(res.body.code).toBe('CODE_EXPIRED');
    expect(mockPendingSignup.update).toHaveBeenCalledWith({
      where: { id: 'signup-1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('refuses once the attempt cap is reached and burns the code', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup({ attempts: MAX_ATTEMPTS }));

    const res = await confirmSignup(createApp());

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('counts a wrong guess and reports the tries left', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup());

    const res = await confirmSignup(createApp(), { code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_MISMATCH');
    expect(res.body.attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
    expect(mockPendingSignup.update).toHaveBeenCalledWith({
      where: { id: 'signup-1' },
      data: { attempts: 1 },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('burns the code on the last wrong guess', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup({ attempts: MAX_ATTEMPTS - 1 }));

    const res = await confirmSignup(createApp(), { code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.attemptsRemaining).toBe(0);
    expect(mockPendingSignup.update).toHaveBeenCalledWith({
      where: { id: 'signup-1' },
      data: { attempts: MAX_ATTEMPTS, consumedAt: expect.any(Date) },
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('creates the account without a display name when none was given', async () => {
    mockPendingSignup.findFirst.mockResolvedValue(liveSignup());

    const res = await confirmSignup(createApp(), { firstName: '', lastName: '' });

    expect(res.status).toBe(201);
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'longenough1',
      emailVerified: true,
    });
  });
});
