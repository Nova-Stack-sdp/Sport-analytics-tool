import { Router } from 'express';
import { f1NewsService } from '../lib/f1NewsFeed.js';

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function createNewsRouter(service = f1NewsService) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      res.json(await service.refresh());
    } catch {
      res.status(503).json({
        ...service.snapshot(),
        error: 'The F1 news provider is temporarily unavailable.',
      });
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
