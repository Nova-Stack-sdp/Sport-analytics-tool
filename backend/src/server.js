import 'dotenv/config';
import { createApp } from './app.js';
import { f1NewsService } from './lib/f1NewsFeed.js';
import { prisma } from './lib/prisma.js';
import { createRejectedCodeCleanup } from './jobs/rejected-code-cleanup.js';

const app = createApp();
const rejectedCodeCleanup = createRejectedCodeCleanup({ prisma });

// Northflank injects PORT — the server must bind to it (and to 0.0.0.0, not
// just localhost) or the platform's health check never sees it come up,
// which is exactly what produced the "no healthy upstream" 503.
const port = process.env.PORT || 8080;

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);
  f1NewsService.start();
  rejectedCodeCleanup.start();
});
server.on('close', () => { void rejectedCodeCleanup.stop(); });
