import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Race requests — adding a race RaceSync's search doesn't have yet.
 *
 * Races reach the app through the OpenF1 sync job (src/jobs/openf1-sync.js),
 * which used to be run by hand per session_key. This router lets a signed-in
 * user do the same from the page:
 *
 *   GET  /api/race-requests/available?year=2024
 *        Every Race session OpenF1 lists for that season, each marked with
 *        where it stands here: ready (replayable), synced (stored but missing
 *        an event type the replay needs), syncing / queued (a request is
 *        running), failed (the last request failed), upcoming (not run yet),
 *        or missing (can be added). Public, like the fixtures list.
 *   POST /api/race-requests  { sessionKey }
 *        Queue a sync for one finished OpenF1 Race session. Signed-in users
 *        only. Already-ready races answer at once with their sessionId.
 *   GET  /api/race-requests/:sessionKey
 *        Where that request stands: queued, syncing, ready (with sessionId),
 *        failed (with the reason).
 *
 * Syncs run ONE AT A TIME through the existing job, as a child process —
 * the same way scripts/sync-missing-sessions.js drives it — so the job keeps
 * its own database connection and OpenF1's rate limits (30 requests a minute)
 * are never hit by two syncs at once. When a sync lands, the response cache
 * is cleared so the fixtures list (and so the search) shows the race at once
 * instead of after the cache's TTL.
 *
 * Mounted OUTSIDE the response cache: job status changes from second to
 * second and must never be served stale.
 *
 * Limits, on purpose: request state lives in memory, so a server restart
 * forgets queued requests (the race itself, once synced, is in the database
 * for good); and only Race sessions are accepted, because that is all
 * RaceSync replays.
 */

const OPENF1_BASE = 'https://api.openf1.org/v1';
// OpenF1's lap-level coverage starts with the 2023 season.
const FIRST_SEASON = 2023;
const REPLAY_REQUIRED_EVENT_TYPES = ['lap_completed', 'position_change', 'classification'];

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function fetchRaceSessions(year) {
  const url = new URL(`${OPENF1_BASE}/sessions`);
  url.searchParams.set('year', String(year));
  url.searchParams.set('session_name', 'Race');
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OpenF1 answered ${response.status}`);
  const sessions = await response.json();
  return Array.isArray(sessions) ? sessions : [];
}

async function fetchRaceSession(sessionKey) {
  const url = new URL(`${OPENF1_BASE}/sessions`);
  url.searchParams.set('session_key', String(sessionKey));
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OpenF1 answered ${response.status}`);
  const sessions = await response.json();
  return Array.isArray(sessions) ? sessions[0] ?? null : null;
}

function runSyncJob(sessionKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/jobs/openf1-sync.js', String(sessionKey)], {
      cwd: backendRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').at(-1) || `sync exited with code ${code}`));
    });
  });
}

// Which of these OpenF1 session keys are stored, and which are replayable.
async function storedSessions(sessionKeys) {
  if (sessionKeys.length === 0) return new Map();
  const sessions = await prisma.session.findMany({
    where: { openf1Key: { in: sessionKeys } },
    select: { id: true, openf1Key: true },
  });
  if (sessions.length === 0) return new Map();
  const groups = await prisma.event.groupBy({
    by: ['sessionId', 'eventType'],
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
      eventType: { in: REPLAY_REQUIRED_EVENT_TYPES },
    },
  });
  const types = new Map();
  for (const g of groups) {
    if (!types.has(g.sessionId)) types.set(g.sessionId, new Set());
    types.get(g.sessionId).add(g.eventType);
  }
  return new Map(
    sessions.map((s) => [
      s.openf1Key,
      {
        sessionId: s.id,
        replayReady: REPLAY_REQUIRED_EVENT_TYPES.every((t) => types.get(s.id)?.has(t)),
      },
    ])
  );
}

const parseKey = (value) => {
  const key = Number(value);
  return Number.isInteger(key) && key > 0 ? key : null;
};

export function createRaceRequestsRouter({
  fetchSessions = fetchRaceSessions,
  fetchSession = fetchRaceSession,
  runSync = runSyncJob,
  now = () => new Date(),
} = {}) {
  const router = Router();
  // sessionKey -> { status: queued|syncing|ready|failed, sessionId?, error?, requestedAt }
  const jobs = new Map();
  const queue = [];
  let running = false;

  async function drain(app) {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const sessionKey = queue.shift();
        const job = jobs.get(sessionKey);
        job.status = 'syncing';
        try {
          await runSync(sessionKey);
          const stored = (await storedSessions([sessionKey])).get(sessionKey);
          if (stored?.replayReady) {
            Object.assign(job, { status: 'ready', sessionId: stored.sessionId });
          } else {
            Object.assign(job, {
              status: 'failed',
              error: 'OpenF1 does not carry enough lap data for this race to be replayed.',
            });
          }
          app?.locals?.responseCache?.clear?.();
        } catch (err) {
          Object.assign(job, { status: 'failed', error: err.message || 'The sync failed.' });
        }
      }
    } finally {
      running = false;
    }
  }

  router.get('/available', async (req, res, next) => {
    const year = Number(req.query.year);
    const thisYear = now().getUTCFullYear();
    if (!Number.isInteger(year) || year < FIRST_SEASON || year > thisYear) {
      return res
        .status(400)
        .json({ error: `year must be a season from ${FIRST_SEASON} to ${thisYear}` });
    }
    let sessions;
    try {
      sessions = await fetchSessions(year);
    } catch {
      return res.status(502).json({ error: 'Unable to reach OpenF1' });
    }
    try {
      const keys = sessions.map((s) => s.session_key).filter(Number.isInteger);
      const stored = await storedSessions(keys);
      const races = sessions
        .filter((s) => Number.isInteger(s.session_key))
        .map((s) => {
          const here = stored.get(s.session_key);
          const job = jobs.get(s.session_key);
          const ended = s.date_end ? new Date(s.date_end) <= now() : false;
          let status;
          if (here?.replayReady) status = 'ready';
          else if (job && job.status !== 'ready') status = job.status;
          else if (!ended) status = 'upcoming';
          else if (here) status = 'synced';
          else status = 'missing';
          return {
            sessionKey: s.session_key,
            name: [s.country_name, 'Grand Prix'].filter(Boolean).join(' '),
            location: s.location ?? null,
            circuit: s.circuit_short_name ?? null,
            country: s.country_name ?? null,
            dateStart: s.date_start ?? null,
            status,
            sessionId: here?.sessionId ?? null,
            error: job?.status === 'failed' ? job.error : null,
          };
        })
        .sort((a, b) => String(a.dateStart).localeCompare(String(b.dateStart)));
      res.json({ year, races });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth, async (req, res, next) => {
    const sessionKey = parseKey(req.body?.sessionKey);
    if (sessionKey == null) {
      return res.status(400).json({ error: 'sessionKey must be a positive integer' });
    }
    try {
      const stored = (await storedSessions([sessionKey])).get(sessionKey);
      if (stored?.replayReady) {
        return res.json({ sessionKey, status: 'ready', sessionId: stored.sessionId });
      }
      const existing = jobs.get(sessionKey);
      if (existing && (existing.status === 'queued' || existing.status === 'syncing')) {
        return res.status(202).json({ sessionKey, status: existing.status });
      }

      let session;
      try {
        session = await fetchSession(sessionKey);
      } catch {
        return res.status(502).json({ error: 'Unable to reach OpenF1' });
      }
      if (!session) return res.status(404).json({ error: 'OpenF1 has no session with that key' });
      if (session.session_name !== 'Race') {
        return res.status(400).json({ error: 'Only Race sessions can be added to RaceSync' });
      }
      if (!session.date_end || new Date(session.date_end) > now()) {
        return res.status(400).json({ error: 'This race has not finished yet' });
      }

      jobs.set(sessionKey, { status: 'queued', requestedAt: now().toISOString() });
      queue.push(sessionKey);
      drain(req.app);
      return res.status(202).json({ sessionKey, status: jobs.get(sessionKey).status });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:sessionKey', async (req, res, next) => {
    const sessionKey = parseKey(req.params.sessionKey);
    if (sessionKey == null) {
      return res.status(400).json({ error: 'sessionKey must be a positive integer' });
    }
    try {
      const job = jobs.get(sessionKey);
      if (job) {
        return res.json({
          sessionKey,
          status: job.status,
          sessionId: job.sessionId ?? null,
          error: job.error ?? null,
          position: job.status === 'queued' ? queue.indexOf(sessionKey) + 1 : null,
        });
      }
      const stored = (await storedSessions([sessionKey])).get(sessionKey);
      if (stored?.replayReady) {
        return res.json({ sessionKey, status: 'ready', sessionId: stored.sessionId });
      }
      return res.status(404).json({ error: 'No request for that race' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const raceRequestsRouter = createRaceRequestsRouter();
