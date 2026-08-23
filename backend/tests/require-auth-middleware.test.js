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

beforeAll(async () => {
  ({ requireAuth } = await import('../src/middleware/requireAuth.js'));
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

    expect(req.user).toEqual({ uid: 'user_123', email: 'driver@example.com' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});