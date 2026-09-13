import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
  },
}));

const mockRunDerivationForSession = jest.fn();
jest.unstable_mockModule('../src/derivation/index.js', () => ({
  runDerivationForSession: mockRunDerivationForSession,
}));

const mockTx = {
  submission: { create: jest.fn() },
  event: { createMany: jest.fn() },
};
const mockPrisma = {
  session: { findUnique: jest.fn() },
  entry: { findMany: jest.fn() },
  submission: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn((callback) => callback(mockTx)),
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
  // Default: a valid authenticated user, unless a specific test overrides this.
  mockVerifyIdToken.mockResolvedValue({ uid: 'test-uid', email: null });
  mockTx.submission.create.mockResolvedValue({ id: 'sub-1', status: 'pending' });
  mockTx.event.createMany.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

function authed(req) {
  return req.set('Authorization', 'Bearer good-token');
}

describe('POST /api/submissions — auth', () => {
  test('rejects a request with no Authorization header', async () => {
    const app = createApp();
    const res = await request(app).post('/api/submissions').send({ session_key: 11230 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/submissions — validation', () => {
  test('returns 400 without session_key', async () => {
    const app = createApp();
    const res = await authed(request(app).post('/api/submissions')).send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when no session matches the given session_key', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await authed(request(app).post('/api/submissions')).send({ session_key: 99999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No session found/);
  });
});

describe('POST /api/submissions — event processing', () => {
  beforeEach(() => {
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'session-1', openf1Key: 11230 });
    mockPrisma.entry.findMany.mockResolvedValue([
      { id: 'entry-1', driver: { driverNumber: 1 } },
    ]);
  });

  test('a fully valid submission lands pending with the event written', async () => {
    const app = createApp();
    const res = await authed(request(app).post('/api/submissions')).send({
      session_key: 11230,
      laps: [{ driver_number: 1, lap_number: 5, lap_duration: 81.2, date_start: '2026-03-07T05:10:00Z' }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.eventsWritten).toBe(1);
    expect(res.body.rejections).toHaveLength(0);
    expect(mockTx.event.createMany).toHaveBeenCalledTimes(1);
  });

  test('a submission where every record fails validation is auto-rejected', async () => {
    mockTx.submission.create.mockResolvedValue({ id: 'sub-1', status: 'rejected' });

    const app = createApp();
    const res = await authed(request(app).post('/api/submissions')).send({
      session_key: 11230,
      laps: [{ driver_number: 999, lap_number: 1, lap_duration: 80, date_start: '2026-03-07T05:10:00Z' }],
    });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe('rejected');
    expect(res.body.eventsWritten).toBe(0);
    expect(res.body.rejections).toHaveLength(1);
    // No events at all to write — createMany shouldn't even be called.
    expect(mockTx.event.createMany).not.toHaveBeenCalled();
  });

  test('a mixed batch lands pending, with the bad record reported alongside the good one', async () => {
    const app = createApp();
    const res = await authed(request(app).post('/api/submissions')).send({
      session_key: 11230,
      laps: [
        { driver_number: 1, lap_number: 1, lap_duration: 85, date_start: '2026-03-07T05:10:00Z' },
        { driver_number: 1, lap_number: 2, lap_duration: -5, date_start: '2026-03-07T05:11:00Z' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.eventsWritten).toBe(1);
    expect(res.body.rejections).toHaveLength(1);
    expect(res.body.rejections[0].reason).toBe('lap_duration is not positive');
  });

  test('the submitter is recorded from the authenticated user, not from the request body', async () => {
    const app = createApp();
    await authed(request(app).post('/api/submissions')).send({
      session_key: 11230,
      laps: [{ driver_number: 1, lap_number: 1, lap_duration: 80, date_start: '2026-03-07T05:10:00Z' }],
    });

    expect(mockTx.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ submitterId: 'test-uid', source: 'manual_upload' }),
      })
    );
  });
});

describe('GET /api/submissions', () => {
  test('returns the submission queue', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([
      { id: 'sub-1', status: 'pending', source: 'manual_upload' },
    ]);

    const app = createApp();
    const res = await authed(request(app).get('/api/submissions'));

    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
  });

  test('filters by status when provided', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([]);

    const app = createApp();
    await authed(request(app).get('/api/submissions?status=pending'));

    expect(mockPrisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' } })
    );
  });
});

describe('PATCH /api/submissions/:id', () => {
  test('returns 400 for an invalid status value', async () => {
    const app = createApp();
    const res = await authed(request(app).patch('/api/submissions/sub-1')).send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when the submission does not exist', async () => {
    mockPrisma.submission.findUnique.mockResolvedValue(null);

    const app = createApp();
    const res = await authed(request(app).patch('/api/submissions/missing')).send({ status: 'accepted' });

    expect(res.status).toBe(404);
  });

  test('returns 409 when the submission is not pending', async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', status: 'accepted' });

    const app = createApp();
    const res = await authed(request(app).patch('/api/submissions/sub-1')).send({ status: 'rejected' });

    expect(res.status).toBe(409);
  });

  test('approving a pending submission updates it and triggers derivation', async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', status: 'pending', sessionId: 'session-1' });
    mockPrisma.submission.update.mockResolvedValue({ id: 'sub-1', status: 'accepted' });

    const app = createApp();
    const res = await authed(request(app).patch('/api/submissions/sub-1')).send({ status: 'accepted' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(mockRunDerivationForSession).toHaveBeenCalledWith(mockPrisma, 'session-1');
    expect(mockPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewedBy: 'test-uid' }) })
    );
  });

  test('rejecting a pending submission updates it without triggering derivation', async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', status: 'pending', sessionId: 'session-1' });
    mockPrisma.submission.update.mockResolvedValue({ id: 'sub-1', status: 'rejected' });

    const app = createApp();
    const res = await authed(request(app).patch('/api/submissions/sub-1')).send({ status: 'rejected' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(mockRunDerivationForSession).not.toHaveBeenCalled();
  });
});
