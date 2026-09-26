import { jest } from '@jest/globals';
import { createF1NewsService, parseF1NewsRss } from '../src/lib/f1NewsFeed.js';

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

const firstStory = {
  title: 'First F1 story',
  url: 'https://example.test/f1/first',
  summary: 'The first story summary.',
  publishedAt: 'Thu, 24 Sep 2026 10:00:00 GMT',
  imageUrl: 'https://example.test/images/first.jpg',
};

const secondStory = {
  title: 'Second F1 story',
  url: 'https://example.test/f1/second',
  summary: 'The second story summary.',
  publishedAt: 'Thu, 24 Sep 2026 11:00:00 GMT',
};

describe('F1 news feed service', () => {
  test('parses, normalizes and sorts RSS stories', () => {
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

  test('combines simultaneous refreshes into one provider request', async () => {
    let resolveFetch;
    const fetchImpl = jest.fn(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));
    const service = createF1NewsService({ fetchImpl });

    const firstRefresh = service.refresh();
    const secondRefresh = service.refresh();
    resolveFetch(upstreamResponse(rss([firstStory])));
    const [first, second] = await Promise.all([firstRefresh, secondRefresh]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.items).toEqual(second.items);
  });

  test('notifies listeners when a new story appears', async () => {
    let currentFeed = rss([firstStory]);
    const fetchImpl = jest.fn(async () => upstreamResponse(currentFeed));
    const service = createF1NewsService({ fetchImpl, pollIntervalMs: 60_000 });
    await service.refresh();

    const listener = jest.fn();
    const unsubscribe = service.subscribe(listener);
    await service.refresh();
    listener.mockClear();

    currentFeed = rss([secondStory, firstStory]);
    await service.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].newItems).toHaveLength(1);
    expect(listener.mock.calls[0][0].newItems[0].title).toBe(secondStory.title);
    unsubscribe();
  });

  test('keeps cached stories and marks them stale after a provider failure', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(upstreamResponse(rss([firstStory])))
      .mockResolvedValueOnce(upstreamResponse('', { status: 503 }));
    const service = createF1NewsService({ fetchImpl });

    await service.refresh();
    const staleSnapshot = await service.refresh();

    expect(staleSnapshot.items).toHaveLength(1);
    expect(staleSnapshot.items[0].title).toBe(firstStory.title);
    expect(staleSnapshot.stale).toBe(true);
    expect(staleSnapshot.error).toBe('News provider returned 503');
  });

  test('uses conditional request headers and records successful 304 checks', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(upstreamResponse(rss([firstStory]), {
        headers: { etag: 'feed-v1', 'last-modified': 'Thu, 24 Sep 2026 10:00:00 GMT' },
      }))
      .mockResolvedValueOnce(upstreamResponse('', { status: 304 }));
    let time = 0;
    const service = createF1NewsService({
      fetchImpl,
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
});
