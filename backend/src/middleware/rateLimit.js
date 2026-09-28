/**
 * rateLimit — stops one client from exhausting the API for everyone else.
 *
 * Fixed one-minute windows per client: each client gets `limit` requests per
 * window; the next one gets 429 Too Many Requests with a Retry-After header
 * saying how many seconds until the window resets. Every response carries
 * RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset headers so a well
 * behaved consumer can slow down before it hits the wall.
 *
 * Clients are identified by IP address for now. Once API keys exist the
 * `keyFor` option can switch to the key, giving each consumer its own quota.
 *
 * In-memory: fine for the single backend instance we run. With several
 * instances each would count separately; that's when this moves to a shared
 * store (e.g. Redis).
 */

export function createRateLimiter({
  limit,
  windowMs = 60_000,
  keyFor = (req) => req.ip ?? 'unknown',
  now = Date.now,
  name = 'api',
} = {}) {
  const windows = new Map(); // key -> { start, count }
  let lastSweep = now();

  return function rateLimit(req, res, next) {
    const t = now();

    // Forget finished windows now and then so memory stays bounded.
    if (t - lastSweep > windowMs) {
      for (const [key, w] of windows) if (t - w.start >= windowMs) windows.delete(key);
      lastSweep = t;
    }

    const key = keyFor(req);
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;

    const resetSeconds = Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - w.count)));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (w.count > limit) {
      res.set('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: 'Too many requests',
        detail: `The ${name} allows ${limit} requests per ${Math.round(windowMs / 1000)} seconds per client. Try again in ${resetSeconds}s.`,
      });
    }
    return next();
  };
}
