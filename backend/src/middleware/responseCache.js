/**
 * responseCache — serves repeated reads from memory instead of the database.
 *
 * The first GET for a URL runs normally; its JSON body is kept for `ttlMs`.
 * Identical GETs within that time are answered straight from memory
 * (header `X-Cache: HIT`) without touching Prisma/Postgres. Only successful
 * (200) JSON responses are stored, and the cache holds at most `maxEntries`
 * URLs, dropping the least recently used first.
 *
 * Only for public data that's the same for every caller — never mount it on
 * anything that depends on who's signed in.
 *
 * Freshness: new data arrives through the sync job, a separate process, so
 * this cache can't be told about it; entries simply expire after `ttlMs`.
 * A figure can therefore be up to ttl seconds behind a sync — the trade-off
 * for not recomputing the same answer for every visitor.
 *
 * Responses also get a Cache-Control header, and Express's built-in ETag
 * lets browsers and API clients revalidate with If-None-Match (304 Not
 * Modified, no body) instead of downloading the same data again.
 */

export function createResponseCache({
  ttlMs,
  maxEntries = 500,
  now = Date.now,
} = {}) {
  const entries = new Map(); // url -> { expires, status, body, contentType }
  const stats = { hits: 0, misses: 0 };
  const maxAgeSeconds = Math.max(0, Math.floor(ttlMs / 1000));

  function middleware(req, res, next) {
    if (req.method !== 'GET' || ttlMs <= 0) return next();

    res.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    const key = req.originalUrl;
    const hit = entries.get(key);

    if (hit && hit.expires > now()) {
      // Re-insert to mark as most recently used.
      entries.delete(key);
      entries.set(key, hit);
      stats.hits += 1;
      res.set('X-Cache', 'HIT');
      res.type(hit.contentType);
      return res.status(hit.status).send(hit.body);
    }
    if (hit) entries.delete(key);

    stats.misses += 1;
    res.set('X-Cache', 'MISS');

    // Capture what the route sends so the next identical request can reuse it.
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (res.statusCode === 200) {
        const body = JSON.stringify(payload);
        entries.set(key, {
          expires: now() + ttlMs,
          status: 200,
          body,
          contentType: 'application/json; charset=utf-8',
        });
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      }
      return originalJson(payload);
    };
    return next();
  }

  middleware.stats = () => ({ ...stats, entries: entries.size });
  middleware.clear = () => entries.clear();
  return middleware;
}
