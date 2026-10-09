import 'dotenv/config';
import { createApp } from './app.js';
import { f1NewsService } from './lib/f1NewsFeed.js';
import { processRaceReminders } from './services/raceReminderService.js';
import { prisma } from './lib/prisma.js';
import { createRejectedCodeCleanup } from './jobs/rejected-code-cleanup.js';

// Refuse to start production without the code-hashing secret — a deploy-time
// crash is cheaper to notice than verification codes hashed with a
// publicly-known development default. src/lib/emailVerificationCodes.js
// throws on first use as well, so a missing pepper can never silently pass.
if (process.env.NODE_ENV === 'production' && !process.env.EMAIL_CODE_PEPPER) {
  console.error('EMAIL_CODE_PEPPER is not set — refusing to start in production.');
  process.exit(1);
}

const app = createApp();
const rejectedCodeCleanup = createRejectedCodeCleanup({ prisma });

// Northflank injects PORT — the server must bind to it (and to 0.0.0.0, not
// just localhost) or the platform's health check never sees it come up,
// which is exactly what produced the "no healthy upstream" 503.
const port = process.env.PORT || 8080;

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);
  
  // Start the news feed
  f1NewsService.start();
  rejectedCodeCleanup.start();

  // Run race reminder worker every 15 minutes
  setInterval(async () => {
    try {
      await processRaceReminders();
    } catch (err) {
      console.error('Error running race reminders:', err);
    }
  }, 15 * 60 * 1000);
});
server.on('close', () => { void rejectedCodeCleanup.stop(); });
