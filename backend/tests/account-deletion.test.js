/**
 * Tests for DELETE /api/auth/account — the "Delete profile" button under
 * Profile. One request must remove the account from all three stores:
 *
 *   1. PostgreSQL — every uid-keyed row (follow, notification,
 *      emailVerificationCode, codeSubmission, userProfile) in one transaction
 *   2. Firestore  — the users/{uid} mirror doc (best effort)
 *   3. Firebase   — the account itself, plus the session cookie
 *
 * The order matters and is asserted here: the database goes first (all or
 * nothing, safe to retry), Firestore is best effort, and the Firebase user
 * goes last so a half-finished deletion can be retried. A `user-not-found`
 * from Firebase means a finished deletion being retried, not an error.
 *
 * firebase-admin and prisma are mocked the same way as
 * email-verification-api.test.js, so no real Firebase project or database
 * is needed. The firestore() stub backs getFirestore() in
 * src/lib/firebaseAdmin.js, which calls admin.firestore() on the mock.
 */
import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
const mockDeleteUser = jest.fn();
const mockAuth = jest.fn(() => ({
  verifyIdToken: mockVerifyIdToken,
  deleteUser: mockDeleteUser,
}));

const mockDocDelete = jest.fn();
const mockDoc = jest.fn(() => ({ delete: mockDocDelete }));
const mockFirestore = jest.fn(() => ({ doc: mockDoc }));

jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: mockAuth,
    firestore: mockFirestore,
  },
}));

const mockFollowDeleteMany = jest.fn();
const mockNotificationDeleteMany = jest.fn();
const mockEmailVerificationCodeDeleteMany = jest.fn();
const mockCodeSubmissionDeleteMany = jest.fn();
const mockUserProfileDeleteMany = jest.fn();
const mockTransaction = jest.fn();

jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    follow: { deleteMany: mockFollowDeleteMany },
    notification: { deleteMany: mockNotificationDeleteMany },
    emailVerificationCode: { deleteMany: mockEmailVerificationCodeDeleteMany },
    codeSubmission: { deleteMany: mockCodeSubmissionDeleteMany },
    userProfile: { deleteMany: mockUserProfileDeleteMany },
    $transaction: mockTransaction,
  },
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
  // Empty by default so the caller below is never treated as an exempt admin.
  process.env.ADMIN_UIDS = 'someone-else';

  // A verified account: the only state this route accepts.
  mockVerifyIdToken.mockResolvedValue({ uid: 'u1', email: 'ana@example.test', email_verified: true });

  mockFollowDeleteMany.mockResolvedValue({ count: 2 });
  mockNotificationDeleteMany.mockResolvedValue({ count: 1 });
  mockEmailVerificationCodeDeleteMany.mockResolvedValue({ count: 0 });
  mockCodeSubmissionDeleteMany.mockResolvedValue({ count: 1 });
  mockUserProfileDeleteMany.mockResolvedValue({ count: 1 });
  // The route passes an array of deleteMany promises; awaiting them is all
  // the real client does for an array-form transaction.
  mockTransaction.mockImplementation((operations) => Promise.all(operations));

  mockDocDelete.mockResolvedValue(undefined);
  mockDeleteUser.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
});

function deleteAccount(app, token = 'verified-token') {
  return request(app).delete('/api/auth/account').set('Authorization', `Bearer ${token}`);
}

describe('DELETE /api/auth/account', () => {
  test('rejects requests that are not signed in', async () => {
    const res = await request(createApp()).delete('/api/auth/account');

    expect(res.status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDoc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test('refuses an account whose email is not verified, deleting nothing', async () => {
    // No email_verified claim — the same state that sends users to /verify-email.
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'u1', email: 'ana@example.test' });

    const res = await deleteAccount(createApp());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDoc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  test('deletes every uid-keyed row, the Firestore doc, the Firebase user and the cookie', async () => {
    const res = await deleteAccount(createApp());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });

    // All five tables, each narrowed to this user's own rows. Code
    // submissions are keyed by submitterId rather than userId.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockFollowDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(mockNotificationDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(mockEmailVerificationCodeDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(mockCodeSubmissionDeleteMany).toHaveBeenCalledWith({ where: { submitterId: 'u1' } });
    expect(mockUserProfileDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });

    // The Firestore mirror doc, then the account itself.
    expect(mockDoc).toHaveBeenCalledWith('users/u1');
    expect(mockDocDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('u1');

    // Databases first, Firebase last: once the Firebase user is gone the
    // token can no longer be verified, so nothing may come after it.
    expect(mockTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteUser.mock.invocationCallOrder[0]
    );

    const setCookie = res.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toMatch(/__session=/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  test('treats a missing Firebase user as success — a retry of a finished deletion', async () => {
    const notFound = Object.assign(new Error('There is no user record'), {
      code: 'auth/user-not-found',
    });
    mockDeleteUser.mockRejectedValueOnce(notFound);

    const res = await deleteAccount(createApp());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });
    // The database rows and the mirror doc are still cleaned up.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDocDelete).toHaveBeenCalledTimes(1);
  });

  test('keeps the account when the database delete fails, touching nothing else', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('db down'));

    const res = await deleteAccount(createApp());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not delete your account. Please try again.' });
    // Firebase comes last precisely so a failed transaction leaves the
    // account intact and the user can simply try again.
    expect(mockDoc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('still deletes the account when the Firestore mirror cannot be removed', async () => {
    mockDocDelete.mockRejectedValueOnce(new Error('firestore down'));

    const res = await deleteAccount(createApp());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });
    expect(mockDeleteUser).toHaveBeenCalledWith('u1');
  });

  test('reports a Firebase failure and leaves the cookie in place', async () => {
    const failure = Object.assign(new Error('permission denied'), {
      code: 'auth/internal-error',
    });
    mockDeleteUser.mockRejectedValueOnce(failure);

    const res = await deleteAccount(createApp());

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not delete your account. Please try again.' });
    // No new cookie is issued — the response carries no Set-Cookie header,
    // so the existing session cookie is untouched for a retry.
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
