import { jest } from '@jest/globals';
import { randomUUID, createHash } from 'node:crypto';

// End-to-end dataset lifecycle against a real PostgreSQL database: the real
// routes, derivation and visibility filters, with only Firebase token
// verification stubbed. Opt-in, and only against a dedicated local
// verified_code_test_* database, because it writes and deletes rows.
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

const ids = {
  circuit: randomUUID(), meeting: randomUUID(), session: randomUUID(),
  driver: randomUUID(), team: randomUUID(), entry: randomUUID(),
};
const SESSION_KEY = 900000 + Math.floor(Math.random() * 99999);
const DRIVER_NUMBER = 90 + Math.floor(Math.random() * 9);

const as = (who, req) => req.set('Authorization', `Bearer ${who}`);
const lapsBody = (purpose) => JSON.stringify({
  session_key: SESSION_KEY,
  ...(purpose && { purpose }),
  laps: [
    { driver_number: DRIVER_NUMBER, lap_number: 1, lap_duration: 81.234, date_start: '2026-09-06T13:03:00Z' },
    { driver_number: DRIVER_NUMBER, lap_number: 2, lap_duration: 80.5, date_start: '2026-09-06T13:04:21Z' },
    { driver_number: 1, lap_number: 1, lap_duration: 82, date_start: '2026-09-06T13:03:00Z' },
  ],
}, null, 3);
const upload = (body) => as('dev', request(app).post('/api/submissions')).set('Content-Type', 'application/json').send(body);
const v1Events = async () => (await request(app).get(`/api/v1/events?fixture=${ids.session}`)).body.data;
const fastestLap = async () => (await prisma.driverSessionStats.findUnique({ where: { entryId: ids.entry } }))?.fastestLapMs ?? null;

integration('dataset lifecycle (PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
    process.env.ADMIN_UIDS = 'admin-uid';
    ({ prisma } = await import('../src/lib/prisma.js'));
    const { createApp } = await import('../src/app.js');
    ({ default: request } = await import('supertest'));
    app = createApp();

    await prisma.circuit.create({ data: { id: ids.circuit, name: 'Monza', country: 'Italy', location: 'Monza' } });
    await prisma.meeting.create({ data: { id: ids.meeting, season: 2026, name: 'Italian Grand Prix', circuitId: ids.circuit, startDate: new Date('2026-09-06') } });
    await prisma.session.create({ data: { id: ids.session, openf1Key: SESSION_KEY, meetingId: ids.meeting, type: 'Race', startTime: new Date('2026-09-06T13:00:00Z'), status: 'finished' } });
    await prisma.driver.create({ data: { id: ids.driver, name: 'Test Driver', driverNumber: DRIVER_NUMBER } });
    await prisma.team.create({ data: { id: ids.team, name: `Test Team ${SESSION_KEY}`, season: 2026 } });
    await prisma.entry.create({ data: { id: ids.entry, sessionId: ids.session, driverId: ids.driver, teamId: ids.team } });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const subs = await prisma.submission.findMany({ where: { sessionId: ids.session }, select: { id: true } });
      const subIds = subs.map((s) => s.id);
      await prisma.event.deleteMany({ where: { sourceSubmissionId: { in: subIds } } });
      await prisma.submission.deleteMany({ where: { id: { in: subIds } } }); // uploads cascade
      await prisma.driverSessionStats.deleteMany({ where: { entryId: ids.entry } });
      await prisma.driverCareerStats.deleteMany({ where: { driverId: ids.driver } });
      await prisma.teamSeasonStats.deleteMany({ where: { teamId: ids.team } });
      await prisma.entry.deleteMany({ where: { id: ids.entry } });
      await prisma.team.deleteMany({ where: { id: ids.team } });
      await prisma.driver.deleteMany({ where: { id: ids.driver } });
      await prisma.session.deleteMany({ where: { id: ids.session } });
      await prisma.meeting.deleteMany({ where: { id: ids.meeting } });
      await prisma.circuit.deleteMany({ where: { id: ids.circuit } });
    } finally { await prisma.$disconnect(); }
  });

  let raceId;
  let testId;
  const raceRaw = lapsBody();

  test('race data: events written, original upload stored byte for byte', async () => {
    const res = await upload(raceRaw);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ purpose: 'race_data', validRecords: 2, eventsWritten: 2 });
    expect(res.body.rejections).toHaveLength(1);
    raceId = res.body.submissionId;

    const stored = await prisma.submissionUpload.findUnique({ where: { submissionId: raceId } });
    expect(Buffer.from(stored.data).toString('utf8')).toBe(raceRaw);
    expect(stored.sha256).toBe(createHash('sha256').update(raceRaw).digest('hex'));
    expect(await prisma.event.count({ where: { sourceSubmissionId: raceId } })).toBe(2);
  });

  test('test data: validated and stored, but no events and no review', async () => {
    const res = await upload(lapsBody('code_test'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ purpose: 'code_test', validRecords: 2, eventsWritten: 0 });
    testId = res.body.submissionId;
    expect(await prisma.event.count({ where: { sourceSubmissionId: testId } })).toBe(0);
    expect(await prisma.submissionUpload.count({ where: { submissionId: testId } })).toBe(1);

    const review = await as('admin', request(app).patch(`/api/submissions/${testId}`)).send({ status: 'accepted' });
    expect(review.status).toBe(409);
  });

  test('the admin list puts each dataset under the right tab', async () => {
    const pending = await as('admin', request(app).get('/api/admin/datasets?view=pending'));
    const test = await as('admin', request(app).get('/api/admin/datasets?view=test'));
    expect(pending.body.datasets.map((d) => d.id)).toContain(raceId);
    expect(test.body.datasets.map((d) => d.id)).toContain(testId);
    expect(pending.body.datasets.find((d) => d.id === raceId)).toMatchObject({
      validRecords: 2, rejectedRecords: 1, eventCount: 2, hasOriginalUpload: true,
      session: { sessionKey: SESSION_KEY, meetingName: 'Italian Grand Prix' },
    });
  });

  test('accepting race data makes it count: statistics and public events', async () => {
    const res = await as('admin', request(app).patch(`/api/submissions/${raceId}`)).send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(await fastestLap()).toBe(80500);
    expect(await v1Events()).toHaveLength(2);
  });

  test('downloading returns the exact original upload', async () => {
    const res = await as('admin', request(app).get(`/api/admin/datasets/${raceId}/upload`))
      .buffer(true).parse((r, cb) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['x-dataset-upload']).toBe('original');
    expect(res.body.toString('utf8')).toBe(raceRaw);
  });

  test('deleting hides it everywhere and recalculates the statistics', async () => {
    const res = await as('admin', request(app).delete(`/api/admin/datasets/${raceId}`));
    expect(res.status).toBe(200);
    expect(res.body.statisticsRecalculated).toBe(true);

    expect(await fastestLap()).toBeNull();
    expect(await v1Events()).toHaveLength(0);
    const fixtureEvents = await request(app).get(`/api/fixtures/${ids.session}/events`);
    expect(fixtureEvents.body.events).toHaveLength(0);
    // Nothing was actually removed: the rows are still there for a restore.
    expect(await prisma.event.count({ where: { sourceSubmissionId: raceId } })).toBe(2);
    expect(await prisma.submissionUpload.count({ where: { submissionId: raceId } })).toBe(1);

    const deleted = await as('admin', request(app).get('/api/admin/datasets?view=deleted'));
    expect(deleted.body.datasets.map((d) => d.id)).toContain(raceId);
    const review = await as('admin', request(app).patch(`/api/submissions/${raceId}`)).send({ status: 'rejected' });
    expect(review.status).toBe(409);
  });

  test('restoring brings it back, statistics included', async () => {
    const res = await as('admin', request(app).post(`/api/admin/datasets/${raceId}/restore`));
    expect(res.status).toBe(200);
    expect(res.body.statisticsRecalculated).toBe(true);
    expect(await fastestLap()).toBe(80500);
    expect(await v1Events()).toHaveLength(2);
  });
});
