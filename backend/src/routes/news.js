import { Router } from 'express';
import { f1NewsService } from '../lib/f1NewsFeed.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function page(payload, query = {}) {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, nonNegativeInteger(query.limit, DEFAULT_LIMIT))
  );
  const offset = nonNegativeInteger(query.offset, 0);
  const allItems = Array.isArray(payload.items) ? payload.items : [];
  const items = allItems.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    ...payload,
    items,
    pagination: {
      limit,
      offset,
      total: allItems.length,
      hasMore: nextOffset < allItems.length,
      nextOffset: nextOffset < allItems.length ? nextOffset : null,
    },
  };
}

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createNewsRouter(service = f1NewsService) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      await service.hydrate();
      let payload = service.snapshot();
      if (payload.items.length === 0) payload = await service.refresh();
      res.json(page(payload, req.query));
    } catch {
      res.status(503).json(page({
        ...service.snapshot(),
        error: 'The F1 news provider is temporarily unavailable.',
      }, req.query));
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      res.json(page(await service.refresh(), req.query));
    } catch {
      res.status(503).json(page({
        ...service.snapshot(),
        error: 'The F1 news provider is temporarily unavailable.',
      }, req.query));
    }
  });

  router.get('/stream', (req, res) => {
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    writeEvent(res, 'connected', service.snapshot());
    const unsubscribe = service.subscribe((payload) => writeEvent(res, 'news', payload));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    heartbeat.unref?.();

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  });

  return router;
}

export const newsRouter = createNewsRouter();
