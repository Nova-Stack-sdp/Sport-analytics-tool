import 'dotenv/config';
import { createApp } from './app.js';
import { prewarmBarcelonaCache } from './routes/watchLive.js';

const app = createApp();

// Northflank injects PORT — the server must bind to it (and to 0.0.0.0, not
// just localhost) or the platform's health check never sees it come up,
// which is exactly what produced the "no healthy upstream" 503.
const port = process.env.PORT || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);

  // Fire-and-forget: warms the OpenF1 replay cache so the watch-live page
  // responds instantly when a user first hits play.
  prewarmBarcelonaCache();
});