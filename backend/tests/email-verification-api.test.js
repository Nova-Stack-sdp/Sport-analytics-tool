/**
 * Tests for the 6-digit email verification code flow:
 *   POST /api/auth/verify-email/request — issue a code and mail it
 *   POST /api/auth/verify-email/confirm — check a code, then flag the
 *                                         Firebase account as verified
 *
 * These two routes sit behind requireAuth only (never requireVerifiedEmail),
 * because the whole point is to be reachable by an account that has not
 * verified yet — which is why almost every test below uses a token with no
 * email_verified claim at all.
 *
 * firebase-admin is mocked the same way as auth-api.test.js, so no real
 * Firebase project is needed, and prisma is mocked with a fake
 * emailVerificationCode table. The cooldown / attempt-counting logic is
 * asserted through those mock calls rather than re-implemented here.
 */
import { jest } from '@jest/globals';
import {
  MAX_ATTEMPTS,
  codesMatch,
  generateCode,
  hashCode,
  isCodeShape,
  maskEmail,
} from '../src/lib/emailVerificationCodes.js';

const mockVerifyIdToken = jest.fn();
const mockUpdateUser = jest.fn();
const mockAuth = jest.fn(() => ({
  verifyIdToken: mockVerifyIdToken,
  updateUser: mockUpdateUser,
}));

jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: mockAuth,
  },
}));

const mockEmailVerificationCode = {
  findFirst: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: { emailVerificationCode: mockEmailVerificationCode },
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
  process.env.ADMIN_UIDS = 'admin-uid';
  // No email_verified claim: an unverified account, which is the state
  // these endpoints exist to resolve.
  mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@example.test' });
  mockEmailVerificationCode.findFirst.mockResolvedValue(null);
  mockEmailVerificationCode.count.mockResolvedValue(0);
  mockEmailVerificationCode.create.mockResolvedValue({ id: 'code-1' });
  mockEmailVerificationCode.update.mockResolvedValue({});
  mockEmailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_FROM;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.RESEND_API_KEY;
});

function requestCode(app) {
  return request(app).post('/api/auth/verify-email/request').set('Authorization', 'Bearer good-token');
}

function confirmCode(app, body) {
  return request(app)
    .post('/api/auth/verify-email/confirm')
    .set('Authorization', 'Bearer good-token')
    .send(body);
}

/** A stored code row as the database would hand it back. */
function liveCode(overrides = {}) {
  return {
    id: 'code-1',
    userId: 'u1',
    codeHash: hashCode('123456'),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    attempts: 0,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// POST /api/auth/verify-email/request
// ------------------------------------------------------------------
describe('POST /api/auth/verify-email/request', () => {
  test('rejects a request with no token', async () => {
    const res = await request(createApp()).post('/api/auth/verify-email/request');

    expect(res.status).toBe(401);
    expect(mockEmailVerificationCode.create).not.toHaveBeenCalled();
  });

  test('mails a six-digit code and stores only its hash', async () => {
    const res = await requestCode(createApp());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(res.body.email).toBe('an***@example.test');
    expect(res.body.expiresInMinutes).toBe(10);
    expect(res.body.resendAfterSeconds).toBe(60);

    // The console provider has no inbox, so the response carries the code —
    // and the row that was written must not be that code.
    expect(res.body.devCode).toMatch(/^\d{6}$/);
    const { data } = mockEmailVerificationCode.create.mock.calls[0][0];
    expect(data.userId).toBe('u1');
    expect(data.codeHash).toBe(hashCode(res.body.devCode));
    expect(data.codeHash).not.toBe(res.body.devCode);

    const ttlMs = data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(9 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  test('spends the previous live code when issuing a new one', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(
      liveCode({ createdAt: new Date(Date.now() - 90 * 1000) })
    );

    const res = await requestCode(createApp());

    expect(res.status).toBe(200);
    expect(mockEmailVerificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  test('short-circuits when the address is already verified', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@example.test', email_verified: true });

    const res = await requestCode(createApp());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'already-verified', emailVerified: true });
    expect(mockEmailVerificationCode.create).not.toHaveBeenCalled();
  });

  test('returns 400 NO_EMAIL for an account with no address to verify', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'anon-uid' });

    const res = await requestCode(createApp());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_EMAIL');
    expect(mockEmailVerificationCode.create).not.toHaveBeenCalled();
  });

  test('refuses a resend inside the cooldown window and says how long to wait', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(
      liveCode({ createdAt: new Date(Date.now() - 10 * 1000) })
    );

    const res = await requestCode(createApp());

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RESEND_COOLDOWN');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(45);
    expect(res.body.retryAfterSeconds).toBeLessThanOrEqual(50);
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfterSeconds));
    expect(mockEmailVerificationCode.create).not.toHaveBeenCalled();
  });

  test('stops after the daily send limit for one account', async () => {
    mockEmailVerificationCode.count.mockResolvedValue(10);

    const res = await requestCode(createApp());

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('DAILY_LIMIT');

    // The cap is per account, over a 24 h window.
    const { where } = mockEmailVerificationCode.count.mock.calls[0][0];
    expect(where.userId).toBe('u1');
    const windowMs = Date.now() - where.createdAt.gte.getTime();
    expect(windowMs).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000);
    expect(windowMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    expect(mockEmailVerificationCode.create).not.toHaveBeenCalled();
  });

  test('reports a mail failure as 502 and does not leave a usable code behind', async () => {
    // A real provider with no key configured: sendVerificationEmail throws
    // before any network call.
    process.env.EMAIL_PROVIDER = 'resend';

    const res = await requestCode(createApp());

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    // The row that was created must be spent, otherwise the user's retry
    // would hit their own cooldown for an email that never arrived.
    expect(mockEmailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'code-1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  test('sends through a real provider and never echoes the code back', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'sg-test-key';
    process.env.EMAIL_FROM = 'NovaStack-F1 <no-reply@example.test>';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => '' });

    try {
      const res = await requestCode(createApp());

      expect(res.status).toBe(200);
      // Production must never see the code in the response body.
      expect(res.body.devCode).toBeUndefined();

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(init.headers.Authorization).toBe('Bearer sg-test-key');
      const body = JSON.parse(init.body);
      expect(body.personalizations[0].to[0].email).toBe('ana@example.test');
      expect(body.from).toEqual({ name: 'NovaStack-F1', email: 'no-reply@example.test' });
      // Whatever was mailed is six digits.
      const mailed = body.content[0].value.match(/\b\d{6}\b/);
      expect(mailed).not.toBeNull();
      expect(codesMatch(mailed[0], mockEmailVerificationCode.create.mock.calls[0][0].data.codeHash)).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// ------------------------------------------------------------------
// POST /api/auth/verify-email/confirm
// ------------------------------------------------------------------
describe('POST /api/auth/verify-email/confirm', () => {
  test('rejects a request with no token', async () => {
    const res = await request(createApp()).post('/api/auth/verify-email/confirm').send({ code: '123456' });

    expect(res.status).toBe(401);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test('rejects a code that is not six digits without touching the database', async () => {
    const res = await confirmCode(createApp(), { code: '12ab' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FORMAT');
    expect(mockEmailVerificationCode.findFirst).not.toHaveBeenCalled();
  });

  test('returns 400 when no code is waiting', async () => {
    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_ACTIVE_CODE');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test('returns 410 and burns an expired code', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(
      liveCode({ expiresAt: new Date(Date.now() - 1000) })
    );

    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(410);
    expect(res.body.code).toBe('CODE_EXPIRED');
    expect(mockEmailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'code-1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test('counts a wrong guess and reports how many tries are left', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode());

    const res = await confirmCode(createApp(), { code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_MISMATCH');
    expect(res.body.attemptsRemaining).toBe(MAX_ATTEMPTS - 1);
    // Still usable, just one guess closer to being burned.
    expect(mockEmailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'code-1' },
      data: { attempts: 1 },
    });
  });

  test('burns the code on the final wrong guess', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode({ attempts: MAX_ATTEMPTS - 1 }));

    const res = await confirmCode(createApp(), { code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.attemptsRemaining).toBe(0);
    expect(mockEmailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'code-1' },
      data: { attempts: MAX_ATTEMPTS, consumedAt: expect.any(Date) },
    });
  });

  test('returns 429 once the attempt cap is already reached', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode({ attempts: MAX_ATTEMPTS }));

    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  test('marks the Firebase account verified for the right code', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode());

    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified', emailVerified: true });
    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { emailVerified: true });

    // The code is spent before Firebase is told: a failed Admin call must
    // not leave an accepted code replayable.
    expect(mockEmailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'code-1' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(mockEmailVerificationCode.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdateUser.mock.invocationCallOrder[0]
    );
  });

  test('accepts the code with surrounding whitespace', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode());

    const res = await confirmCode(createApp(), { code: ' 123456 ' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('verified');
  });

  test('reports a failed Firebase update as 500', async () => {
    mockEmailVerificationCode.findFirst.mockResolvedValue(liveCode());
    mockUpdateUser.mockRejectedValue(new Error('boom'));

    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('UPDATE_FAILED');
  });

  test('is idempotent once the address is verified', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@example.test', email_verified: true });

    const res = await confirmCode(createApp(), { code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'already-verified', emailVerified: true });
    expect(mockEmailVerificationCode.findFirst).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------
// The pure helpers behind the routes
// ------------------------------------------------------------------
describe('code helpers', () => {
  test('generateCode always yields six digits, leading zeros included', () => {
    for (let i = 0; i < 300; i += 1) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeLessThan(10 ** 6);
    }
  });

  test('hashCode is stable and hides the code', () => {
    expect(hashCode('000123')).toBe(hashCode('000123'));
    expect(hashCode('000123')).not.toBe('000123');
    expect(hashCode('000123')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('codesMatch accepts the right code and rejects everything else', () => {
    const stored = hashCode('000123');

    expect(codesMatch('000123', stored)).toBe(true);
    expect(codesMatch('000124', stored)).toBe(false);
    expect(codesMatch('000123', null)).toBe(false);
    expect(codesMatch('000123', 'not-a-hash')).toBe(false);
  });

  test('isCodeShape only accepts exactly six digits', () => {
    expect(isCodeShape('123456')).toBe(true);
    expect(isCodeShape(' 123456 ')).toBe(true);
    expect(isCodeShape('12345')).toBe(false);
    expect(isCodeShape('1234567')).toBe(false);
    expect(isCodeShape('12ab56')).toBe(false);
    expect(isCodeShape(123456)).toBe(false);
  });

  test('maskEmail keeps enough of the address to recognise it', () => {
    expect(maskEmail('ana@example.com')).toBe('an***@example.com');
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
    expect(maskEmail('not-an-email')).toBe('n***');
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
  });
});
