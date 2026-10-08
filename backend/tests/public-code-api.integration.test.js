import { jest } from '@jest/globals';

// Approve -> publish -> call -> remove, against a real PostgreSQL database.
// Uses the real routes and the slug trigger from the migration; only
// Firebase token verification is stubbed. Opt-in, local verified_code_test_*
// databases only, because it deletes code rows.
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
  dev: { uid: 'dev-uid', email: 'dev@example.test', email_verified: true, developer: true },
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

const CODE = 'export function avgPitLoss(stops) {\n  // mean pit-lane loss, seconds\n  return stops.reduce((a, s) => a + s.pit_duration, 0) / stops.length;\n}\n';

async function submit(title, extra = {}) {
  const res = await request(app).post('/api/code-submissions').set('Authorization', 'Bearer dev')
    .send({ title, language: 'JavaScript', code: CODE, description: 'Mean pit-lane time lost per stop.', tags: ['Pits'], ...extra });
  expect(res.status).toBe(201);
  return res.body.id;
}
const approve = (id, admin = 'admin-a') => request(app).patch(`/api/code-submissions/${id}`)
  .set('Authorization', `Bearer ${admin}`).send({ status: 'approved' });

integration('approved code in the public API (PostgreSQL)', () => {
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
    await prisma.verifiedCode.deleteMany();
    await prisma.codeSubmission.deleteMany();
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.verifiedCode.deleteMany();
      await prisma.codeSubmission.deleteMany();
    } finally { await prisma.$disconnect(); }
  });

  test('an approved script is served at a slug made from its name, exactly as written', async () => {
    const id = await submit('Average pit loss');
    expect(await request(app).get('/api/v1/code/average-pit-loss').then((r) => r.status)).toBe(404);

    expect((await approve(id)).status).toBe(200);

    const res = await request(app).get('/api/v1/code/average-pit-loss');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      slug: 'average-pit-loss',
      name: 'Average pit loss',
      description: 'Mean pit-lane time lost per stop.',
      language: 'JavaScript',
      code: CODE,
      tags: ['pits'],
      approvedAt: expect.any(String),
      endpoint: '/api/v1/code/average-pit-loss',
    });
    const list = await request(app).get('/api/v1/code');
    expect(list.body.data.map((c) => c.slug)).toEqual(['average-pit-loss']);
  });

  test('pending and rejected scripts are not public', async () => {
    await submit('Still pending');
    const rejected = await submit('Rejected one');
    await request(app).patch(`/api/code-submissions/${rejected}`).set('Authorization', 'Bearer admin-a').send({ status: 'rejected' });

    expect((await request(app).get('/api/v1/code')).body.data).toEqual([]);
    expect((await request(app).get('/api/v1/code/still-pending')).status).toBe(404);
  });

  test('scripts with the same name get distinct, stable slugs, even when approved at the same moment', async () => {
    const first = await submit('Tyre delta');
    await approve(first);
    const [a, b] = [await submit('Tyre Delta!'), await submit('tyre  delta')];

    const results = await Promise.all([approve(a, 'admin-a'), approve(b, 'admin-b')]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);

    const slugs = (await request(app).get('/api/v1/code')).body.data.map((c) => c.slug).sort();
    expect(slugs).toEqual(['tyre-delta', 'tyre-delta-2', 'tyre-delta-3']);
  });

  test('an admin can remove a script; only that one disappears', async () => {
    await approve(await submit('Keep me'));
    await approve(await submit('Remove me'));
    const admin = await request(app).get('/api/admin/verified-code').set('Authorization', 'Bearer admin-a');
    const target = admin.body.code.find((c) => c.slug === 'remove-me');

    const res = await request(app).delete(`/api/admin/verified-code/${target.id}`).set('Authorization', 'Bearer admin-a');

    expect(res.body).toEqual({ id: target.id, slug: 'remove-me', removed: true });
    expect((await request(app).get('/api/v1/code/remove-me')).status).toBe(404);
    expect((await request(app).get('/api/v1/code/keep-me')).status).toBe(200);
    expect((await request(app).delete(`/api/admin/verified-code/${target.id}`).set('Authorization', 'Bearer admin-a')).status).toBe(404);
  });
});
