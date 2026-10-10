import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createF1NewsService, parseEspnF1News, parseF1NewsRss } from '../src/lib/f1NewsFeed.js';
// News API refresh also invokes notification tagging. Keep this suite local
// and independent of application database credentials or live followers.
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    driver: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
const { createNewsRouter } = await import('../src/routes/news.js');

const TEST_FEED_URL = 'https://example.test/f1/news';

function rss(items) {
  return `<?xml version="1.0"?><rss><channel>${items.map((item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.url}</link>
      <guid>${item.guid || item.url}</guid>
      <description><![CDATA[<p>${item.summary || ''}</p>]]></description>
      <pubDate>${item.publishedAt}</pubDate>
      ${item.imageUrl ? `<media:thumbnail url="${item.imageUrl}" />` : ''}
      <category>Formula 1</category>
    </item>`).join('')}</channel></rss>`;
}

function upstreamResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    text: async () => body,
  };
}

function espnFeed(items) {
  return JSON.stringify({
    articles: items.map((item, index) => ({
      id: item.id || String(index + 1),
      headline: item.title,
      description: item.summary,
      published: item.publishedAt,
      images: item.imageUrl ? [{ url: item.imageUrl }] : [],
      categories: item.categories || [{ type: 'league', description: 'Formula One' }],
      links: { web: { href: item.url } },
    })),
  });
}

const firstStory = {
  id: 'first-story',
  title: 'First F1 story',
  url: 'https://example.test/f1/first',
  summary: 'The first story summary.',
  publishedAt: 'Thu, 24 Sep 2026 10:00:00 GMT',
  imageUrl: 'https://example.test/images/first.jpg',
};

const secondStory = {
  id: 'second-story',
  title: 'Second F1 story',
  url: 'https://example.test/f1/second',
  summary: 'The second story summary.',
  publishedAt: 'Thu, 24 Sep 2026 11:00:00 GMT',
};

const basketballStory = {
  id: 'basketball',
  title: 'Shai Gilgeous-Alexander joins athletes who became owners',
  url: 'https://www.espn.com/nfl/story/_/id/29553205/athletes-team-owners',
  summary: 'LeBron James, Serena Williams and Lewis Hamilton join a list of owners.',
  publishedAt: 'Thu, 24 Sep 2026 12:00:00 GMT',
  categories: [
    { type: 'league', description: 'WNBA' },
    { type: 'league', description: 'NFL' },
    { type: 'league', description: 'Formula One' },
  ],
};

test('filters ESPN multi-sport stories before the item limit without losing genuine F1 reports', () => {
  const f1Story = { ...firstStory, url: 'https://www.espn.com/f1/story/_/id/123/norris-wins' };
  const unclassified = { ...basketballStory, id: 'unknown', url: 'https://example.test/news/owners', categories: [] };
  expect(parseEspnF1News(JSON.parse(espnFeed([basketballStory, unclassified, f1Story])), { maxItems: 1 }))
    .toEqual([expect.objectContaining({ id: f1Story.id })]);
  const generic = { ...basketballStory, url: 'https://example.test/news/owners' };
  expect(parseEspnF1News(JSON.parse(espnFeed([generic])))).toEqual([]);
});

test('keeps F1 URL reports without category metadata and rejects unrelated RSS stories', () => {
  const f1Story = { ...firstStory, title: 'Norris takes victory', categories: [], url: 'https://www.espn.com/f1/story/_/id/123/victory' };
  expect(parseEspnF1News(JSON.parse(espnFeed([f1Story])))).toHaveLength(1);
  expect(parseF1NewsRss(rss([basketballStory, firstStory])))
    .toEqual([expect.objectContaining({ title: firstStory.title })]);
});

describe('F1 news feed service', () => {
  function memoryStore(saved = null) {
    return {
      read: jest.fn().mockResolvedValue(saved),
      write: jest.fn().mockResolvedValue({
        saved: true,
        persistedAt: '2026-09-24T12:00:00.000Z',
      }),
    };
  }

  test('excludes unrelated stories from persisted cache, fresh responses and stored snapshots', async () => {
    const savedF1 = { ...firstStory, category: 'Formula 1', source: 'BBC Sport' };
    // Even a previously defaulted Formula 1 label must not override an NFL URL.
    const newsStore = memoryStore({ items: [{ ...basketballStory, category: 'Formula 1' }, savedF1] });
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(upstreamResponse('', { status: 503 }))
      .mockResolvedValueOnce(upstreamResponse(espnFeed([basketballStory, secondStory])));
    const service = createF1NewsService({ fetchImpl, feedUrl: TEST_FEED_URL, newsStore });
    expect((await service.hydrate()).items).toEqual([savedF1]);
    expect((await service.refresh()).items).toEqual([savedF1]);
    const snapshot = await service.refresh();
    expect(snapshot.items.map((article) => article.id)).toEqual([secondStory.id]);
    expect(newsStore.write.mock.calls[0][0].items.map((article) => article.id)).toEqual([secondStory.id]);
  });

  test('combines simultaneous refreshes into one provider request', async () => {
    let resolveFetch;
    const fetchImpl = jest.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    const service = createF1NewsService({ fetchImpl, feedUrl: TEST_FEED_URL });

    const firstRefresh = service.refresh();
    const secondRefresh = service.refresh();
    await new Promise((resolve) => setImmediate(resolve));
    resolveFetch(upstreamResponse(espnFeed([firstStory])));
    const [first, second] = await Promise.all([firstRefresh, secondRefresh]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.items).toEqual(second.items);
  });

  test('keeps cached stories and marks them stale after a provider failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(upstreamResponse(espnFeed([firstStory])))
      .mockResolvedValueOnce(upstreamResponse('', { status: 503 }));
    const service = createF1NewsService({ fetchImpl, feedUrl: TEST_FEED_URL });

    await service.refresh();
    const staleSnapshot = await service.refresh();

    expect(staleSnapshot.items).toHaveLength(1);
    expect(staleSnapshot.items[0].title).toBe(firstStory.title);
    expect(staleSnapshot.stale).toBe(true);
    expect(staleSnapshot.error).toBe('Formula 1 News returned 503');
  });

  test('uses conditional request headers and records successful 304 checks', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(upstreamResponse(espnFeed([firstStory]), {
        headers: { etag: 'feed-v1', 'last-modified': 'Thu, 24 Sep 2026 10:00:00 GMT' },
      }))
      .mockResolvedValueOnce(upstreamResponse('', { status: 304 }));
    let time = 0;
    const service = createF1NewsService({
      fetchImpl,
      feedUrl: TEST_FEED_URL,
      now: () => new Date(++time * 1000),
    });

    const first = await service.refresh();
    const second = await service.refresh();
    const secondRequest = fetchImpl.mock.calls[1][1];

    expect(secondRequest.headers['If-None-Match']).toBe('feed-v1');
    expect(secondRequest.headers['If-Modified-Since']).toBe('Thu, 24 Sep 2026 10:00:00 GMT');
    expect(second.lastUpdated).not.toBe(first.lastUpdated);
    expect(second.stale).toBe(false);
  });

  test('combines ESPN and BBC stories while keeping each source label', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (url.includes('espn')) return upstreamResponse(espnFeed([secondStory]));
      return upstreamResponse(rss([firstStory]));
    });
    const service = createF1NewsService({
      fetchImpl,
      feedUrls: [
        { source: 'ESPN', url: 'https://example.test/espn', sourceUrl: 'https://www.espn.com/f1/' },
        { source: 'BBC Sport', url: 'https://example.test/bbc', sourceUrl: 'https://www.bbc.com/sport/formula1' },
      ],
    });

    const snapshot = await service.refresh();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(snapshot.items.map((article) => article.source)).toEqual(['ESPN', 'BBC Sport']);
    expect(snapshot.stale).toBe(false);
  });

  test('persists the newest shared stories after every successful refresh', async () => {
    const newsStore = memoryStore();
    const fetchImpl = jest.fn().mockResolvedValue(upstreamResponse(espnFeed([
      secondStory,
      firstStory,
    ])));
    const service = createF1NewsService({
      fetchImpl,
      feedUrl: TEST_FEED_URL,
      newsStore,
      persistedItemLimit: 1,
    });

    const snapshot = await service.refresh();

    expect(newsStore.read).toHaveBeenCalledTimes(1);
    expect(newsStore.write).toHaveBeenCalledTimes(1);
    expect(newsStore.write.mock.calls[0][0].items[0].title).toBe(secondStory.title);
    expect(newsStore.write.mock.calls[0][1]).toEqual({ limit: 1 });
    expect(snapshot.persistedAt).toBe('2026-09-24T12:00:00.000Z');
  });

  test('uses persisted Firestore stories when all providers are unavailable', async () => {
    const newsStore = memoryStore({
      items: [{ ...firstStory, source: 'BBC Sport', category: 'Formula 1' }],
      lastUpdated: '2026-09-24T10:00:00.000Z',
      persistedAt: '2026-09-24T10:00:01.000Z',
    });
    const service = createF1NewsService({
      fetchImpl: jest.fn().mockResolvedValue(upstreamResponse('', { status: 503 })),
      feedUrl: TEST_FEED_URL,
      newsStore,
    });

    const snapshot = await service.refresh();

    expect(snapshot.items[0].title).toBe(firstStory.title);
    expect(snapshot.stale).toBe(true);
    expect(newsStore.write).not.toHaveBeenCalled();
  });
});

describe('F1 news API', () => {
  function apiFor(service) {
    const app = express();
    app.use('/api/news', createNewsRouter(service));
    return app;
  }

  test('returns a paginated persisted snapshot without refreshing providers', async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `story-${index}`,
      title: `Story ${index}`,
    }));
    const service = {
      hydrate: jest.fn().mockResolvedValue(undefined),
      snapshot: jest.fn(() => ({ items, lastUpdated: '2026-09-24T10:00:00.000Z' })),
      refresh: jest.fn(),
    };

    const response = await request(apiFor(service)).get('/api/news?limit=5&offset=5');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(5);
    expect(response.body.items[0].id).toBe('story-5');
    expect(response.body.pagination).toEqual({
      limit: 5,
      offset: 5,
      total: 12,
      hasMore: true,
      nextOffset: 10,
    });
    expect(service.refresh).not.toHaveBeenCalled();
  });

  test('manual refresh checks providers and returns the requested page', async () => {
    const service = {
      refresh: jest.fn().mockResolvedValue({
        items: [firstStory, secondStory],
        lastUpdated: '2026-09-24T11:00:00.000Z',
      }),
      snapshot: jest.fn(() => ({ items: [] })),
    };

    const response = await request(apiFor(service)).post('/api/news/refresh?limit=1');

    expect(response.status).toBe(200);
    expect(service.refresh).toHaveBeenCalledTimes(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.pagination.total).toBe(2);
  });
});
