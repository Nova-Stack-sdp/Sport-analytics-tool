import { jest } from '@jest/globals';

// Runs the real review routes against a real PostgreSQL database, with only
// Firebase token verification stubbed. Opt-in, with the same safety rule as
// verified-code-storage.integration.test.js: these tests delete rows, so the
// target must be a dedicated local verified_code_test_* database.
const databaseUrl = process.env.VERIFIED_CODE_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || !/^\/verified_code_test_[a-z0-9_]+$/.test(target.pathname)) {
    throw new Error('VERIFIED_CODE_TEST_DATABASE_URL must target a dedicated local verified_code_test_* database');
  }
}
const integration = databaseUrl ? describe : describe.skip;

const USERS = {
  'admin-a': { uid: 'admin-a', email: 'a@example.test', email_verified: true },
  'admin-b': { uid: 'admin-b', email: 'b@example.test', email_verified: true },
};
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: jest.fn(() => ({
      verifyIdToken: async (token) => {
        if (!USERS[token]) throw new Error('bad token');
        return USERS[token];
      },
    })),
  },
}));

let app;
let request;
let prisma;

const submission = (id, extra = {}) => ({
  id,
  title: `Script ${id}`,
  language: 'JavaScript',
  code: `export const ${id.replace(/\W/g, '_')} = () => 1;`,
  description: 'Integration fixture',
  tags: ['test'],
  submitterId: 'dev-uid',
  submitterEmail: 'dev@example.test',
  submittedAt: new Date('2026-10-01T10:00:00Z'),
  ...extra,
});

const review = (id, status, token = 'admin-a') => request(app)
  .patch(`/api/code-submissions/${id}`)
  .set('Authorization', `Bearer ${token}`)
  .send({ status });

integration('code review moves approved code (PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
    process.env.ADMIN_UIDS = 'admin-a,admin-b';
    ({ prisma } = await import('../src/lib/prisma.js'));
    const { createApp } = await import('../src/app.js');
    ({ default: request } = await import('supertest'));
    app = createApp();
  });
  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: 'dev-uid' } });
    await prisma.verifiedCode.deleteMany();
    await prisma.codeSubmission.deleteMany();
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.notification.deleteMany({ where: { userId: 'dev-uid' } });
      await prisma.verifiedCode.deleteMany();
      await prisma.codeSubmission.deleteMany();
    } finally { await prisma.$disconnect(); }
  });

  test('approving leaves exactly one copy, in verified_code, with its full history', async () => {
    await prisma.codeSubmission.create({ data: submission('move-me') });

    const res = await review('move-me', 'approved');

    expect(res.status).toBe(200);
    expect(await prisma.codeSubmission.findUnique({ where: { id: 'move-me' } })).toBeNull();
    const verified = await prisma.verifiedCode.findUnique({ where: { sourceSubmissionId: 'move-me' } });
    expect(verified).toMatchObject({
      title: 'Script move-me',
      code: 'export const move_me = () => 1;',
      tags: ['test'],
      submitterId: 'dev-uid',
      submitterEmail: 'dev@example.test',
      submittedAt: new Date('2026-10-01T10:00:00Z'),
      verifiedBy: 'admin-a',
    });
  });

  test('approved code still shows in the admin list, counts and detail view', async () => {
    await prisma.codeSubmission.createMany({ data: [submission('will-approve'), submission('stays-pending')] });
    await review('will-approve', 'approved');

    const list = await request(app).get('/api/code-submissions?status=approved').set('Authorization', 'Bearer admin-a');
    expect(list.body.submissions.map((s) => s.id)).toEqual(['will-approve']);
    expect(list.body.counts).toEqual({ pending: 1, approved: 1, rejected: 0 });

    const detail = await request(app).get('/api/code-submissions/will-approve').set('Authorization', 'Bearer admin-a');
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ status: 'approved', code: 'export const will_approve = () => 1;' });
  });

  test('two admins approving at the same moment: one succeeds, one gets 409, one verified row', async () => {
    await prisma.codeSubmission.create({ data: submission('race-approve') });

    const results = await Promise.all([
      review('race-approve', 'approved', 'admin-a'),
      review('race-approve', 'approved', 'admin-b'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.verifiedCode.count({ where: { sourceSubmissionId: 'race-approve' } })).toBe(1);
    expect(await prisma.codeSubmission.count({ where: { id: 'race-approve' } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: 'dev-uid' } })).toBe(1);
  });

  test('approve and reject at the same moment: the code ends up in exactly one place', async () => {
    await prisma.codeSubmission.create({ data: submission('race-mixed') });

    const results = await Promise.all([
      review('race-mixed', 'approved', 'admin-a'),
      review('race-mixed', 'rejected', 'admin-b'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const verified = await prisma.verifiedCode.count({ where: { sourceSubmissionId: 'race-mixed' } });
    const remaining = await prisma.codeSubmission.findUnique({ where: { id: 'race-mixed' } });
    if (verified === 1) expect(remaining).toBeNull();
    else expect(remaining.status).toBe('rejected');
    const notifications = await prisma.notification.findMany({ where: { userId: 'dev-uid' } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe(`Code submission ${verified === 1 ? 'approved' : 'rejected'}`);
  });

  test('a rejected submission stays in code_submission and cannot be approved afterwards', async () => {
    await prisma.codeSubmission.create({ data: submission('rejected-one') });
    expect((await review('rejected-one', 'rejected')).status).toBe(200);

    const again = await review('rejected-one', 'approved');

    expect(again.status).toBe(409);
    expect((await prisma.codeSubmission.findUnique({ where: { id: 'rejected-one' } })).status).toBe('rejected');
    expect(await prisma.verifiedCode.count()).toBe(0);
  });
});
