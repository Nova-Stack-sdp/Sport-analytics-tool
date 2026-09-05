import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  delete process.env.FIREBASE_STORAGE_BUCKET;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete global.fetch;
});

afterEach(() => {
  delete global.fetch;
});

describe('GET /api/images', () => {
  test('rejects untrusted image sources before fetching them', async () => {
    const app = createApp();
    const res = await request(app).get('/api/images?source=https%3A%2F%2Fexample.com%2Fimage.png');

    expect(res.status).toBe(400);
    expect(global.fetch).toBeUndefined();
  });

  test('proxies a trusted image and serves later requests from memory cache', async () => {
    const source = 'https://media.api-sports.io/formula-1/drivers/cache-test.png';
    const image = Buffer.from([137, 80, 78, 71]);
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'image/png', 'content-length': String(image.length) }),
      arrayBuffer: jest.fn().mockResolvedValue(image),
    });
    const app = createApp();

    const first = await request(app).get(`/api/images?source=${encodeURIComponent(source)}`);
    const second = await request(app).get(`/api/images?source=${encodeURIComponent(source)}`);

    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('image/png');
    expect(first.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(second.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns a gateway error when a trusted upstream image cannot be loaded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 503,
      ok: false,
      headers: new Headers(),
    });
    const app = createApp();
    const res = await request(app).get('/api/images?source=https%3A%2F%2Fmedia.api-sports.io%2Fformula-1%2Fdrivers%2Funavailable.png');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Could not retrieve image' });
  });
});
