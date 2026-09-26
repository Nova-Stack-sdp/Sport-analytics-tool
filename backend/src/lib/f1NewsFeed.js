import { createHash } from 'node:crypto';

export const DEFAULT_F1_NEWS_FEED_URL = 'https://feeds.bbci.co.uk/sport/formula1/rss.xml';
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_ITEMS = 24;

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .trim();
}

function tagValue(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function stripMarkup(value = '') {
  return decodeXml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(decodeXml(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function attributeValue(xml, pattern, attribute = 'url') {
  const tag = xml.match(pattern)?.[0];
  if (!tag) return null;
  const match = tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, 'i'));
  return match?.[1] || null;
}

function imageFromItem(itemXml, description) {
  const candidates = [
    attributeValue(itemXml, /<media:thumbnail\b[^>]*>/i),
    attributeValue(itemXml, /<media:content\b[^>]*>/i),
    attributeValue(itemXml, /<enclosure\b[^>]*type=["']image\/[^"']+["'][^>]*>/i),
    attributeValue(description, /<img\b[^>]*>/i, 'src'),
  ];
  return candidates.map(safeHttpUrl).find(Boolean) || null;
}

function stableId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

export function parseF1NewsRss(xml, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  if (typeof xml !== 'string' || !xml.includes('<')) return [];

  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .map((match) => {
      const item = match[1];
      const title = stripMarkup(tagValue(item, 'title'));
      const link = safeHttpUrl(tagValue(item, 'link'));
      if (!title || !link) return null;

      const rawDescription = tagValue(item, 'description');
      const publishedValue = tagValue(item, 'pubDate') || tagValue(item, 'dc:date');
      const publishedDate = new Date(publishedValue);
      const publishedAt = Number.isNaN(publishedDate.getTime())
        ? null
        : publishedDate.toISOString();
      const guid = tagValue(item, 'guid') || link;

      return {
        id: stableId(guid),
        title,
        summary: stripMarkup(rawDescription).slice(0, 320),
        url: link,
        imageUrl: imageFromItem(item, rawDescription),
        publishedAt,
        category: stripMarkup(tagValue(item, 'category')) || 'Formula 1',
        source: 'BBC Sport',
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, maxItems);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createF1NewsService({
  fetchImpl = globalThis.fetch,
  feedUrl = process.env.F1_NEWS_FEED_URL || DEFAULT_F1_NEWS_FEED_URL,
  pollIntervalMs = positiveNumber(process.env.F1_NEWS_POLL_MS, DEFAULT_POLL_INTERVAL_MS),
  maxItems = DEFAULT_MAX_ITEMS,
  now = () => new Date(),
} = {}) {
  let articles = [];
  let lastUpdated = null;
  let lastError = null;
  let etag = null;
  let lastModified = null;
  let refreshPromise = null;
  let timer = null;
  const listeners = new Set();

  const snapshot = () => ({
    source: 'BBC Sport',
    sourceUrl: 'https://www.bbc.com/sport/formula1',
    feedUrl,
    items: articles,
    lastUpdated,
    stale: Boolean(lastError),
    error: lastError,
  });

  const publish = (newItems = []) => {
    const payload = { ...snapshot(), newItems };
    for (const listener of listeners) listener(payload);
  };

  const refresh = async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const headers = {
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9',
          'User-Agent': 'NovaStack-F1Lytics/1.0 (+https://sdp.ms.wits.ac.za/nova-stack/sport-analytics-tool)',
        };
        if (etag) headers['If-None-Match'] = etag;
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetchImpl(feedUrl, { headers, signal: AbortSignal.timeout(10_000) });
        if (response.status === 304) {
          lastUpdated = now().toISOString();
          lastError = null;
          return snapshot();
        }
        if (!response.ok) throw new Error(`News provider returned ${response.status}`);

        const nextArticles = parseF1NewsRss(await response.text(), { maxItems });
        if (nextArticles.length === 0) throw new Error('News provider returned no readable stories');

        const previousIds = new Set(articles.map((article) => article.id));
        const newItems = previousIds.size === 0
          ? []
          : nextArticles.filter((article) => !previousIds.has(article.id));
        const changed = nextArticles.map((article) => article.id).join(',')
          !== articles.map((article) => article.id).join(',');

        articles = nextArticles;
        lastUpdated = now().toISOString();
        lastError = null;
        etag = response.headers?.get?.('etag') || etag;
        lastModified = response.headers?.get?.('last-modified') || lastModified;

        if (changed) publish(newItems);
        return snapshot();
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'News feed unavailable';
        if (articles.length === 0) throw error;
        publish([]);
        return snapshot();
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  const startPolling = () => {
    if (timer) return;
    timer = setInterval(() => {
      refresh().catch((error) => {
        console.error('F1 news refresh failed:', error.message);
      });
    }, pollIntervalMs);
    timer.unref?.();
  };

  const stopPolling = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    startPolling();
    refresh().catch((error) => {
      console.error('Initial F1 news refresh failed:', error.message);
    });
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stopPolling();
    };
  };

  return {
    refresh,
    snapshot,
    subscribe,
    stop: stopPolling,
  };
}

export const f1NewsService = createF1NewsService();
