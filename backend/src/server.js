import 'dotenv/config';
import { createApp } from './app.js';
import { f1NewsService } from './lib/f1NewsFeed.js';
import { processRaceReminders } from './services/raceReminderService.js'; // Moved from app.js

const app = createApp();

// Northflank injects PORT — the server must bind to it (and to 0.0.0.0, not
// just localhost) or the platform's health check never sees it come up,
// which is exactly what produced the "no healthy upstream" 503.
const port = process.env.PORT || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend listening on port ${port}`);
  
  // Start the news feed
  f1NewsService.start();

  // Run race reminder worker every 15 minutes
  setInterval(async () => {
    try {
      await processRaceReminders();
    } catch (err) {
      console.error('Error running race reminders:', err);
    }
  }, 15 * 60 * 1000);
});
