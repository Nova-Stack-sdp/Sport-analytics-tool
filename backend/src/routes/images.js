import { Router } from 'express';

export const imagesRouter = Router();

// Only these upstreams may be proxied — anything else is rejected before a
// single byte is fetched so the endpoint can never be used as an open proxy.
const TRUSTED_IMAGE_HOSTS = new Set([
  'media.api-sports.io',
]);

// Small in-memory cache: headshots and logos are immutable per URL, so one
// upstream fetch per source is enough for the lifetime of the process.
const MAX_CACHE_ENTRIES = 200;
const imageCache = new Map();

function parseTrustedSource(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !TRUSTED_IMAGE_HOSTS.has(url.hostname)) {
    return null;
  }
  return url;
}

function sendImage(res, entry) {
  res.set('Content-Type', entry.contentType);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(entry.body);
}

imagesRouter.get('/', async (req, res) => {
  const source = parseTrustedSource(req.query.source);
  if (!source) {
    return res.status(400).json({ error: 'Unsupported image source' });
  }

  const cacheKey = source.toString();
  const cached = imageCache.get(cacheKey);
  if (cached) {
    return sendImage(res, cached);
  }

  let upstream;
  try {
    upstream = await fetch(cacheKey, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return res.status(502).json({ error: 'Could not retrieve image' });
  }
  if (!upstream.ok) {
    return res.status(502).json({ error: 'Could not retrieve image' });
  }

  let body;
  try {
    body = Buffer.from(await upstream.arrayBuffer());
  } catch {
    return res.status(502).json({ error: 'Could not retrieve image' });
  }

  const entry = {
    body,
    contentType: upstream.headers.get('content-type') || 'application/octet-stream',
  };
  if (imageCache.size >= MAX_CACHE_ENTRIES) {
    imageCache.delete(imageCache.keys().next().value);
  }
  imageCache.set(cacheKey, entry);

  return sendImage(res, entry);
});
