import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { runDerivationForSession } from '../derivation/index.js';
import { createOpenF1Client } from '../ingestion/openf1/client.js';
import { syncOpenF1Session } from '../ingestion/openf1/syncSession.js';
import { warmReplayContext } from './raceReplay.js';

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
 *        failed (with the reason) — and, while it runs, each stage of the
 *        sync with its time, so the page can show the race arriving.
 *
 * Syncs run IN-PROCESS through the ingestion module (ingestion/openf1/),
 * one at a time and through one shared, rate-limited OpenF1 client, so two
 * syncs can never trip OpenF1's limit between them. A race is READY the
 * moment its events are written and its replay is warmed — a replay needs
 * nothing more — while the derived statistics finish in the background.
 * When a sync lands, the response cache is cleared so the fixtures list (and
 * so the search) shows the race at once instead of after the cache's TTL.
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

// One client for every sync this server runs, so its rate limiter covers them
// all.
const openF1 = createOpenF1Client();

// The default sync: the ingestion module, in-process, reporting each stage.
// The race is ready once its events are written and its replay warmed; the
// derived statistics carry on in the background (a failure there is logged,
// it never un-readies a race that can already be replayed).
async function runSyncInProcess(sessionKey, { onProgress } = {}) {
  const result = await syncOpenF1Session(sessionKey, {
    prisma,
    client: openF1,
    runDerivation: runDerivationForSession,
    deferDerivation: true,
    prepareReplay: warmReplayContext,
    onProgress,
  });
  result.derivation?.catch((err) => {
    console.error(`Derivation failed for session_key=${sessionKey}:`, err);
  });
  return result;
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
  runSync = runSyncInProcess,
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
        job.startedAt = Date.now();
        job.stages = [];
        // Each stage as it starts and finishes, for the page to show live.
        const onProgress = ({ stage, state, ms, detail }) => {
          const entry = job.stages.find((s) => s.stage === stage);
          if (entry) Object.assign(entry, { state, ms: ms ?? entry.ms, detail: detail ?? entry.detail });
          else job.stages.push({ stage, state, ms: ms ?? null, detail: detail ?? null });
        };
        try {
          await runSync(sessionKey, { onProgress });
          job.readyMs = Date.now() - job.startedAt;
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
          stages: job.stages ?? [],
          elapsedMs: job.startedAt ? (job.readyMs ?? Date.now() - job.startedAt) : null,
          readyMs: job.readyMs ?? null,
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
