import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { overviewRouter } from './routes/overview.js';
import { statisticsRouter } from './routes/statistics.js';
import { fixturesRouter } from './routes/fixtures.js';
import { timeTravelRouter } from './routes/timetravel.js';
import { videosRouter } from './routes/videos.js';
import { teamsRouter } from './routes/teams.js';
import { driversRouter } from './routes/drivers.js';
import { openF1Router } from './routes/openf1.js';
import { watchLiveRouter } from './routes/watchLive.js';
import { imagesRouter } from './routes/images.js';

export function createApp() {
  const app = express();

  // FRONTEND_ORIGIN should be set on Northflank to the exact Netlify URL,
  // e.g. "https://sport-analytics-tool.netlify.app". Comma-separate if you
  // need more than one (a preview URL + the production domain, say).
  // Defaults to localhost:3000 for local dev.  The wildcard fallback is
  // removed — credentials: true is incompatible with Access-Control-Allow-
  // Origin: *, so we must always resolve to a specific origin.
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
  // cookie-parser is required so requireAuth can read the httpOnly
  // __session cookie set by POST /api/auth/session.
  app.use(cookieParser());

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
  app.use('/api/videos', videosRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/openf1', openF1Router);
  app.use('/api/watch-live', watchLiveRouter);
  app.use('/api/images', imagesRouter);

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
