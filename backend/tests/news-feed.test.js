import { jest } from '@jest/globals';
import { createF1NewsService, parseEspnF1News, parseF1NewsRss } from '../src/lib/f1NewsFeed.js';

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
      categories: [{ type: 'league', description: 'Formula One' }],
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

describe('F1 news feed service', () => {
  test('keeps support for a custom RSS feed', () => {
    const articles = parseF1NewsRss(rss([firstStory, secondStory]));

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      title: secondStory.title,
      summary: secondStory.summary,
      url: secondStory.url,
      source: 'BBC Sport',
      category: 'Formula 1',
    });
    expect(articles[1].imageUrl).toBe(firstStory.imageUrl);
    expect(articles[0].id).toHaveLength(20);
  });

  test('parses, normalizes and sorts ESPN Formula 1 stories', () => {
    const articles = parseEspnF1News(JSON.parse(espnFeed([firstStory, secondStory])));

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      title: secondStory.title,
      summary: secondStory.summary,
      url: secondStory.url,
      source: 'ESPN',
      category: 'Formula One',
    });
    expect(articles[1].imageUrl).toBe(firstStory.imageUrl);
  });

  test('combines simultaneous refreshes into one provider request', async () => {
    let resolveFetch;
    const fetchImpl = jest.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    const service = createF1NewsService({ fetchImpl, feedUrl: TEST_FEED_URL });

    const firstRefresh = service.refresh();
    const secondRefresh = service.refresh();
    resolveFetch(upstreamResponse(espnFeed([firstStory])));
    const [first, second] = await Promise.all([firstRefresh, secondRefresh]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.items).toEqual(second.items);
  });

  test('notifies listeners when a new story appears', async () => {
    let currentFeed = espnFeed([firstStory]);
    const fetchImpl = jest.fn(async () => upstreamResponse(currentFeed));
    const service = createF1NewsService({ fetchImpl, feedUrl: TEST_FEED_URL, pollIntervalMs: 60_000 });
    await service.refresh();

    const listener = jest.fn();
    const unsubscribe = service.subscribe(listener);
    await service.refresh();
    listener.mockClear();

    currentFeed = espnFeed([secondStory, firstStory]);
    await service.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].newItems).toHaveLength(1);
    expect(listener.mock.calls[0][0].newItems[0].title).toBe(secondStory.title);
    unsubscribe();
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
});
