/**
 * Race Replay — decoupled from Watch Live.
 *
 * Watch Live (watchLive.js, untouched by this file) reconstructs state from
 * a live-video-synced OpenF1 bundle hardcoded to one specific Barcelona
 * broadcast. Race Replay instead reconstructs a leaderboard purely from the
 * generic Session/Entry/Event data already in Neon (the same data
 * /api/fixtures exposes), so it works for ANY session that's been synced —
 * see backend/scripts/inspect-sessions.js for which ones currently qualify.
 *
 * The replay "clock" here is LAP NUMBER, not seconds into a broadcast.
 * That's a deliberate choice, not just a simplification: several event
 * types synced by openf1-sync.js only carry a lap range, not a real
 * timestamp (tyre_stint has no meaningful `occurredAt` — see that file's
 * header comment), so a lap-based clock is what the data actually supports
 * faithfully. It also means the end of the replay is known upfront (total
 * laps, from the session's own lap_completed events) instead of needing a
 * probe-the-backend trick the way Watch Live's videoSeconds-based jumpToEnd
 * did.
 */

import { Router } from 'express';
import { fetchSessionTrackTelemetryRaw } from './openf1.js';
import { deriveTrackShapeFromTelemetry, readStaticTrackShape } from '../lib/trackShape.js';

export const raceReplayRouter = Router();

/**
 * Loads and indexes everything one session needs to answer "what did the
 * leaderboard look like as of lap N", straight from the Event log. Kept
 * separate from the route handler so it's independently testable without
 * spinning up Express.
 *
 * `prisma` is imported lazily inside this function, not at module top
 * level — mirrors the same trick in watchLive.js's fetchAndCacheBarcelonaData
 * and for the same reason: indexReplayContext/computeStateAtLap (the pure
 * logic below) are imported directly by tests that never call this
 * function and never need a database connection, and lib/prisma.js throws
 * at import time if DATABASE_URL isn't set — which it isn't in the test
 * environment.
 */
export async function buildReplayContext(sessionId) {
  const { prisma } = await import('../lib/prisma.js');
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { meeting: { include: { circuit: true } } },
  });
  if (!session) return null;

  const entries = await prisma.entry.findMany({
    where: { sessionId },
    include: { driver: true, team: true },
  });

  const events = await prisma.event.findMany({
    where: { sessionId },
    orderBy: { occurredAt: 'asc' },
  });

  return indexReplayContext(session, entries, events);
}

/**
 * Pure indexing step, split out from buildReplayContext so tests can feed
 * it fabricated session/entries/events without touching Prisma at all.
 */
export function indexReplayContext(session, entries, events) {
  const lapCompleted = events.filter((e) => e.eventType === 'lap_completed');
  const positionChange = events.filter((e) => e.eventType === 'position_change');
  const tyreStint = events.filter((e) => e.eventType === 'tyre_stint');
  const flagEvents = events.filter(
    (e) => e.eventType === 'flag_event' || e.eventType === 'race_control_message'
  );
  const weather = events.filter((e) => e.eventType === 'weather_snapshot');
  const gridPosition = events.filter((e) => e.eventType === 'grid_position');
  const classification = events.filter((e) => e.eventType === 'classification');

  const totalLaps = Math.max(0, ...lapCompleted.map((e) => e.lapNumber ?? 0));

  const lapsByEntry = new Map();
  for (const e of lapCompleted) {
    if (!lapsByEntry.has(e.entryId)) lapsByEntry.set(e.entryId, []);
    lapsByEntry.get(e.entryId).push(e);
  }
  for (const list of lapsByEntry.values()) list.sort((a, b) => a.lapNumber - b.lapNumber);

  const positionsByEntry = new Map();
  for (const e of positionChange) {
    if (!positionsByEntry.has(e.entryId)) positionsByEntry.set(e.entryId, []);
    positionsByEntry.get(e.entryId).push(e);
  }
  for (const list of positionsByEntry.values()) {
    list.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }

  const stintsByEntry = new Map();
  for (const e of tyreStint) {
    if (!stintsByEntry.has(e.entryId)) stintsByEntry.set(e.entryId, []);
    stintsByEntry.get(e.entryId).push(e);
  }
  for (const list of stintsByEntry.values()) {
    list.sort((a, b) => (a.payload.start_lap ?? 0) - (b.payload.start_lap ?? 0));
  }

  const gridByEntry = new Map(gridPosition.map((e) => [e.entryId, e.payload.position]));
  const classificationByEntry = new Map(classification.map((e) => [e.entryId, e.payload]));

  return {
    session,
    entries,
    totalLaps,
    lapsByEntry,
    positionsByEntry,
    stintsByEntry,
    flagEvents,
    weather,
    gridByEntry,
    classificationByEntry,
  };
}

/**
 * Reconstructs the leaderboard as it stood at the end of `lap`. Pure and
 * synchronous — takes an already-built context, does no I/O.
 */
export function computeStateAtLap(context, lap) {
  const {
    session, entries, totalLaps, lapsByEntry, positionsByEntry,
    stintsByEntry, flagEvents, weather, gridByEntry, classificationByEntry,
  } = context;

  const clampedLap = Math.max(0, Math.min(Math.floor(lap), totalLaps));
  const atEnd = totalLaps > 0 && clampedLap >= totalLaps;

  // The "as of" boundary in real time: the latest moment any driver
  // completed a lap at or before clampedLap. Used to filter position_change
  // (which is timestamped but not lap-numbered) to the right point in the
  // session. Before any lap has completed, nothing qualifies, so every
  // driver falls back to their grid slot below.
  let cutoffMs = -Infinity;
  for (const laps of lapsByEntry.values()) {
    for (const lapRecord of laps) {
      if (lapRecord.lapNumber <= clampedLap) {
        cutoffMs = Math.max(cutoffMs, new Date(lapRecord.occurredAt).getTime());
      }
    }
  }

  const leaderboard = entries.map((entry) => {
    const posHistory = positionsByEntry.get(entry.id) ?? [];
    let position = gridByEntry.get(entry.id) ?? null;
    for (const pc of posHistory) {
      if (new Date(pc.occurredAt).getTime() > cutoffMs) break;
      position = pc.payload.to_position;
    }

    // Tyre compound: whichever stint's start_lap is the latest one at or
    // before clampedLap (stints don't have a real end-lap boundary check
    // needed here — a later stint starting always supersedes the prior one).
    const stints = stintsByEntry.get(entry.id) ?? [];
    let tyreCompound = null;
    let stintNumber = null;
    for (const stint of stints) {
      if ((stint.payload.start_lap ?? 0) <= clampedLap) {
        tyreCompound = stint.payload.compound ?? tyreCompound;
        stintNumber = stint.payload.stint_number ?? stintNumber;
      }
    }

    const laps = lapsByEntry.get(entry.id) ?? [];
    const currentLapRecord = laps.find((l) => l.lapNumber === clampedLap) ?? null;
    const lastLapTime = currentLapRecord?.payload?.lap_time_ms != null
      ? currentLapRecord.payload.lap_time_ms / 1000
      : null;

    let status = null;
    if (atEnd) {
      const cls = classificationByEntry.get(entry.id);
      if (cls) {
        if (cls.final_position != null) position = cls.final_position;
        status = cls.status ?? null;
      }
    }

    return {
      entryId: entry.id,
      driverNumber: entry.driver.driverNumber,
      driverName: entry.driver.name,
      teamName: entry.team.name,
      position,
      tyreCompound,
      stintNumber,
      lastLapTime,
      status,
      // No continuous x,y telemetry is synced into the DB for any session
      // (openf1-sync.js never pulls /location) — RaceReplayViewer already
      // falls back to rank-based paced animation on the illustrative track
      // whenever x/y is null, so this is a supported, expected state, not
      // a bug. Real x,y only ever comes from the track-shape endpoint's own
      // live-OpenF1 telemetry, which traces one representative lap, not a
      // per-tick car position — those are two different problems.
      x: null,
      y: null,
    };
  });

  leaderboard.sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));

  leaderboard.forEach((driver, index) => {
    if (index === 0) {
      driver.gapToAhead = null;
      return;
    }
    const ahead = leaderboard[index - 1];
    const driverLap = (lapsByEntry.get(driver.entryId) ?? []).find((l) => l.lapNumber === clampedLap);
    const aheadLap = (lapsByEntry.get(ahead.entryId) ?? []).find((l) => l.lapNumber === clampedLap);
    driver.gapToAhead = (driverLap && aheadLap)
      ? (new Date(driverLap.occurredAt) - new Date(aheadLap.occurredAt)) / 1000
      : null;
  });

  const recentRaceControl = flagEvents
    .filter((e) => (e.lapNumber ?? 0) <= clampedLap)
    .slice(-5)
    .map((e) => ({
      date: e.occurredAt,
      lapNumber: e.lapNumber,
      category: e.eventType === 'flag_event' ? 'Flag' : (e.payload.category ?? null),
      flag: e.eventType === 'flag_event' ? e.payload.flag : null,
      message: e.eventType === 'flag_event' ? null : (e.payload.message_text ?? null),
    }));

  const latestWeather = weather
    .filter((w) => new Date(w.occurredAt).getTime() <= cutoffMs)
    .at(-1);

  return {
    lap: clampedLap,
    totalLaps,
    atEnd,
    session: {
      sessionId: session.id,
      sessionName: session.type,
      meetingName: session.meeting.name,
      circuitName: session.meeting.circuit.name,
      currentLap: clampedLap,
      totalLaps,
    },
    leaderboard,
    weather: latestWeather ? {
      airTemperature: latestWeather.payload.air_temp ?? null,
      trackTemperature: latestWeather.payload.track_temp ?? null,
      humidity: latestWeather.payload.humidity ?? null,
      rainfall: latestWeather.payload.rainfall ?? null,
      windSpeed: latestWeather.payload.wind_speed ?? null,
    } : null,
    recentRaceControl,
  };
}

const contextCache = new Map(); // sessionId -> { context, cachedAt }
const CONTEXT_CACHE_MS = 5 * 60 * 1000; // events don't change under normal use; 5 min just bounds staleness after a correction

async function getCachedReplayContext(sessionId) {
  const cached = contextCache.get(sessionId);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_CACHE_MS) {
    return cached.context;
  }
  const context = await buildReplayContext(sessionId);
  if (context) contextCache.set(sessionId, { context, cachedAt: Date.now() });
  return context;
}

raceReplayRouter.get('/:sessionId/state', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const lapValue = req.query.lap;
    const lap = typeof lapValue === 'string' && lapValue.trim() !== '' ? Number(lapValue) : Number.NaN;
    if (!Number.isFinite(lap) || lap < 0) {
      return res.status(400).json({ error: 'lap must be a non-negative finite number' });
    }

    const context = await getCachedReplayContext(sessionId);
    if (!context) return res.status(404).json({ error: 'Fixture not found' });
    if (context.totalLaps === 0) {
      return res.status(400).json({ error: 'This fixture has no synced lap data to replay' });
    }

    return res.json(computeStateAtLap(context, lap));
  } catch (err) {
    return next(err);
  }
});

raceReplayRouter.get('/:sessionId/track-shape', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { prisma } = await import('../lib/prisma.js');
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { meeting: { include: { circuit: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Fixture not found' });

    // 1. Real live telemetry for this exact session, if OpenF1 still has it.
    if (session.openf1Key != null) {
      try {
        const telemetry = await fetchSessionTrackTelemetryRaw(session.openf1Key);
        if (telemetry) {
          const shape = deriveTrackShapeFromTelemetry(telemetry.location, telemetry.laps);
          if (shape) return res.json({ ...shape, source: 'openf1-live' });
        }
      } catch (err) {
        // OpenF1 being unreachable shouldn't fail the whole request — fall
        // through to the static/illustrative fallbacks below.
        console.warn(`OpenF1 track telemetry fetch failed for session ${sessionId}:`, err.message);
      }
    }

    // 2. A real offline FastF1 trace for this circuit, if one's been generated.
    const staticShape = await readStaticTrackShape(session.meeting.circuit.name);
    if (staticShape) return res.json({ ...staticShape, source: 'fastf1-static-fallback' });

    // 3. Neither exists yet — the frontend has an illustrative fallback for
    // this, so a 404 here is an expected, handled outcome, not an error.
    return res.status(404).json({ error: 'No real track telemetry available for this circuit yet' });
  } catch (err) {
    return next(err);
  }
});