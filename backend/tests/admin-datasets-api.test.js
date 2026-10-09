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

const mockPrisma = {
  submission: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  event: { findMany: jest.fn() },
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
  mockVerifyIdToken.mockResolvedValue({ uid: 'admin-uid', email: 'a@example.test', email_verified: true });
  mockPrisma.submission.findMany.mockResolvedValue([]);
  mockPrisma.submission.count.mockResolvedValue(0);
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
});

const get = (path) => request(createApp()).get(path).set('Authorization', 'Bearer t');

const datasetRow = (extra = {}) => ({
  id: 'sub-1',
  purpose: 'race_data',
  status: 'pending',
  submitterId: 'dev-uid',
  submittedAt: new Date('2026-10-08T10:00:00Z'),
  reviewedBy: null,
  reviewedAt: null,
  deletedAt: null,
  deletedBy: null,
  summary: { validRecords: 3, rejectedRecords: 1, eventsWritten: 3 },
  session: {
    id: 'session-1', openf1Key: 9999, type: 'Race', startTime: new Date('2026-09-06T13:00:00Z'),
    meeting: { name: 'Italian Grand Prix', season: 2026 },
  },
  upload: { sizeBytes: 512 },
  _count: { events: 3 },
  ...extra,
});

describe('access', () => {
  test('requires a signed-in admin', async () => {
    expect((await request(createApp()).get('/api/admin/datasets')).status).toBe(401);

    mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', developer: true, email_verified: true });
    const res = await get('/api/admin/datasets');
    expect(res.status).toBe(403);
    expect(mockPrisma.submission.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/datasets', () => {
  test('defaults to the pending race-data queue and returns every tab count', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([datasetRow()]);
    mockPrisma.submission.count
      .mockResolvedValueOnce(1).mockResolvedValueOnce(4).mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3).mockResolvedValueOnce(5);

    const res = await get('/api/admin/datasets');

    expect(res.status).toBe(200);
    expect(res.body.view).toBe('pending');
    expect(res.body.counts).toEqual({ pending: 1, accepted: 4, rejected: 2, test: 3, deleted: 5 });
    expect(mockPrisma.submission.findMany.mock.calls[0][0].where).toEqual({
      source: 'manual_upload', purpose: 'race_data', deletedAt: null, status: 'pending',
    });
    expect(res.body.datasets).toEqual([{
      id: 'sub-1',
      purpose: 'race_data',
      status: 'pending',
      submitterId: 'dev-uid',
      submittedAt: '2026-10-08T10:00:00.000Z',
      reviewedBy: null,
      reviewedAt: null,
      deletedAt: null,
      deletedBy: null,
      session: {
        id: 'session-1', sessionKey: 9999, type: 'Race', startTime: '2026-09-06T13:00:00.000Z',
        meetingName: 'Italian Grand Prix', season: 2026,
      },
      validRecords: 3,
      rejectedRecords: 1,
      eventCount: 3,
      hasOriginalUpload: true,
      uploadSizeBytes: 512,
      usedBy: null,
    }]);
  });

  test.each([
    ['accepted', { source: 'manual_upload', purpose: 'race_data', deletedAt: null, status: { in: ['accepted', 'partially_accepted'] } }],
    ['rejected', { source: 'manual_upload', purpose: 'race_data', deletedAt: null, status: 'rejected' }],
    ['test', { source: 'manual_upload', purpose: 'code_test', deletedAt: null }],
    ['deleted', { source: 'manual_upload', deletedAt: { not: null } }],
  ])('view=%s filters accordingly', async (view, where) => {
    await get(`/api/admin/datasets?view=${view}`);
    expect(mockPrisma.submission.findMany.mock.calls[0][0].where).toEqual(where);
  });

  test('never lists the automated OpenF1 sync batches', async () => {
    await get('/api/admin/datasets?view=accepted');
    for (const [args] of mockPrisma.submission.count.mock.calls) {
      expect(args.where.source).toBe('manual_upload');
    }
  });

  test('an older dataset without a summary or stored upload reports unknown counts', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([datasetRow({ summary: null, upload: null })]);
    const res = await get('/api/admin/datasets');
    expect(res.body.datasets[0]).toMatchObject({
      validRecords: null, rejectedRecords: null, hasOriginalUpload: false, uploadSizeBytes: null,
    });
  });

  test('test data says which script it was uploaded for, pending or published', async () => {
    mockPrisma.submission.findMany.mockResolvedValue([
      datasetRow({ id: 't1', purpose: 'code_test', testDataForCode: [{ id: 'cs-1', title: 'Tyre delta', status: 'pending' }], testDataForVerifiedCode: [] }),
      datasetRow({ id: 't2', purpose: 'code_test', testDataForCode: [], testDataForVerifiedCode: [{ sourceSubmissionId: 'cs-2', title: 'Pit loss', slug: 'pit-loss' }] }),
      datasetRow({ id: 't3', purpose: 'code_test', testDataForCode: [], testDataForVerifiedCode: [] }),
    ]);

    const res = await get('/api/admin/datasets?view=test');

    expect(res.body.datasets.map((d) => d.usedBy)).toEqual([
      { codeSubmissionId: 'cs-1', title: 'Tyre delta', status: 'pending' },
      { codeSubmissionId: 'cs-2', title: 'Pit loss', status: 'approved', slug: 'pit-loss' },
      null,
    ]);
    expect(mockPrisma.submission.findMany.mock.calls[0][0].select).toMatchObject({
      testDataForCode: { take: 1 }, testDataForVerifiedCode: { take: 1 },
    });
  });

  test('rejects an unknown view', async () => {
    const res = await get('/api/admin/datasets?view=everything');
    expect(res.status).toBe(400);
    expect(mockPrisma.submission.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/datasets/:id', () => {
  test('returns the dataset with its rejected records and original-upload details', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(datasetRow({
      validationErrors: [{ eventType: 'lap_completed', reason: 'unknown driver_number 77', record: { driver_number: 77 } }],
      upload: { sizeBytes: 512, sha256: 'abc', contentType: 'application/json', createdAt: new Date('2026-10-08T10:00:00Z') },
    }));

    const res = await get('/api/admin/datasets/sub-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.submission.findFirst.mock.calls[0][0].where).toEqual({ id: 'sub-1', source: 'manual_upload' });
    expect(res.body.rejections).toEqual([
      { eventType: 'lap_completed', reason: 'unknown driver_number 77', record: { driver_number: 77 } },
    ]);
    expect(res.body.upload).toEqual({
      kind: 'original', sizeBytes: 512, sha256: 'abc', contentType: 'application/json', createdAt: '2026-10-08T10:00:00.000Z',
    });
  });

  test('says the download will be rebuilt when no original was kept', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(datasetRow({ upload: null, validationErrors: null }));
    const res = await get('/api/admin/datasets/sub-1');
    expect(res.body.upload.kind).toBe('rebuilt');
    expect(res.body.rejections).toEqual([]);
  });

  test('404 for an unknown id or a sync batch', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(null);
    expect((await get('/api/admin/datasets/nope')).status).toBe(404);
  });
});

describe('GET /api/admin/datasets/:id/upload', () => {
  test('sends the original bytes unchanged, as an attachment', async () => {
    const raw = '{ "session_key": 9999,  "laps": [] }';
    mockPrisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1', purpose: 'race_data', submittedAt: new Date(), validationErrors: null,
      session: { openf1Key: 9999 },
      upload: { data: new Uint8Array(Buffer.from(raw)), contentType: 'application/json', sha256: 'abc123' },
    });

    const res = await get('/api/admin/datasets/sub-1/upload').buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="dataset-sub-1.json"');
    expect(res.headers['x-dataset-upload']).toBe('original');
    expect(res.headers['x-content-sha256']).toBe('abc123');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.toString('utf8')).toBe(raw);
    expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
  });

  test('rebuilds older datasets from their events and rejected records, clearly marked', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue({
      id: 'old-1', purpose: 'race_data', submittedAt: new Date('2026-09-01T00:00:00Z'),
      validationErrors: [{ eventType: 'lap_completed', reason: 'unknown driver_number 77', record: { driver_number: 77 } }],
      session: { openf1Key: 9999 },
      upload: null,
    });
    mockPrisma.event.findMany.mockResolvedValue([{
      eventType: 'lap_completed', lapNumber: 1, occurredAt: new Date('2026-09-06T13:03:00Z'),
      payload: { lap_time_ms: 81200 }, entry: { driver: { driverNumber: 1 } },
    }]);

    const res = await get('/api/admin/datasets/old-1/upload');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="dataset-old-1-rebuilt.json"');
    expect(res.headers['x-dataset-upload']).toBe('rebuilt');
    expect(mockPrisma.event.findMany.mock.calls[0][0].where).toEqual({ sourceSubmissionId: 'old-1' });
    expect(res.body).toMatchObject({
      rebuilt: true,
      submission_id: 'old-1',
      session_key: 9999,
      accepted_records: [{ event_type: 'lap_completed', driver_number: 1, lap_number: 1, payload: { lap_time_ms: 81200 } }],
      rejected_records: [{ eventType: 'lap_completed', reason: 'unknown driver_number 77', record: { driver_number: 77 } }],
    });
  });

  test('404 for an unknown dataset, and admins only', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(null);
    expect((await get('/api/admin/datasets/nope/upload')).status).toBe(404);

    mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', developer: true, email_verified: true });
    expect((await get('/api/admin/datasets/sub-1/upload')).status).toBe(403);
  });
});

describe('DELETE /api/admin/datasets/:id and POST /:id/restore', () => {
  const del = (id) => request(createApp()).delete(`/api/admin/datasets/${id}`).set('Authorization', 'Bearer t');
  const restore = (id) => request(createApp()).post(`/api/admin/datasets/${id}/restore`).set('Authorization', 'Bearer t');
  const state = (extra) => ({ id: 'sub-1', purpose: 'race_data', status: 'accepted', sessionId: 'session-1', deletedAt: null, ...extra });

  test('deleting accepted race data hides it and recomputes that session\'s statistics', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(state());
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 1 });

    const res = await del('sub-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'sub-1', deletedBy: 'admin-uid', statisticsRecalculated: true });
    const args = mockPrisma.submission.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'sub-1', deletedAt: null });
    expect(args.data.deletedBy).toBe('admin-uid');
    expect(args.data.deletedAt).toBeInstanceOf(Date);
    expect(mockRunDerivationForSession).toHaveBeenCalledWith(mockPrisma, 'session-1');
  });

  test.each([
    ['pending race data', { status: 'pending' }],
    ['rejected race data', { status: 'rejected' }],
    ['test data', { purpose: 'code_test', status: 'pending' }],
  ])('deleting %s does not touch statistics', async (_label, extra) => {
    mockPrisma.submission.findFirst.mockResolvedValue(state(extra));
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 1 });
    const res = await del('sub-1');
    expect(res.status).toBe(200);
    expect(res.body.statisticsRecalculated).toBe(false);
    expect(mockRunDerivationForSession).not.toHaveBeenCalled();
  });

  test('deleting twice answers 409 and recomputes nothing', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(state({ deletedAt: new Date() }));
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 0 });
    const res = await del('sub-1');
    expect(res.status).toBe(409);
    expect(mockRunDerivationForSession).not.toHaveBeenCalled();
  });

  test('a failed recompute still reports the delete as saved, with a warning', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(state());
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 1 });
    mockRunDerivationForSession.mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await del('sub-1');

    expect(res.status).toBe(200);
    expect(res.body.statisticsRecalculated).toBe(false);
    expect(res.body.warning).toMatch(/recalculating statistics failed/);
    spy.mockRestore();
  });

  test('restoring clears the deletion and recomputes accepted race data', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(state({ deletedAt: new Date() }));
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 1 });

    const res = await restore('sub-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'sub-1', deletedAt: null, statisticsRecalculated: true });
    expect(mockPrisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', deletedAt: { not: null } },
      data: { deletedAt: null, deletedBy: null },
    });
    expect(mockRunDerivationForSession).toHaveBeenCalledWith(mockPrisma, 'session-1');
  });

  test('restoring a dataset that is not deleted answers 409', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(state());
    mockPrisma.submission.updateMany.mockResolvedValue({ count: 0 });
    expect((await restore('sub-1')).status).toBe(409);
  });

  test('404 for unknown datasets; admins only', async () => {
    mockPrisma.submission.findFirst.mockResolvedValue(null);
    expect((await del('nope')).status).toBe(404);
    expect((await restore('nope')).status).toBe(404);

    mockVerifyIdToken.mockResolvedValue({ uid: 'dev-uid', developer: true, email_verified: true });
    expect((await del('sub-1')).status).toBe(403);
    expect(mockPrisma.submission.updateMany).not.toHaveBeenCalled();
  });
});

test('a cross-site frontend may read the download headers', async () => {
  mockPrisma.submission.findFirst.mockResolvedValue(null);
  const res = await get('/api/admin/datasets/sub-1/upload').set('Origin', 'http://localhost:3000');
  expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  expect(res.headers['access-control-expose-headers']).toBe('X-Dataset-Upload,X-Content-SHA256');
});
