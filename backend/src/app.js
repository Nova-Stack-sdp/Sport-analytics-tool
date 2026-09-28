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
import { raceReplayRouter } from './routes/raceReplay.js';
import { imagesRouter } from './routes/images.js';
import { telemetryTVRouter } from './routes/telemetryTV.js';
import { apiV1Router } from './api/v1/router.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createResponseCache } from './middleware/responseCache.js';

// Rate limits (requests per minute, per client IP) and cache lifetime.
// Overridable through env vars; 0 switches one off. Tests turn both off by
// default so unrelated tests don't trip over them — the dedicated tests
// pass explicit values to createApp().
function readConfig(options) {
  const isTest = process.env.NODE_ENV === 'test';
  const fromEnv = (name, fallback) =>
    (process.env[name] !== undefined && process.env[name] !== '' ? Number(process.env[name]) : fallback);
  return {
    // Whole site API. Generous: Race Replay at 60x speed alone polls ~6x/s.
    siteRateLimit: options.siteRateLimit ?? (isTest ? 0 : fromEnv('RATE_LIMIT_PER_MINUTE', 1200)),
    // Public v1 API, for other platforms.
    v1RateLimit: options.v1RateLimit ?? (isTest ? 0 : fromEnv('RATE_LIMIT_V1_PER_MINUTE', 120)),
    // File exports stream whole seasons, so they get their own, tighter limit.
    exportRateLimit: options.exportRateLimit ?? (isTest ? 0 : fromEnv('RATE_LIMIT_EXPORTS_PER_MINUTE', 10)),
    cacheTtlMs: options.cacheTtlMs ?? (isTest ? 0 : fromEnv('CACHE_TTL_SECONDS', 60) * 1000),
  };
}

export function createApp(options = {}) {
  const app = express();
  const config = readConfig(options);

  // Northflank sits in front of the app as a proxy: trust its
  // X-Forwarded-For so req.ip is the real client (what rate limits key on),
  // not the proxy's own address.
  app.set('trust proxy', 1);

  // FRONTEND_ORIGIN should be set on Northflank to the exact Netlify URL,
  // e.g. "https://sport-analytics-tool.netlify.app". Comma-separate if you
  // need more than one (a preview URL + the production domain, say).
  // Defaults to localhost:3000 for local dev. When explicitly set to *, the
  // app intentionally mirrors the wildcard for tests and simpler multi-origin
  // setups that still need credentialed CORS responses.
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const wildcardOrigin = allowedOrigins.length === 1 && allowedOrigins[0] === '*';

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (wildcardOrigin) return callback(null, '*');
        if (allowedOrigins.includes(origin)) return callback(null, origin);
        return callback(null, false);
      },
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

  // --- Rate limiting --------------------------------------------------
  // v1 calls are counted by the v1 limiter only, not twice.
  if (config.siteRateLimit > 0) {
    const siteLimiter = createRateLimiter({ limit: config.siteRateLimit, name: 'API' });
    app.use('/api', (req, res, next) => (req.path.startsWith('/v1') ? next() : siteLimiter(req, res, next)));
  }
  if (config.v1RateLimit > 0) {
    app.use('/api/v1', createRateLimiter({ limit: config.v1RateLimit, name: 'public API' }));
  }
  if (config.exportRateLimit > 0) {
    app.use('/api/v1/exports', createRateLimiter({ limit: config.exportRateLimit, name: 'export API' }));
  }

  // --- Response cache for repeated public reads --------------------------
  // Only data that's the same for every caller. Not auth, drivers/teams
  // (photo uploads), or telemetry (live-synced to a video clock).
  const cache = createResponseCache({ ttlMs: config.cacheTtlMs });
  const cacheUnlessExport = (req, res, next) =>
    (req.path.startsWith('/exports') ? next() : cache(req, res, next));
  app.use('/api/v1', cacheUnlessExport);
  app.use(['/api/statistics', '/api/overview', '/api/fixtures', '/api/race-replay'], cache);
  app.locals.responseCache = cache;

  app.use('/api/auth', authRouter);
  app.use('/api/overview', overviewRouter);
  app.use('/api/statistics', statisticsRouter);
  app.use('/api/fixtures', fixturesRouter);
  app.use('/api/timetravel', timeTravelRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/openf1', openF1Router);
  app.use('/api/race-replay', raceReplayRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/telemetry-tv', telemetryTVRouter);

  // Public, versioned API for other platforms (see src/api/v1/router.js).
  // The routes above serve the website's own pages and may change with them.
  app.use('/api/v1', apiV1Router);

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