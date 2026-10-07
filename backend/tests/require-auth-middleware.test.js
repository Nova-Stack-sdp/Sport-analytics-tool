/**
 * Tests for requireAuth, the Firebase ID token verification middleware —
 * this replaces signin-auth.test.js, which tested a custom backend
 * email/password auth module (backend/src/auth/signin.js) that was never
 * built once the team moved to Firebase Authentication on the frontend.
 * This is the actual backend-side counterpart to that: verifying the
 * tokens Firebase issues, not issuing or managing sessions itself.
 */
import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
const mockAuth = jest.fn(() => ({ verifyIdToken: mockVerifyIdToken }));
const mockInitializeApp = jest.fn(() => ({ name: 'fake-app' }));
const mockCert = jest.fn((serviceAccount) => serviceAccount);

jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: mockInitializeApp,
    credential: { cert: mockCert },
    auth: mockAuth,
  },
}));

let requireAuth;
let requireAdmin;
let requireVerifiedEmail;

beforeAll(async () => {
  ({ requireAuth, requireAdmin, requireVerifiedEmail } = await import('../src/middleware/requireAuth.js'));
});

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

describe('requireAuth', () => {
  // Runs first, deliberately — getAdminApp() caches the initialized app in
  // a module-level variable after first success, so this must run before
  // any other test causes that caching, or it'd falsely see a cached app.
  test('returns 500, not a crash, if FIREBASE_SERVICE_ACCOUNT is not configured', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a request with no Authorization header', async () => {
    const req = { headers: {} };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects a malformed Authorization header (not "Bearer <token>")', async () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an invalid/expired token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Firebase ID token has expired'));
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches the decoded user and calls next() for a valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123', email: 'driver@example.com' });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(req.user).toEqual({ uid: 'user_123', email: 'driver@example.com', emailVerified: false, developer: false, admin: false });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('defaults email to null and developer to false when the decoded token omits them', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123' });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(req.user).toEqual({ uid: 'user_123', email: null, emailVerified: false, developer: false, admin: false });
    expect(next).toHaveBeenCalled();
  });

  test('carries a developer custom claim through onto req.user', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123', email: 'dev@example.com', developer: true });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const res = buildRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(req.user).toEqual({ uid: 'user_123', email: 'dev@example.com', emailVerified: false, developer: true, admin: false });
    expect(next).toHaveBeenCalled();
  });
});

describe('requireAuth admin flag (ADMIN_UIDS allowlist)', () => {
  afterEach(() => {
    delete process.env.ADMIN_UIDS;
  });

  test('marks a user on the ADMIN_UIDS list as admin', async () => {
    process.env.ADMIN_UIDS = 'someone_else, user_123 ,another';
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123', email: 'boss@example.com' });
    const req = { headers: { authorization: 'Bearer good-token' } };
    const next = jest.fn();

    await requireAuth(req, buildRes(), next);

    expect(req.user.admin).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  test('does not mark a user who is not on the list', async () => {
    process.env.ADMIN_UIDS = 'someone_else';
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123' });
    const req = { headers: { authorization: 'Bearer good-token' } };

    await requireAuth(req, buildRes(), jest.fn());

    expect(req.user.admin).toBe(false);
  });

  test('ignores an admin claim on the token itself — only the server list counts', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123', admin: true });
    const req = { headers: { authorization: 'Bearer good-token' } };

    await requireAuth(req, buildRes(), jest.fn());

    expect(req.user.admin).toBe(false);
  });
});

describe('requireAdmin', () => {
  test('lets an admin through', () => {
    const next = jest.fn();
    const res = buildRes();

    requireAdmin({ user: { uid: 'u1', admin: true } }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 for a signed-in non-admin', () => {
    const next = jest.fn();
    const res = buildRes();

    requireAdmin({ user: { uid: 'u1', admin: false } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when used without requireAuth having set a user', () => {
    const next = jest.fn();
    const res = buildRes();

    requireAdmin({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAuth emailVerified flag', () => {
  test('carries the standard email_verified claim onto req.user', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user_123', email: 'ok@example.com', email_verified: true });
    const req = { headers: { authorization: 'Bearer good-token' } };

    await requireAuth(req, buildRes(), jest.fn());

    expect(req.user.emailVerified).toBe(true);
  });
});

describe('requireVerifiedEmail', () => {
  test('lets a verified user through', () => {
    const next = jest.fn();
    const res = buildRes();

    requireVerifiedEmail({ user: { uid: 'u1', emailVerified: true, admin: false } }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 with EMAIL_NOT_VERIFIED for a signed-in unverified user', () => {
    const next = jest.fn();
    const res = buildRes();

    requireVerifiedEmail({ user: { uid: 'u1', emailVerified: false, admin: false } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('exempts an admin whose own address was never verified', () => {
    const next = jest.fn();
    const res = buildRes();

    requireVerifiedEmail({ user: { uid: 'u1', emailVerified: false, admin: true } }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when used without requireAuth having set a user', () => {
    const next = jest.fn();
    const res = buildRes();

    requireVerifiedEmail({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
