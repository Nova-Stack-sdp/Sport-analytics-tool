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
  codeSubmission: { findUnique: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
  notification: { create: jest.fn() },
  verifiedCode: { create: jest.fn(), findUnique: jest.fn() },
};
const mockPrisma = {
  codeSubmission: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  },
  verifiedCode: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  submission: { findUnique: jest.fn() },
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
  mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', email: 'dev@example.test', developer: true, email_verified: true });
  mockPrisma.codeSubmission.create.mockResolvedValue({
    id: 'cs-1',
    status: 'pending',
    submittedAt: new Date('2026-10-07T09:00:00Z'),
  });
  mockPrisma.codeSubmission.findMany.mockResolvedValue([]);
  mockPrisma.codeSubmission.groupBy.mockResolvedValue([]);
  mockPrisma.verifiedCode.findMany.mockResolvedValue([]);
  mockPrisma.verifiedCode.findUnique.mockResolvedValue(null);
  mockPrisma.verifiedCode.count.mockResolvedValue(0);
  mockPrisma.codeSubmission.updateMany.mockResolvedValue({ count: 1 });
  mockTx.codeSubmission.findUnique.mockResolvedValue({
    id: 'cs-1',
    title: 'Tyre delta',
    language: 'JavaScript',
    code: 'x = 1',
    description: null,
    tags: [],
    status: 'pending',
    submitterId: 'dev-uid',
    submitterEmail: 'dev@example.test',
    submittedAt: new Date('2026-10-07T09:00:00Z'),
  });
  mockTx.codeSubmission.deleteMany.mockResolvedValue({ count: 1 });
  mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 1 });
  mockTx.notification.create.mockResolvedValue({ id: 'notification-1' });
  mockTx.verifiedCode.create.mockResolvedValue({ id: 'vc-1' });
  mockTx.verifiedCode.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
});

function authed(req) {
  return req.set('Authorization', 'Bearer good-token');
}

function asAdmin() {
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid', email: 'admin@example.test', developer: false, email_verified: true });
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

  test('rejects a developer whose email is not verified yet', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'dev-uid',
      email: 'dev@example.test',
      developer: true,
      email_verified: false,
    });
    const res = await authed(request(createApp()).post('/api/code-submissions')).send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
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
      testDatasetId: null,
      submitterId: 'dev-uid',
      submitterEmail: 'dev@example.test',
      status: 'pending',
    });
    expect(mockPrisma.submission.findUnique).not.toHaveBeenCalled();
  });

  describe('with test data attached', () => {
    const dataset = (extra = {}) => ({
      id: 'ds-1', submitterId: 'dev-uid', purpose: 'code_test', status: 'pending', deletedAt: null, ...extra,
    });
    beforeEach(() => {
      mockPrisma.submission.findUnique.mockResolvedValue(dataset());
      mockPrisma.codeSubmission.count.mockResolvedValue(0);
      mockPrisma.verifiedCode.count.mockResolvedValue(0);
      mockPrisma.codeSubmission.create.mockResolvedValue({
        id: 'cs-1', status: 'pending', submittedAt: new Date('2026-10-07T09:00:00Z'), testDatasetId: 'ds-1',
      });
    });
    const post = (testDatasetId) => authed(request(createApp()).post('/api/code-submissions')).send({ ...VALID_BODY, testDatasetId });

    test('links the developer\'s own test data to the code', async () => {
      const res = await post('ds-1');
      expect(res.status).toBe(201);
      expect(res.body.testDatasetId).toBe('ds-1');
      expect(mockPrisma.codeSubmission.create.mock.calls[0][0].data.testDatasetId).toBe('ds-1');
      expect(mockPrisma.codeSubmission.count).toHaveBeenCalledWith({ where: { testDatasetId: 'ds-1', status: 'pending' } });
    });

    test.each([
      ['someone else\'s upload', dataset({ submitterId: 'other-dev' }), 400, /not found among your uploads/],
      ['an unknown dataset', null, 400, /not found among your uploads/],
      ['race data', dataset({ purpose: 'race_data' }), 400, /uploaded as race data/],
      ['a deleted dataset', dataset({ deletedAt: new Date() }), 400, /deleted by an admin/],
      ['a dataset with no valid records', dataset({ status: 'rejected' }), 400, /None of the records/],
    ])('refuses %s, storing nothing', async (_label, found, status, message) => {
      mockPrisma.submission.findUnique.mockResolvedValue(found);
      const res = await post('ds-1');
      expect(res.status).toBe(status);
      expect(res.body.error).toMatch(message);
      expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
    });

    test.each([
      ['pending code', 1, 0],
      ['published code', 0, 1],
    ])('refuses test data already attached to %s (409)', async (_label, pending, published) => {
      mockPrisma.codeSubmission.count.mockResolvedValue(pending);
      mockPrisma.verifiedCode.count.mockResolvedValue(published);
      const res = await post('ds-1');
      expect(res.status).toBe(409);
      expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
    });

    test.each([[''], [42]])('refuses a malformed testDatasetId %p', async (value) => {
      const res = await post(value);
      expect(res.status).toBe(400);
      expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
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

  test.each([
    [undefined, 'Description is required: say what the code does.'],
    ['   ', 'Description is required: say what the code does.'],
    ['too short', 'Description must be at least 10 characters.'],
    ['x'.repeat(1001), 'Description must be at most 1000 characters.'],
  ])('requires a meaningful description (%p)', async (description, message) => {
    const res = await authed(request(createApp()).post('/api/code-submissions')).send({ ...VALID_BODY, description });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([message]);
    expect(mockPrisma.codeSubmission.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/code-submissions', () => {
  test('is admin only', async () => {
    const res = await authed(request(createApp()).get('/api/code-submissions'));
    expect(res.status).toBe(403);
  });

  test('returns pending rows and per-status counts, with approved counted from verified code', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findMany.mockResolvedValue([{ id: 'cs-1', title: 'Tyre delta', status: 'pending' }]);
    mockPrisma.codeSubmission.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 2 } },
      { status: 'rejected', _count: { _all: 1 } },
      // A leftover 'approved' code_submission row must not be counted; the
      // approved count comes from verified_code.
      { status: 'approved', _count: { _all: 9 } },
    ]);
    mockPrisma.verifiedCode.count.mockResolvedValue(5);

    const res = await authed(request(createApp()).get('/api/code-submissions?status=pending'));

    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
    expect(res.body.counts).toEqual({ pending: 2, approved: 5, rejected: 1 });
    expect(mockPrisma.codeSubmission.findMany.mock.calls[0][0].where).toEqual({ status: 'pending' });
    expect(mockPrisma.verifiedCode.findMany).not.toHaveBeenCalled();
  });

  const verifiedRow = {
    id: 'vc-1',
    sourceSubmissionId: 'cs-7',
    title: 'Average pit loss',
    language: 'JavaScript',
    submitterId: 'dev-uid',
    submitterEmail: 'dev@example.test',
    submittedAt: new Date('2026-10-06T08:00:00Z'),
    verifiedBy: 'admin-uid',
    verifiedAt: new Date('2026-10-07T08:00:00Z'),
  };

  test('the approved tab reads verified code, keyed by the original submission id', async () => {
    asAdmin();
    mockPrisma.verifiedCode.findMany.mockResolvedValue([verifiedRow]);

    const res = await authed(request(createApp()).get('/api/code-submissions?status=approved'));

    expect(res.status).toBe(200);
    expect(mockPrisma.codeSubmission.findMany).not.toHaveBeenCalled();
    expect(res.body.submissions).toEqual([{
      id: 'cs-7',
      verifiedCodeId: 'vc-1',
      title: 'Average pit loss',
      language: 'JavaScript',
      status: 'approved',
      submitterId: 'dev-uid',
      submitterEmail: 'dev@example.test',
      submittedAt: '2026-10-06T08:00:00.000Z',
      reviewedBy: 'admin-uid',
      reviewedAt: '2026-10-07T08:00:00.000Z',
      testDatasetId: null,
    }]);
  });

  test('with no filter, merges both tables newest first and never lists a leftover approved row twice', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findMany.mockResolvedValue([
      { id: 'cs-new', status: 'pending', submittedAt: new Date('2026-10-08T08:00:00Z') },
      { id: 'cs-old', status: 'rejected', submittedAt: new Date('2026-10-01T08:00:00Z') },
    ]);
    mockPrisma.verifiedCode.findMany.mockResolvedValue([verifiedRow]);

    const res = await authed(request(createApp()).get('/api/code-submissions'));

    expect(res.status).toBe(200);
    expect(mockPrisma.codeSubmission.findMany.mock.calls[0][0].where).toEqual({ status: { in: ['pending', 'rejected'] } });
    expect(res.body.submissions.map((s) => s.id)).toEqual(['cs-new', 'cs-7', 'cs-old']);
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
    expect(mockPrisma.verifiedCode.findUnique).not.toHaveBeenCalled();
  });

  test('finds approved code in verified_code by its original submission id', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findUnique.mockResolvedValue(null);
    mockPrisma.verifiedCode.findUnique.mockResolvedValue({
      id: 'vc-1',
      sourceSubmissionId: 'cs-7',
      title: 'Average pit loss',
      language: 'Python',
      code: 'def avg(stops): ...',
      description: 'Mean pit-lane loss',
      tags: ['pits'],
      submitterId: 'dev-uid',
      submitterEmail: 'dev@example.test',
      submittedAt: new Date('2026-10-06T08:00:00Z'),
      verifiedBy: 'admin-uid',
      verifiedAt: new Date('2026-10-07T08:00:00Z'),
    });

    const res = await authed(request(createApp()).get('/api/code-submissions/cs-7'));

    expect(res.status).toBe(200);
    expect(mockPrisma.verifiedCode.findUnique.mock.calls[0][0].where).toEqual({ sourceSubmissionId: 'cs-7' });
    expect(res.body).toMatchObject({
      id: 'cs-7',
      verifiedCodeId: 'vc-1',
      status: 'approved',
      code: 'def avg(stops): ...',
      description: 'Mean pit-lane loss',
      tags: ['pits'],
      reviewedBy: 'admin-uid',
    });
  });
});

describe('test data shown to reviewers', () => {
  const testDataset = {
    id: 'ds-1', status: 'pending', deletedAt: null,
    summary: { validRecords: 12, rejectedRecords: 2, eventsWritten: 0 },
    submittedAt: new Date('2026-10-06T07:00:00Z'),
    session: { openf1Key: 9999, type: 'Race', meeting: { name: 'Italian Grand Prix', season: 2026 } },
    upload: { sizeBytes: 2048 },
  };
  const SUMMARY = {
    id: 'ds-1', sessionKey: 9999, sessionLabel: 'Italian Grand Prix · Race 2026',
    validRecords: 12, rejectedRecords: 2, submittedAt: '2026-10-06T07:00:00.000Z',
    deleted: false, hasOriginalUpload: true,
  };

  test('a pending script\'s detail includes a summary of its test data', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findUnique.mockResolvedValue({ id: 'cs-1', code: 'x', status: 'pending', testDatasetId: 'ds-1', testDataset });
    const res = await authed(request(createApp()).get('/api/code-submissions/cs-1'));
    expect(res.status).toBe(200);
    expect(res.body.testDataset).toEqual(SUMMARY);
    expect(res.body.testDatasetId).toBe('ds-1');
    expect(mockPrisma.codeSubmission.findUnique.mock.calls[0][0].include.testDataset.select).toMatchObject({ summary: true, deletedAt: true });
  });

  test('an approved script keeps showing its test data, and a script without any shows null', async () => {
    asAdmin();
    mockPrisma.codeSubmission.findUnique.mockResolvedValue(null);
    mockPrisma.verifiedCode.findUnique.mockResolvedValue({
      id: 'vc-1', sourceSubmissionId: 'cs-7', title: 't', language: 'Python', code: 'x', description: 'd', tags: [],
      submitterId: 'dev-uid', submitterEmail: null, submittedAt: new Date(), verifiedBy: 'admin-uid', verifiedAt: new Date(),
      testDatasetId: 'ds-1', testDataset: { ...testDataset, deletedAt: new Date() },
    });
    const approved = await authed(request(createApp()).get('/api/code-submissions/cs-7'));
    expect(approved.body.testDataset).toEqual({ ...SUMMARY, deleted: true });

    mockPrisma.codeSubmission.findUnique.mockResolvedValue({ id: 'cs-2', code: 'x', status: 'pending', testDatasetId: null, testDataset: null });
    const none = await authed(request(createApp()).get('/api/code-submissions/cs-2'));
    expect(none.body.testDataset).toBeNull();
  });

  test('approval carries the test data link into verified code', async () => {
    asAdmin();
    mockTx.codeSubmission.findUnique.mockResolvedValue({
      id: 'cs-1', title: 't', language: 'Python', code: 'x', description: 'd', tags: [], status: 'pending',
      submitterId: 'dev-uid', submitterEmail: null, submittedAt: new Date('2026-10-07T09:00:00Z'), testDatasetId: 'ds-1',
    });
    const res = await authed(request(createApp()).patch('/api/code-submissions/cs-1')).send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(mockTx.verifiedCode.create.mock.calls[0][0].data.testDatasetId).toBe('ds-1');
  });
});

describe('PATCH /api/code-submissions/:id', () => {
  const patch = (id, body) => authed(request(createApp()).patch(`/api/code-submissions/${id}`)).send(body);

  test.each(['approved', 'rejected'])('%s notifies the submitter Firebase UID, ignoring a client recipient', async (status) => {
    asAdmin();
    const res = await patch('cs-1', { status, submitterId: 'someone-else', userId: 'admin-uid' });
    expect(res.status).toBe(200);
    expect(mockTx.notification.create).toHaveBeenCalledTimes(1);
    expect(mockTx.notification.create).toHaveBeenCalledWith({ data: {
      userId: 'dev-uid',
      type: 'system_alert',
      title: `Code submission ${status}`,
      message: `Your code submission "Tyre delta" (cs-1) has been ${status}.`,
      isRead: false,
    } });
  });

  test.each(['approved', 'rejected'])('%s aborts the transaction if notification creation fails', async (status) => {
    asAdmin();
    mockTx.notification.create.mockRejectedValueOnce(new Error('notification write failed'));
    let aborted = false;
    mockPrisma.$transaction.mockImplementationOnce(async (callback) => {
      try { return await callback(mockTx); } catch (err) { aborted = true; throw err; }
    });
    const res = await patch('cs-1', { status });
    expect(res.status).toBe(500);
    expect(aborted).toBe(true);
  });

  test.each(['approved', 'rejected'])('%s does not notify for a repeated review', async (status) => {
    asAdmin();
    mockTx.codeSubmission.findUnique.mockResolvedValue({ status: 'rejected' });
    mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
    const res = await patch('cs-1', { status });
    expect(res.status).toBe(409);
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  test('is admin only', async () => {
    const res = await patch('cs-1', { status: 'approved' });
    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.codeSubmission.updateMany).not.toHaveBeenCalled();
  });

  test.each(['accepted', 'pending', undefined])('rejects status %p', async (status) => {
    asAdmin();
    const res = await patch('cs-1', { status });
    expect(res.status).toBe(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.codeSubmission.updateMany).not.toHaveBeenCalled();
  });

  describe('approving', () => {
    test('moves the code: creates the verified row, then deletes the pending submission', async () => {
      asAdmin();
      mockTx.codeSubmission.findUnique.mockResolvedValue({
        id: 'cs-1',
        title: 'Tyre delta',
        language: 'JavaScript',
        code: 'export const tyreDelta = (s) => s.delta;',
        description: 'Lap-time loss per lap.',
        tags: ['tyres'],
        status: 'pending',
        submitterId: 'dev-uid',
        submitterEmail: 'dev@example.test',
        submittedAt: new Date('2026-10-07T09:00:00Z'),
      });

      const res = await patch('cs-1', { status: 'approved' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'cs-1', status: 'approved' });
      expect(mockTx.verifiedCode.create).toHaveBeenCalledWith({
        data: {
          sourceSubmissionId: 'cs-1',
          title: 'Tyre delta',
          language: 'JavaScript',
          code: 'export const tyreDelta = (s) => s.delta;',
          description: 'Lap-time loss per lap.',
          tags: ['tyres'],
          submitterId: 'dev-uid',
          submitterEmail: 'dev@example.test',
          submittedAt: new Date('2026-10-07T09:00:00Z'),
          testDatasetId: null,
          verifiedBy: 'admin-uid',
        },
      });
      expect(mockTx.codeSubmission.deleteMany).toHaveBeenCalledWith({ where: { id: 'cs-1', status: 'pending' } });
      // The insert happens before the delete, inside one transaction.
      expect(mockTx.verifiedCode.create.mock.invocationCallOrder[0])
        .toBeLessThan(mockTx.codeSubmission.deleteMany.mock.invocationCallOrder[0]);
      // Approval no longer flips the status on the old row.
      expect(mockPrisma.codeSubmission.updateMany).not.toHaveBeenCalled();
    });

    test('returns 404 when neither table has the id', async () => {
      asAdmin();
      mockTx.codeSubmission.findUnique.mockResolvedValue(null);
      const res = await patch('nope', { status: 'approved' });
      expect(res.status).toBe(404);
      expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
    });

    test('returns 409 when the code was already approved and moved', async () => {
      asAdmin();
      mockTx.codeSubmission.findUnique.mockResolvedValue(null);
      mockTx.verifiedCode.findUnique.mockResolvedValue({ id: 'vc-1' });
      const res = await patch('cs-1', { status: 'approved' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'approved'/);
      expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
    });

    test('returns 409 when the submission was already rejected', async () => {
      asAdmin();
      mockTx.codeSubmission.findUnique.mockResolvedValue({ id: 'cs-1', status: 'rejected' });
      const res = await patch('cs-1', { status: 'approved' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'rejected'/);
      expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
      expect(mockTx.codeSubmission.deleteMany).not.toHaveBeenCalled();
    });

    test('returns 409 and rolls back when a concurrent reject wins before the delete', async () => {
      asAdmin();
      mockTx.codeSubmission.findUnique
        .mockResolvedValueOnce({ id: 'cs-1', status: 'pending', title: 't', language: 'Python', code: 'x', tags: [] })
        .mockResolvedValueOnce({ status: 'rejected' });
      mockTx.codeSubmission.deleteMany.mockResolvedValue({ count: 0 });
      let rolledBack = false;
      mockPrisma.$transaction.mockImplementationOnce(async (callback) => {
        try { return await callback(mockTx); } catch (err) { rolledBack = true; throw err; }
      });

      const res = await patch('cs-1', { status: 'approved' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'rejected'/);
      expect(rolledBack).toBe(true);
    });

    test('returns 409 when a concurrent approval already created the verified row', async () => {
      asAdmin();
      mockTx.verifiedCode.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
      const res = await patch('cs-1', { status: 'approved' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'approved'/);
      expect(mockTx.codeSubmission.deleteMany).not.toHaveBeenCalled();
    });

    test('an unexpected database error is a 500, not a silent success', async () => {
      asAdmin();
      mockTx.verifiedCode.create.mockRejectedValue(new Error('connection lost'));
      const res = await patch('cs-1', { status: 'approved' });
      expect(res.status).toBe(500);
    });
  });

  describe('rejecting', () => {
    test('sets the status to rejected and records who reviewed it, without touching verified code', async () => {
      asAdmin();
      const res = await patch('cs-1', { status: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 'cs-1', status: 'rejected' });
      const args = mockTx.codeSubmission.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'cs-1', status: 'pending' });
      expect(args.data).toMatchObject({ status: 'rejected', reviewedBy: 'admin-uid' });
      expect(args.data.reviewedAt).toBeInstanceOf(Date);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.verifiedCode.create).not.toHaveBeenCalled();
    });

    test('returns 409 when the submission was already rejected', async () => {
      asAdmin();
      mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
      mockTx.codeSubmission.findUnique.mockResolvedValue({ status: 'rejected' });
      const res = await patch('cs-1', { status: 'rejected' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'rejected'/);
    });

    test('returns 409 when the code was already approved and moved', async () => {
      asAdmin();
      mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
      mockTx.codeSubmission.findUnique.mockResolvedValue(null);
      mockTx.verifiedCode.findUnique.mockResolvedValue({ id: 'vc-1' });
      const res = await patch('cs-1', { status: 'rejected' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already 'approved'/);
    });

    test('returns 404 when neither table has the id', async () => {
      asAdmin();
      mockTx.codeSubmission.updateMany.mockResolvedValue({ count: 0 });
      mockTx.codeSubmission.findUnique.mockResolvedValue(null);
      const res = await patch('nope', { status: 'rejected' });
      expect(res.status).toBe(404);
    });
  });
});
