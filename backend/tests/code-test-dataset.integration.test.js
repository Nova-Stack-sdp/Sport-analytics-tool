import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';

// Code + its test data, end to end against a real PostgreSQL database:
// upload test data -> attach it to code -> review -> publish/remove/reject.
// Only Firebase token verification is stubbed. Opt-in, local
// verified_code_test_* databases only, because it writes and deletes rows.
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
  other: { uid: 'other-dev', email: 'other@example.test', email_verified: true, developer: true },
  admin: { uid: 'admin-uid', email: 'admin@example.test', email_verified: true },
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

const ids = { circuit: randomUUID(), meeting: randomUUID(), session: randomUUID(), driver: randomUUID(), team: randomUUID(), entry: randomUUID() };
const SESSION_KEY = 800000 + Math.floor(Math.random() * 99999);
const DRIVER = 50 + Math.floor(Math.random() * 9);
const as = (who, req) => req.set('Authorization', `Bearer ${who}`);

async function uploadTestData(who = 'dev') {
  const res = await as(who, request(app).post('/api/submissions')).send({
    session_key: SESSION_KEY,
    purpose: 'code_test',
    laps: [{ driver_number: DRIVER, lap_number: 1, lap_duration: 81.2, date_start: '2026-09-06T13:03:00Z' }],
  });
  expect(res.status).toBe(201);
  return res.body.submissionId;
}
const submitCode = (title, testDatasetId, who = 'dev') => as(who, request(app).post('/api/code-submissions')).send({
  title, language: 'JavaScript', code: 'export const f = (laps) => laps.length;', description: 'Counts the laps in the test data.', testDatasetId,
});
const deletedAt = async (id) => (await prisma.submission.findUnique({ where: { id } })).deletedAt;

integration('code with test data (PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
    process.env.ADMIN_UIDS = 'admin-uid';
    ({ prisma } = await import('../src/lib/prisma.js'));
    const { createApp } = await import('../src/app.js');
    ({ default: request } = await import('supertest'));
    app = createApp();
    await prisma.verifiedCode.deleteMany();
    await prisma.codeSubmission.deleteMany();
    await prisma.circuit.create({ data: { id: ids.circuit, name: 'Monza', country: 'Italy', location: 'Monza' } });
    await prisma.meeting.create({ data: { id: ids.meeting, season: 2026, name: 'Italian Grand Prix', circuitId: ids.circuit, startDate: new Date('2026-09-06') } });
    await prisma.session.create({ data: { id: ids.session, openf1Key: SESSION_KEY, meetingId: ids.meeting, type: 'Race', startTime: new Date('2026-09-06T13:00:00Z'), status: 'finished' } });
    await prisma.driver.create({ data: { id: ids.driver, name: 'Test Driver', driverNumber: DRIVER } });
    await prisma.team.create({ data: { id: ids.team, name: `Team ${SESSION_KEY}`, season: 2026 } });
    await prisma.entry.create({ data: { id: ids.entry, sessionId: ids.session, driverId: ids.driver, teamId: ids.team } });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.verifiedCode.deleteMany();
      await prisma.codeSubmission.deleteMany();
      await prisma.submission.deleteMany({ where: { sessionId: ids.session } });
      await prisma.entry.deleteMany({ where: { id: ids.entry } });
      await prisma.team.deleteMany({ where: { id: ids.team } });
      await prisma.driver.deleteMany({ where: { id: ids.driver } });
      await prisma.session.deleteMany({ where: { id: ids.session } });
      await prisma.meeting.deleteMany({ where: { id: ids.meeting } });
      await prisma.circuit.deleteMany({ where: { id: ids.circuit } });
    } finally { await prisma.$disconnect(); }
  });

  test('test data attached to approved code stays live, and is retired when the code is removed', async () => {
    const datasetId = await uploadTestData();
    const created = await submitCode('Lap counter', datasetId);
    expect(created.status).toBe(201);
    expect(created.body.testDatasetId).toBe(datasetId);

    // The reviewer sees it with the code, and can download it.
    const detail = await as('admin', request(app).get(`/api/code-submissions/${created.body.id}`));
    expect(detail.body.testDataset).toMatchObject({ id: datasetId, sessionKey: SESSION_KEY, validRecords: 1, deleted: false, hasOriginalUpload: true });
    expect((await as('admin', request(app).get(`/api/admin/datasets/${datasetId}/upload`))).status).toBe(200);

    // Approving keeps the link and the data.
    expect((await as('admin', request(app).patch(`/api/code-submissions/${created.body.id}`)).send({ status: 'approved' })).status).toBe(200);
    const verified = await prisma.verifiedCode.findUnique({ where: { sourceSubmissionId: created.body.id } });
    expect(verified.testDatasetId).toBe(datasetId);
    expect(await deletedAt(datasetId)).toBeNull();
    expect((await request(app).get('/api/v1/code/lap-counter')).body.data.description).toBe('Counts the laps in the test data.');

    const tab = await as('admin', request(app).get('/api/admin/datasets?view=test'));
    expect(tab.body.datasets.find((d) => d.id === datasetId).usedBy).toEqual({
      codeSubmissionId: created.body.id, title: 'Lap counter', status: 'approved', slug: 'lap-counter',
    });

    // Removing the published code retires its test data.
    const removed = await as('admin', request(app).delete(`/api/admin/verified-code/${verified.id}`));
    expect(removed.body).toMatchObject({ removed: true, testDataRetired: true });
    expect(await deletedAt(datasetId)).not.toBeNull();
    expect((await request(app).get('/api/v1/code/lap-counter')).status).toBe(404);
  });

  test('rejecting code retires its test data in the same step', async () => {
    const datasetId = await uploadTestData();
    const created = await submitCode('Will be rejected', datasetId);

    expect((await as('admin', request(app).patch(`/api/code-submissions/${created.body.id}`)).send({ status: 'rejected' })).status).toBe(200);

    expect(await deletedAt(datasetId)).not.toBeNull();
    const row = await prisma.submission.findUnique({ where: { id: datasetId } });
    expect(row.deletedBy).toBe('admin-uid');
    const deleted = await as('admin', request(app).get('/api/admin/datasets?view=deleted'));
    expect(deleted.body.datasets.find((d) => d.id === datasetId).usedBy.status).toBe('rejected');
  });

  test('test data cannot be attached to someone else\'s code, twice, or without a description', async () => {
    const datasetId = await uploadTestData();
    expect((await submitCode('Someone else', datasetId, 'other')).status).toBe(400);
    expect((await submitCode('First use', datasetId)).status).toBe(201);
    expect((await submitCode('Second use', datasetId)).status).toBe(409);

    const noDescription = await as('dev', request(app).post('/api/code-submissions'))
      .send({ title: 'No description', language: 'Python', code: 'print(1)' });
    expect(noDescription.status).toBe(400);
    expect(await prisma.codeSubmission.count({ where: { title: { in: ['Someone else', 'Second use', 'No description'] } } })).toBe(0);
  });
});
