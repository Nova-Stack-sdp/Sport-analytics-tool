import express from 'express';
import cors from 'cors';
import { overviewRouter } from './routes/overview.js';
import { statisticsRouter } from './routes/statistics.js';
import { fixturesRouter } from './routes/fixtures.js';
import { timeTravelRouter } from './routes/timetravel.js';
import { authRouter } from './routes/auth.js';

export function createApp() {
  const app = express();

  // FRONTEND_ORIGIN should be set on Northflank to the exact Netlify URL,
  // e.g. "https://sport-analytics-tool.netlify.app". Comma-separate if you
  // need more than one (a preview URL + the production domain, say).
  // Cookies require an explicit origin when credentials are enabled. Set
  // FRONTEND_ORIGIN to the deployed frontend origin in production.
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
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

  app.use('/api/auth', authRouter);

  app.use('/api/overview', overviewRouter);
  app.use('/api/statistics', statisticsRouter);
  app.use('/api/fixtures', fixturesRouter);
  app.use('/api/timetravel', timeTravelRouter);

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