import express from 'express';
import helmet from 'helmet';
import { serverTiming } from './middleware/serverTiming.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { signupRouter } from './routes/signup.js';
import { emailVerificationRouter } from './routes/emailVerification.js';
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
import { newsRouter } from './routes/news.js';
import { submissionsRouter } from './routes/submissions.js';
import { codeSubmissionsRouter } from './routes/codeSubmissions.js';
import { telemetryTVRouter } from './routes/telemetryTV.js';
import { apiV1Router } from './api/v1/router.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createOriginGuard } from './middleware/originGuard.js';
import { createResponseCache } from './middleware/responseCache.js';
import { followsRouter } from './routes/follows.js';
import { notificationsRouter } from './routes/notifications.js';



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
    // Sign-up mails a code to an arbitrary address, so it gets its own, tight
    // per-IP limit on top of the per-email cooldown / daily caps the route
    // enforces — otherwise one client could mail-bomb many different inboxes.
    signupRateLimit: options.signupRateLimit ?? (isTest ? 0 : fromEnv('RATE_LIMIT_SIGNUP_PER_MINUTE', 10)),
    // Token exchanges (POST /api/auth/session) are cheap to replay and the
    // only way to spray stolen ID tokens, so they get their own tight limit.
    sessionRateLimit: options.sessionRateLimit ?? (isTest ? 0 : fromEnv('RATE_LIMIT_SESSION_PER_MINUTE', 20)),
    cacheTtlMs: options.cacheTtlMs ?? (isTest ? 0 : fromEnv('CACHE_TTL_SECONDS', 60) * 1000),
  };
}

export function createApp(options = {}) {
  const app = express();
  const config = readConfig(options);

  // Northflank sits in front of the app as a proxy: trust its

  // Northflank sits in front of the app as a proxy: trust its
  // X-Forwarded-For so req.ip is the real client (what rate limits key on),
  // not the proxy's own address.
  app.set('trust proxy', 1);

  // Standard hardening headers (nosniff, frameguard, HSTS, and so on). The
  // API answers JSON rather than documents, but the headers still apply to
  // whatever a browser might sniff or frame. crossOriginResourcePolicy is
  // switched off: the Netlify frontend loads images from here and reads
  // responses cross-origin, and helmet's default 'same-origin' would block
  // the no-cors half of that.
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // Server-side response time on every response (see middleware/serverTiming.js).
  app.use(serverTiming());

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
  // CSRF gate for state-changing requests: the __session cookie is
  // SameSite=None in production, so writes must come from a browser origin
  // already on the CORS allowlist (see middleware/originGuard.js). Mounted
  // right after cors so the two always share one origin list.
  app.use(createOriginGuard({ allowedOrigins, wildcard: wildcardOrigin }));
  // Dataset uploads: keep the exact bytes received (req.rawBody) as well as
  // the parsed JSON, so the original upload can be stored and downloaded.
  app.use('/api/submissions', express.json({
    limit: '20mb',
    verify: (req, res, buf) => { req.rawBody = buf; },
  }));
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
  if (config.signupRateLimit > 0) {
    app.use('/api/auth/signup', createRateLimiter({ limit: config.signupRateLimit, name: 'sign-up' }));
  }
  if (config.sessionRateLimit > 0) {
    app.use('/api/auth/session', createRateLimiter({ limit: config.sessionRateLimit, name: 'session' }));
  }

  // --- Response cache for repeated public reads --------------------------
  // Only data that's the same for every caller. Not auth, drivers/teams
  // (photo uploads), follows/notifications (per-user), or telemetry
  // (live-synced to a video clock).
  const cache = createResponseCache({ ttlMs: config.cacheTtlMs });
  const cacheUnlessExport = (req, res, next) =>
    (req.path.startsWith('/exports') ? next() : cache(req, res, next));
  app.use('/api/v1', cacheUnlessExport);
  app.use(['/api/statistics', '/api/overview', '/api/fixtures', '/api/race-replay'], cache);
  app.locals.responseCache = cache;

  // The sign-up endpoints mount first: they are public by design (no
  // account exists until the emailed code is confirmed), and the path is
  // more specific than /api/auth. Same for the verification-code endpoints
  // — also more specific than /api/auth, so it stays obvious which router
  // owns which path.
  app.use('/api/auth/signup', signupRouter);
  app.use('/api/auth/verify-email', emailVerificationRouter);
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
  app.use('/api/news', newsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/code-submissions', codeSubmissionsRouter);
  app.use('/api/telemetry-tv', telemetryTVRouter);
  app.use('/api/follows', followsRouter);
  app.use('/api/notifications', notificationsRouter);

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
