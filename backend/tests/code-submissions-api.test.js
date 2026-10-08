import { jest } from '@jest/globals';

const mockVerifyIdToken = jest.fn();
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn(() => ({ name: 'fake-app' })),
    credential: { cert: jest.fn((sa) => sa) },
    auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
  },
}));

const mockTx = {
  codeSubmission: { updateMany: jest.fn(), findUnique: jest.fn() },
  verifiedCode: { create: jest.fn() },
};
const mockPrisma = {
  codeSubmission: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
  },
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
  process.env.ADMIN_UIDS = 'admin-uid';
  mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', email: 'dev@example.test', developer: true });
  mockPrisma.codeSubmission.create.mockResolvedValue({
    id: 'cs-1',
    status: 'pending',
    submittedAt: new Date('2026-10-07T09:00:00Z'),
  });
  mockPrisma.codeSubmission.findMany.mockResolvedValue([]);
  mockPrisma.codeSubmission.groupBy.mockResolvedValue([]);
  mockPrisma.codeSubmission.updateMany.mockResolvedValue({ count: 1 });
    mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 1 });
  mockTx.codeSubmission.findUnique.mockResolvedValue({
    id: 'cs-1',
    title: 'Tyre delta',
    language: 'JavaScript',
    code: 'x = 1',
    description: null,
    tags: [],
    submitterId: 'dev-uid',
  });
  mockTx.verifiedCode.create.mockResolvedValue({ id: 'vc-1' });
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
});

function authed(req) {
  return req.set('Authorization', 'Bearer good-token');
}

function asAdmin() {
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid', email: 'admin@example.test', developer: false });
}

const VALID_BODY = {
  title: '  Tyre delta per stint  ',
  language: 'JavaScript',
  code: 'export const tyreDelta = (s) => s.delta;',
  description: 'Lap-time loss per lap.',
  tags: [],
};

describe('POST /api/code-submissions', () => {
  test('rejects a request with no Authorization header', async () => {
    const res = await request(createApp()).post('/api/code-submissions').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  test('rejects a signed-in user who is neither a developer nor an admin', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'plain-uid', email: null });
    const res = await authed(request(createApp()).post('/api/code-submissions')).send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
  });

  test('stores the submission as pending with the submitter and returns its id', async () => {
    const res = await authed(request(createApp()).post('/api/code-submissions')).send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'cs-1', status: 'pending' });
    expect(mockPrisma.codeSubmission.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.codeSubmission.create.mock.calls[0][0].data).toEqual({
      title: 'Tyre delta per stint',
      language: 'JavaScript',
      code: VALID_BODY.code,
      description: 'Lap-time loss per lap.',
      tags: [],
      submitterId: 'dev-uid',
      submitterEmail: 'dev@example.test',
      status: 'pending',
    });
  });

  test('ignores a status sent by the client', async () => {
    await authed(request(createApp()).post('/api/code-submissions')).send({ ...VALID_BODY, status: 'approved' });
    expect(mockPrisma.codeSubmission.create.mock.calls[0][0].data.status).toBe('pending');
  });

  test('returns 400 with the reasons for an invalid body and writes nothing', async () => {
    const res = await authed(request(createApp()).post('/api/code-submissions')).send({
      title: 'x',
      language: 'Ruby',
      code: '   ',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        'Title must be at least 3 characters.',
        'Language must be one of: JavaScript, Python.',
        'Code is required.',
      ])
    );
    expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/code-submissions', () => {
  test('is admin only', async () => {
    const res = await authed(request(createApp()).get('/api/code-submissions'));
    expect(res.status).toBe(403);
  });

  test('returns the rows and per-status counts from the database', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findMany.mockResolvedValue([{ id: 'cs-1', title: 'Tyre delta', status: 'pending' }]);
    mockPrisma.codeSubmission.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 2 } },
      { status: 'approved', _count: { _all: 5 } },
    ]);

    const res = await authed(request(createApp()).get('/api/code-submissions?status=pending'));

    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
    expect(res.body.counts).toEqual({ pending: 2, approved: 5, rejected: 0 });
    expect(mockPrisma.codeSubmission.findMany.mock.calls[0][0].where).toEqual({ status: 'pending' });
  });

  test('rejects an unknown status filter', async () => {
    asAdmin();
    const res = await authed(request(createApp()).get('/api/code-submissions?status=accepted'));
    expect(res.status).toBe(400);
    expect(mockPrisma.codeSubmission.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/code-submissions/:id', () => {
  test('returns 404 for an unknown id', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findUnique.mockResolvedValue(null);
    const res = await authed(request(createApp()).get('/api/code-submissions/nope'));
    expect(res.status).toBe(404);
  });

  test('returns the full submission including its code', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findUnique.mockResolvedValue({ id: 'cs-1', code: 'x = 1', status: 'pending' });
    const res = await authed(request(createApp()).get('/api/code-submissions/cs-1'));
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('x = 1');
  });
});

describe('PATCH /api/code-submissions/:id', () => {
  test('is admin only', async () => {
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status: 'approved' });
    expect(res.status).toBe(403);
    expect(mockTx.codeSubmission.updateMany).not.toHaveBeenCalled();
  });

  test.each(['approved', 'rejected'])('sets the status to %s and records who reviewed it', async (status) => {
    asAdmin();
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'cs-1', status });
    const args = mockTx.codeSubmission.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'cs-1', status: 'pending' });
    expect(args.data).toMatchObject({ status, reviewedBy: 'admin-uid' });
    expect(args.data.reviewedAt).toBeInstanceOf(Date);
  });

  test.each(['accepted', 'pending', undefined])('rejects status %p', async (status) => {
    asAdmin();
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status });
    expect(res.status).toBe(400);
    expect(mockTx.codeSubmission.updateMany).not.toHaveBeenCalled();
  });

  test('returns 404 when the submission does not exist', async () => {
    asAdmin();
    mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
    mockTx.codeSubmission.findUnique.mockResolvedValue(null);
    const res = await authed(request(createApp()).patch('/api/code-submissions/nope')).send({ status: 'approved' });
    expect(res.status).toBe(404);
    expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
  });

  test('returns 409 when the submission was already reviewed', async () => {
    asAdmin();
    mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
    mockTx.codeSubmission.findUnique.mockResolvedValue({ status: 'approved' });
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status: 'rejected' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already 'approved'/);
    expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
  });

  test('approving writes a matching VerifiedCode row', async () => {
    asAdmin();
    mockTx.codeSubmission.findUnique.mockResolvedValue({
      id: 'cs-1',
      title: 'Tyre delta',
      language: 'JavaScript',
      code: 'export const tyreDelta = (s) => s.delta;',
      description: 'Lap-time loss per lap.',
      tags: ['tyres'],
      submitterId: 'dev-uid',
    });

    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(mockTx.verifiedCode.create).toHaveBeenCalledWith({
      data: {
        sourceSubmissionId: 'cs-1',
        title: 'Tyre delta',
        language: 'JavaScript',
        code: 'export const tyreDelta = (s) => s.delta;',
        description: 'Lap-time loss per lap.',
        tags: ['tyres'],
        submitterId: 'dev-uid',
        verifiedBy: 'admin-uid',
      },
    });
  });

  test('rejecting does not write a VerifiedCode row', async () => {
    asAdmin();
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
  });
});
