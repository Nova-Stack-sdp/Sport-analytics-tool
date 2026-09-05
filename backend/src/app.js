import express from 'express';
import cors from 'cors';
import { overviewRouter } from './routes/overview.js';
import { statisticsRouter } from './routes/statistics.js';
import { fixturesRouter } from './routes/fixtures.js';
import { timeTravelRouter } from './routes/timetravel.js';
import { videosRouter } from './routes/videos.js';
import { teamsRouter } from './routes/teams.js';
import { driversRouter } from './routes/drivers.js';
import { openF1Router } from './routes/openf1.js';

export function createApp() {
  const app = express();

  // FRONTEND_ORIGIN should be set on Northflank to the exact Netlify URL,
  // e.g. "https://sport-analytics-tool.netlify.app". Comma-separate if you
  // need more than one (a preview URL + the production domain, say).
  // Falls back to "*" so local/dev work out of the box, but that fallback
  // should never be relied on in production.
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    })
  );
  app.use(express.json());

  // Northflank's health check and a plain "is this alive" endpoint.
  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'sport-analytics-backend' });
  });
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/overview', overviewRouter);
  app.use('/api/statistics', statisticsRouter);
  app.use('/api/fixtures', fixturesRouter);
  app.use('/api/timetravel', timeTravelRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/openf1', openF1Router);

  // 404 for anything else under /api
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler — keeps DB/other errors from leaking stack
  // traces to the client while still logging them server-side.
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
