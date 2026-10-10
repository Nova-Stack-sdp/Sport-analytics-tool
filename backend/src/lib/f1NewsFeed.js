import { createHash } from 'node:crypto';
import { firestoreNewsStore } from './f1NewsPersistence.js';

export const DEFAULT_F1_NEWS_FEED_URL = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/news?limit=50';
export const DEFAULT_BBC_F1_NEWS_FEED_URL = 'https://feeds.bbci.co.uk/sport/formula1/rss.xml';
export const DEFAULT_F1_NEWS_FEEDS = [
  { source: 'ESPN', url: DEFAULT_F1_NEWS_FEED_URL, sourceUrl: 'https://www.espn.com/f1/' },
  { source: 'BBC Sport', url: DEFAULT_BBC_F1_NEWS_FEED_URL, sourceUrl: 'https://www.bbc.com/sport/formula1' },
];
const DEFAULT_POLL_INTERVAL_MS = 10 * 60_000;
const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_PERSISTED_ITEMS = 30;

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

// Provider feeds can include syndicated, multi-sport stories tagged with F1
// only incidentally. An unrelated primary sport must not become F1 news just
// because a driver is mentioned or a secondary league tag says Formula One.
const F1_TOPIC = /\b(?:f1|formula[\s-]*(?:1|one))\b/i;
const OTHER_SPORT_PATH = /(?:^|\/)(?:nba|wnba|nfl|nhl|mlb|soccer|basketball|football|tennis|golf|cricket|rugby|nascar|indycar|motogp)(?:\/|$)/i;
const OTHER_SPORT_CATEGORY = /^(?:nba|wnba|nfl|nhl|mlb|soccer|basketball|football|tennis|golf|cricket|rugby|nascar|indycar|motogp)$/i;

function isF1NewsArticle(article) {
  const url = safeHttpUrl(article?.url);
  if (!url) return false;
  const path = new URL(url).pathname;
  if (OTHER_SPORT_PATH.test(path)) return false;
  if (/(?:^|\/)(?:f1|formula-?1)(?:\/|$)/i.test(path)) return true;
  const category = stripMarkup(String(article.category || ''));
  if (OTHER_SPORT_CATEGORY.test(category)) return false;
  return F1_TOPIC.test(category)
    || F1_TOPIC.test(`${article.title || ''} ${article.summary || ''}`);
}

export function parseF1NewsRss(xml, { maxItems = DEFAULT_MAX_ITEMS, source = 'BBC Sport' } = {}) {
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
        category: stripMarkup(tagValue(item, 'category')),
        source,
      };
    })
    .filter(Boolean)
    .filter(isF1NewsArticle)
    .map((article) => ({ ...article, category: article.category || 'Formula 1' }))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, maxItems);
}

export function parseEspnF1News(payload, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  if (!payload || !Array.isArray(payload.articles)) return [];

  return payload.articles
    .map((article) => {
      const title = stripMarkup(article?.headline || '');
      const url = safeHttpUrl(article?.links?.web?.href);
      if (!title || !url) return null;

      const publishedDate = new Date(article.published || article.lastModified || '');
      const publishedAt = Number.isNaN(publishedDate.getTime())
        ? null
        : publishedDate.toISOString();
      const category = article.categories?.find((item) => item?.type === 'league')?.description
        || article.categories?.[0]?.description
        || '';
      const imageUrl = article.images
        ?.map((image) => safeHttpUrl(image?.url))
        .find(Boolean) || null;

      return {
        id: String(article.id || stableId(url)),
        title,
        summary: stripMarkup(article.description || '').slice(0, 320),
        url,
        imageUrl,
        publishedAt,
        category: stripMarkup(category),
        source: 'ESPN',
      };
    })
    .filter(Boolean)
    .filter(isF1NewsArticle)
    .map((article) => ({ ...article, category: article.category || 'Formula 1' }))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, maxItems);
}

function parseProviderResponse(body, options) {
  try {
    const payload = JSON.parse(body);
    if (Array.isArray(payload?.articles)) return parseEspnF1News(payload, options);
  } catch {
    // Keep RSS support for a custom F1_NEWS_FEED_URL override.
  }
  return parseF1NewsRss(body, options);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createF1NewsService({
  fetchImpl = globalThis.fetch,
  feedUrl = process.env.F1_NEWS_FEED_URL,
  feedUrls,
  pollIntervalMs = positiveNumber(process.env.F1_NEWS_POLL_MS, DEFAULT_POLL_INTERVAL_MS),
  maxItems = DEFAULT_MAX_ITEMS,
  persistedItemLimit = positiveNumber(
    process.env.F1_NEWS_PERSISTED_ITEMS,
    DEFAULT_PERSISTED_ITEMS
  ),
  newsStore = null,
  now = () => new Date(),
} = {}) {
  const providers = (feedUrls || (feedUrl
    ? [{ source: 'Formula 1 News', url: feedUrl, sourceUrl: feedUrl }]
    : DEFAULT_F1_NEWS_FEEDS))
    .map((provider) => (typeof provider === 'string'
      ? { source: 'Formula 1 News', url: provider, sourceUrl: provider }
      : provider));
  const providerState = new Map(providers.map((provider) => [provider.url, {
    articles: [],
    etag: null,
    lastModified: null,
  }]));
  let articles = [];
  let lastUpdated = null;
  let persistedAt = null;
  let lastError = null;
  let hydrated = false;
  let hydratePromise = null;
  let refreshPromise = null;
  let timer = null;
  const listeners = new Set();

  const snapshot = () => ({
    source: providers.map((provider) => provider.source).join(' + '),
    sourceUrls: providers.map((provider) => provider.sourceUrl),
    feedUrl: providers[0]?.url || null,
    feedUrls: providers.map((provider) => provider.url),
    items: articles,
    lastUpdated,
    persistedAt,
    stale: Boolean(lastError),
    error: lastError,
  });

  const publish = (newItems = []) => {
    const payload = { ...snapshot(), newItems };
    for (const listener of listeners) listener(payload);
  };

  const hydrate = async () => {
    if (hydrated) return snapshot();
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const saved = await newsStore?.read?.();
      if (saved?.items?.length) {
        articles = saved.items.filter(isF1NewsArticle).slice(0, maxItems);
        lastUpdated = saved.lastUpdated || lastUpdated;
        persistedAt = saved.persistedAt || persistedAt;
      }
      hydrated = true;
      hydratePromise = null;
      return snapshot();
    })();

    return hydratePromise;
  };

  const aggregateArticles = () => {
    const seen = new Set();
    return providers
      .flatMap((provider) => providerState.get(provider.url)?.articles || [])
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .filter((article) => {
        const key = `${article.source}:${article.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, maxItems);
  };

  const refreshProvider = async (provider) => {
    const state = providerState.get(provider.url);
    const headers = {
      Accept: 'application/json, application/rss+xml;q=0.9, application/xml;q=0.8',
    };
    if (state.etag) headers['If-None-Match'] = state.etag;
    if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;

    const response = await fetchImpl(provider.url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 304) return;
    if (!response.ok) throw new Error(`${provider.source} returned ${response.status}`);

    const nextArticles = parseProviderResponse(await response.text(), {
      maxItems,
      source: provider.source,
    });
    if (nextArticles.length === 0) {
      throw new Error(`${provider.source} returned no readable stories`);
    }

    state.articles = nextArticles;
    state.etag = response.headers?.get?.('etag') || state.etag;
    state.lastModified = response.headers?.get?.('last-modified') || state.lastModified;
  };

  const refresh = async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        await hydrate();
        const results = await Promise.all(providers.map(async (provider) => {
          try {
            await refreshProvider(provider);
            return null;
          } catch (error) {
            return error instanceof Error ? error.message : `${provider.source} is unavailable`;
          }
        }));
        const errors = results.filter(Boolean);
        const previousIds = new Set(articles.map((article) => article.id));
        const nextArticles = aggregateArticles();
        if (nextArticles.length === 0) {
          throw new Error(errors.join('; ') || 'News providers returned no readable stories');
        }
        const newItems = previousIds.size === 0
          ? []
          : nextArticles.filter((article) => !previousIds.has(article.id));
        const changed = nextArticles.map((article) => article.id).join(',')
          !== articles.map((article) => article.id).join(',');

        articles = nextArticles;
        lastUpdated = now().toISOString();
        lastError = errors.length > 0 ? errors.join('; ') : null;

        const saveResult = await newsStore?.write?.(snapshot(), {
          limit: persistedItemLimit,
        });
        if (saveResult?.saved) persistedAt = saveResult.persistedAt;

        if (changed || errors.length > 0) publish(newItems);
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

    // Keep the shared feed fresh even when nobody has the application open.
    // Northflank starts this once with the backend process; subscribers only
    // receive updates and no longer control the lifetime of the refresh job.
    refresh().catch((error) => {
      console.error('Initial F1 news refresh failed:', error.message);
    });
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
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    refresh,
    hydrate,
    snapshot,
    subscribe,
    start: startPolling,
    stop: stopPolling,
  };
}

export const f1NewsService = createF1NewsService({ newsStore: firestoreNewsStore });
