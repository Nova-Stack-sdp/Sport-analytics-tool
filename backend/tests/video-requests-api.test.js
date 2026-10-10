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
  videoRequest: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  notification: { create: jest.fn() },
  $transaction: jest.fn((operations) => Promise.all(operations)),
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;
let parseYouTubeId;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
  ({ parseYouTubeId } = await import('../src/lib/youtube.js'));
});

const FAN = { uid: 'fan-uid', email: 'fan@example.com' };
const ADMIN = { uid: 'admin-uid', email: 'admin@example.com' };
const as = (req, user) => {
  mockVerifyIdToken.mockResolvedValue(user);
  return req.set('Authorization', 'Bearer good-token');
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'test-project' });
  process.env.ADMIN_UIDS = 'admin-uid';
  mockPrisma.videoRequest.count.mockResolvedValue(0);
  mockPrisma.videoRequest.create.mockImplementation(async ({ data }) => ({
    id: 'vr-1',
    status: 'pending',
    ...data,
  }));
  mockPrisma.videoRequest.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  mockPrisma.notification.create.mockImplementation(async ({ data }) => ({ id: 'n-1', ...data }));
});

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.ADMIN_UIDS;
});

describe('parseYouTubeId — whatever a user pastes', () => {
  test.each([
    ['https://www.youtube.com/watch?v=UO4c-wMLhso', 'UO4c-wMLhso'],
    ['https://www.youtube.com/watch?feature=share&v=UO4c-wMLhso&t=42', 'UO4c-wMLhso'],
    ['https://youtu.be/UO4c-wMLhso?t=10', 'UO4c-wMLhso'],
    ['youtube.com/embed/UO4c-wMLhso', 'UO4c-wMLhso'],
    ['https://www.youtube-nocookie.com/embed/UO4c-wMLhso?start=184', 'UO4c-wMLhso'],
    ['https://www.youtube.com/shorts/UO4c-wMLhso', 'UO4c-wMLhso'],
    ['https://m.youtube.com/live/UO4c-wMLhso', 'UO4c-wMLhso'],
    [
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/UO4c-wMLhso" title="YouTube video player" allowfullscreen></iframe>',
      'UO4c-wMLhso',
    ],
    ['UO4c-wMLhso', 'UO4c-wMLhso'],
  ])('%s', (input, id) => {
    expect(parseYouTubeId(input)).toBe(id);
  });

  test.each([
    'https://vimeo.com/123456',
    'https://www.youtube.com/channel/UCabc',
    'https://www.youtube.com/watch?v=short',
    'https://evil.example/watch?v=UO4c-wMLhso',
    'not a link',
    '',
    null,
  ])('rejects %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe('POST /api/video-requests', () => {
  test('needs a signed-in user, so they can be told the outcome', async () => {
    const res = await request(createApp()).post('/api/video-requests').send({ raceName: 'X' });
    expect(res.status).toBe(401);
    expect(mockPrisma.videoRequest.create).not.toHaveBeenCalled();
  });

  test('a YouTube link is stored pending with the video ID read from it', async () => {
    const res = await as(request(createApp()).post('/api/video-requests'), FAN).send({
      raceName: '  Indy Toronto 2024 ',
      videoUrl: 'https://youtu.be/UO4c-wMLhso',
      notes: 'Full race replay',
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.videoRequest.create).toHaveBeenCalledWith({
      data: {
        userId: 'fan-uid',
        userEmail: 'fan@example.com',
        raceName: 'Indy Toronto 2024',
        videoUrl: 'https://youtu.be/UO4c-wMLhso',
        youtubeId: 'UO4c-wMLhso',
        hostedDescription: null,
        notes: 'Full race replay',
      },
    });
    expect(res.body.request.status).toBe('pending');
  });

  test('a description of where the video is hosted is enough without a link', async () => {
    const res = await as(request(createApp()).post('/api/video-requests'), FAN).send({
      raceName: 'Long Beach 2024',
      hostedDescription: 'INDYCAR channel, "Full Race | 2024 Grand Prix of Long Beach", April 2024',
    });
    expect(res.status).toBe(201);
    expect(mockPrisma.videoRequest.create.mock.calls[0][0].data).toMatchObject({
      youtubeId: null,
      videoUrl: null,
    });
  });

  test('refuses what a developer could not check', async () => {
    const app = createApp();
    const cases = [
      [{ videoUrl: 'https://youtu.be/UO4c-wMLhso' }, /which race/],
      [{ raceName: 'X', videoUrl: 'https://vimeo.com/1' }, /not a YouTube video/],
      [{ raceName: 'X' }, /YouTube link, or describe/],
      [{ raceName: 'X', hostedDescription: 'youtube' }, /YouTube link, or describe/],
    ];
    for (const [body, error] of cases) {
      const res = await as(request(app).post('/api/video-requests'), FAN).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(error);
    }
    expect(mockPrisma.videoRequest.create).not.toHaveBeenCalled();
  });

  test('a user with five videos already waiting is asked to wait', async () => {
    mockPrisma.videoRequest.count.mockResolvedValue(5);
    const res = await as(request(createApp()).post('/api/video-requests'), FAN).send({
      raceName: 'X',
      videoUrl: 'UO4c-wMLhso',
    });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/video-requests', () => {
  test("a user sees only their own requests", async () => {
    mockPrisma.videoRequest.findMany.mockResolvedValue([{ id: 'vr-1' }]);
    const res = await as(request(createApp()).get('/api/video-requests/mine'), FAN);
    expect(res.status).toBe(200);
    expect(mockPrisma.videoRequest.findMany.mock.calls[0][0].where).toEqual({ userId: 'fan-uid' });
  });

  test('the review queue is for admins only, oldest pending first', async () => {
    expect((await as(request(createApp()).get('/api/video-requests'), FAN)).status).toBe(403);
    mockPrisma.videoRequest.findMany.mockResolvedValue([]);
    const res = await as(request(createApp()).get('/api/video-requests?status=pending'), ADMIN);
    expect(res.status).toBe(200);
    expect(mockPrisma.videoRequest.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('PATCH /api/video-requests/:id — the copyright review', () => {
  const pending = { id: 'vr-1', userId: 'fan-uid', raceName: 'Indy Toronto 2024', status: 'pending' };

  test('approving tells the requester their video is live', async () => {
    mockPrisma.videoRequest.findUnique.mockResolvedValue(pending);
    const res = await as(request(createApp()).patch('/api/video-requests/vr-1'), ADMIN).send({
      status: 'approved',
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.videoRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'approved',
      reviewedBy: 'admin-uid',
    });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'fan-uid',
        type: 'system_alert',
        title: 'Your race video is live',
        linkUrl: '/telemetry-tv',
      }),
    });
  });

  test('rejecting needs a reason, and the requester is told it', async () => {
    mockPrisma.videoRequest.findUnique.mockResolvedValue(pending);
    const app = createApp();
    const missing = await as(request(app).patch('/api/video-requests/vr-1'), ADMIN).send({
      status: 'rejected',
    });
    expect(missing.status).toBe(400);

    const res = await as(request(app).patch('/api/video-requests/vr-1'), ADMIN).send({
      status: 'rejected',
      reviewNote: 'The upload is blocked for copyright in most regions.',
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.notification.create.mock.calls[0][0].data.message).toBe(
      'The video you sent for Indy Toronto 2024 was not added: The upload is blocked for copyright in most regions.'
    );
  });

  test('only admins review, only once, and only real requests', async () => {
    const app = createApp();
    expect(
      (await as(request(app).patch('/api/video-requests/vr-1'), FAN).send({ status: 'approved' })).status
    ).toBe(403);

    mockPrisma.videoRequest.findUnique.mockResolvedValue({ ...pending, status: 'approved' });
    expect(
      (await as(request(app).patch('/api/video-requests/vr-1'), ADMIN).send({ status: 'approved' })).status
    ).toBe(409);

    mockPrisma.videoRequest.findUnique.mockResolvedValue(null);
    expect(
      (await as(request(app).patch('/api/video-requests/nope'), ADMIN).send({ status: 'approved' })).status
    ).toBe(404);

    expect(
      (await as(request(app).patch('/api/video-requests/vr-1'), ADMIN).send({ status: 'maybe' })).status
    ).toBe(400);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
