import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

let createApp;
let request;

function mockFetch(responses) {
  global.fetch = jest.fn((url) => {
    for (const r of responses) {
      if (url.includes(r.url)) {
        const status = r.status ?? 200;
        const ok = r.ok !== undefined ? r.ok : status < 400;
        if (!ok) {
          return Promise.resolve({ status, ok: false, text: () => Promise.resolve('error') });
        }
        return Promise.resolve({ status, ok: true, json: () => Promise.resolve(r.body) });
      }
    }
    return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({}) });
  });
}

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.YOUTUBE_API_KEY;
  delete global.fetch;
});

describe('GET /api/videos/popular', () => {
  test('returns fallback videos when no YouTube API key is configured', async () => {
    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.videos).toHaveLength(4);
    expect(res.body.videos[0]).toMatchObject({
      id: '3OMLs3yI-KE',
      videoId: '3OMLs3yI-KE',
      rank: 1,
      title: expect.any(String),
      sub: expect.any(String),
      thumbnailUrl: expect.stringContaining('i.ytimg.com'),
      youtubeUrl: expect.stringContaining('youtube.com'),
    });
  });

  test('returns live YouTube videos enriched with view counts', async () => {
    process.env.YOUTUBE_API_KEY = 'yt-test-key';
    mockFetch([
      {
        url: 'googleapis.com/youtube/v3/search',
        body: {
          items: [
            { id: { videoId: 'video1' } },
            { id: { videoId: 'video2' } },
          ],
        },
      },
      {
        url: 'googleapis.com/youtube/v3/videos',
        body: {
          items: [
            { id: 'video1', snippet: { title: 'Race Highlights 1', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '2500000' } },
            { id: 'video2', snippet: { title: 'Race Highlights 2', publishedAt: '2026-08-02T00:00:00Z' }, statistics: { viewCount: '1500' } },
          ],
        },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('youtube');
    expect(res.body.videos).toHaveLength(2);
    expect(res.body.videos[0]).toMatchObject({
      id: 'video1',
      rank: 1,
      title: 'Race Highlights 1',
      sub: '2.5M views · 2026',
    });
    expect(res.body.videos[1].sub).toBe('2K views · 2026');
  });

  test('uses fallback video list with youtube source when search returns no videos', async () => {
    process.env.YOUTUBE_API_KEY = 'yt-test-key';
    mockFetch([
      { url: 'googleapis.com/youtube/v3/search', body: { items: [] } },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('youtube');
    expect(res.body.videos[0].id).toBe('3OMLs3yI-KE');
  });

  test('falls back when YouTube API errors', async () => {
    process.env.YOUTUBE_API_KEY = 'yt-test-key';
    mockFetch([
      { url: 'googleapis.com/youtube/v3/search', status: 500, ok: false },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
    expect(res.body.videos).toHaveLength(4);
  });

  test('ignores whitespace-only API key and uses fallback', async () => {
    process.env.YOUTUBE_API_KEY = '   ';
    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback');
  });

  test('formats low view counts without suffix', async () => {
    process.env.YOUTUBE_API_KEY = 'yt-test-key';
    mockFetch([
      {
        url: 'googleapis.com/youtube/v3/search',
        body: { items: [{ id: { videoId: 'low' } }] },
      },
      {
        url: 'googleapis.com/youtube/v3/videos',
        body: {
          items: [
            { id: 'low', snippet: { title: 'Low Views', publishedAt: '2026-08-01T00:00:00Z' }, statistics: { viewCount: '900' } },
          ],
        },
      },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/videos/popular');

    expect(res.status).toBe(200);
    expect(res.body.videos[0].sub).toBe('900 views · 2026');
  });

});
