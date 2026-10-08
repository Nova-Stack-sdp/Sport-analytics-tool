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
  verifiedCode: { findMany: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
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
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
  process.env.ADMIN_UIDS = 'admin-uid';
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid', email_verified: true });
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
  console.info.mockRestore();
});

const row = {
  id: 'vc-1', slug: 'average-pit-loss', title: 'Average pit loss', language: 'JavaScript',
  sourceSubmissionId: 'cs-1', submitterId: 'dev-uid', verifiedBy: 'admin-uid',
  verifiedAt: new Date('2026-10-08T12:00:00Z'),
};
const authed = (req) => req.set('Authorization', 'Bearer t');

test('admins can list published code with its public address', async () => {
  mockPrisma.verifiedCode.findMany.mockResolvedValue([row]);
  const res = await authed(request(createApp()).get('/api/admin/verified-code'));
  expect(res.status).toBe(200);
  expect(res.body.code).toEqual([{
    id: 'vc-1', slug: 'average-pit-loss', title: 'Average pit loss', language: 'JavaScript',
    sourceSubmissionId: 'cs-1', submitterId: 'dev-uid', verifiedBy: 'admin-uid',
    verifiedAt: '2026-10-08T12:00:00.000Z', endpoint: '/api/v1/code/average-pit-loss',
  }]);
});

test('removing deletes the published row and reports what was removed', async () => {
  mockPrisma.verifiedCode.findUnique.mockResolvedValue(row);
  mockPrisma.verifiedCode.deleteMany.mockResolvedValue({ count: 1 });

  const res = await authed(request(createApp()).delete('/api/admin/verified-code/vc-1'));

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: 'vc-1', slug: 'average-pit-loss', removed: true });
  expect(mockPrisma.verifiedCode.deleteMany).toHaveBeenCalledWith({ where: { id: 'vc-1' } });
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining('admin-uid removed published code vc-1'));
});

test('404 for unknown code, and for code removed by someone else in the meantime', async () => {
  mockPrisma.verifiedCode.findUnique.mockResolvedValue(null);
  expect((await authed(request(createApp()).delete('/api/admin/verified-code/nope'))).status).toBe(404);

  mockPrisma.verifiedCode.findUnique.mockResolvedValue(row);
  mockPrisma.verifiedCode.deleteMany.mockResolvedValue({ count: 0 });
  expect((await authed(request(createApp()).delete('/api/admin/verified-code/vc-1'))).status).toBe(404);
});

test('only admins: developers get 403, anonymous callers 401, and nothing is removed', async () => {
  expect((await request(createApp()).delete('/api/admin/verified-code/vc-1')).status).toBe(401);
  mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', developer: true, email_verified: true });
  expect((await authed(request(createApp()).delete('/api/admin/verified-code/vc-1'))).status).toBe(403);
  expect((await authed(request(createApp()).get('/api/admin/verified-code'))).status).toBe(403);
  expect(mockPrisma.verifiedCode.deleteMany).not.toHaveBeenCalled();
});
