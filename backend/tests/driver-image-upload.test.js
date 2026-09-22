import { jest } from '@jest/globals';

const mockPrisma = {
  driver: { findUnique: jest.fn() },
  driverImage: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
};

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

// Signed in as long as an Authorization header is present; 401 otherwise.
jest.unstable_mockModule('../src/middleware/requireAuth.js', () => ({
  getAdminApp: () => ({ name: 'mock-admin-app' }),
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }
    req.user = { uid: 'user-1', email: 'a@b.c' };
    return next();
  },
}));

// The Firestore cache isn't under test here.
const mockGetCachedDriverImage = jest.fn();
jest.unstable_mockModule('../src/lib/driverImageCache.js', () => ({
  getCachedDriverImage: mockGetCachedDriverImage,
  getCachedDriverImageFlags: jest.fn().mockResolvedValue(new Map()),
  ensureDriverImageCached: jest.fn().mockResolvedValue(null),
}));

let createApp;
let request;

// Minimal valid signatures — the server only inspects the leading bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32, 3)]);

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.driver.findUnique.mockResolvedValue({ id: 'd1' });
  mockPrisma.driverImage.findUnique.mockResolvedValue(null);
  mockPrisma.driverImage.findMany.mockResolvedValue([]);
  mockPrisma.driverImage.upsert.mockResolvedValue({ updatedAt: new Date(1_700_000_000_000) });
  mockGetCachedDriverImage.mockResolvedValue(null);
});

describe('PUT /api/drivers/:id/image', () => {
  test('rejects requests that are not signed in', async () => {
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);

    expect(res.status).toBe(401);
    expect(mockPrisma.driverImage.upsert).not.toHaveBeenCalled();
  });

  test.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
  ])('stores a %s photo in the database and returns its version', async (type, bytes) => {
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', type)
      .send(bytes);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      driverId: 'd1',
      uploadedImageVersion: 1_700_000_000_000,
      contentType: type,
      sizeBytes: bytes.length,
    });
    const args = mockPrisma.driverImage.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ driverId: 'd1' });
    expect(args.create).toMatchObject({ driverId: 'd1', contentType: type, sizeBytes: bytes.length, uploadedBy: 'user-1' });
    expect(Buffer.from(args.create.data).equals(bytes)).toBe(true);
  });

  test('detects the real type from the bytes, not the Content-Type header', async () => {
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'image/jpeg')
      .send(PNG);

    expect(res.status).toBe(201);
    expect(res.body.contentType).toBe('image/png');
  });

  test('rejects files that are not a supported image (e.g. SVG or text)', async () => {
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));

    expect(res.status).toBe(415);
    expect(mockPrisma.driverImage.upsert).not.toHaveBeenCalled();
  });

  test('rejects an empty body', async () => {
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(0));

    expect(res.status).toBe(400);
  });

  test('rejects photos over 2 MB with 413', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await request(createApp())
      .put('/api/drivers/d1/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'image/jpeg')
      .send(big);

    expect(res.status).toBe(413);
    expect(mockPrisma.driverImage.upsert).not.toHaveBeenCalled();
  });

  test('404s for a driver that does not exist', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    const res = await request(createApp())
      .put('/api/drivers/nope/image')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);

    expect(res.status).toBe(404);
    expect(mockPrisma.driverImage.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/drivers/:id/image', () => {
  test('serves the uploaded photo, cached forever when the URL is versioned', async () => {
    mockPrisma.driverImage.findUnique.mockResolvedValue({
      data: PNG,
      contentType: 'image/png',
      updatedAt: new Date(5),
    });

    const res = await request(createApp()).get('/api/drivers/d1/image?v=5');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
    expect(mockGetCachedDriverImage).not.toHaveBeenCalled();
  });

  test('revalidates an unversioned URL, since the photo behind it can change', async () => {
    mockPrisma.driverImage.findUnique.mockResolvedValue({ data: JPEG, contentType: 'image/jpeg', updatedAt: new Date(5) });

    const res = await request(createApp()).get('/api/drivers/d1/image');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('falls back to the Firestore-cached headshot when nothing was uploaded', async () => {
    mockGetCachedDriverImage.mockResolvedValue({ base64: JPEG.toString('base64'), contentType: 'image/jpeg' });

    const res = await request(createApp()).get('/api/drivers/d1/image');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).equals(JPEG)).toBe(true);
  });

  test('404s when there is neither an upload nor a cached headshot', async () => {
    const res = await request(createApp()).get('/api/drivers/d1/image');
    expect(res.status).toBe(404);
  });
});

describe('uploadedImageVersion on driver payloads', () => {
  test('GET /api/drivers flags drivers that have an uploaded photo', async () => {
    mockPrisma.meeting = { findFirst: jest.fn().mockResolvedValue({ season: 2024 }) };
    mockPrisma.driverCareerStats = {
      findMany: jest.fn().mockResolvedValue([
        { driverId: 'd1', points: 10, wins: 0, podiums: 0, driver: { id: 'd1', name: 'A', driverNumber: 1, entries: [] } },
        { driverId: 'd2', points: 5, wins: 0, podiums: 0, driver: { id: 'd2', name: 'B', driverNumber: 2, entries: [] } },
      ]),
    };
    mockPrisma.driverImage.findMany.mockResolvedValue([{ driverId: 'd1', updatedAt: new Date(123) }]);
    global.fetch = jest.fn(() => Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve([]) }));

    const res = await request(createApp()).get('/api/drivers');
    delete global.fetch;

    expect(res.status).toBe(200);
    expect(res.body.drivers.find((d) => d.id === 'd1').uploadedImageVersion).toBe(123);
    expect(res.body.drivers.find((d) => d.id === 'd2').uploadedImageVersion).toBeNull();
  });
});
