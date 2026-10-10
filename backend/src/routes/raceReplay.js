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
import { FROM_PUBLISHED_DATASET } from '../lib/eventVisibility.js';
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

  // Race Replay is public: only published data (OpenF1 syncs and accepted
  // uploads), and only the current version of each event — a corrected
  // event and its replacement would otherwise both be replayed.
  const events = await prisma.event.findMany({
    where: { sessionId, supersededById: null, ...FROM_PUBLISHED_DATASET },
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
    safetyCar: safetyCarStateAt(flagEvents, clampedLap),
  };
}

/**
 * Whether a safety car ('SC') or virtual safety car ('VSC') is out at the
 * end of a lap, replaying every race-control event up to that lap in
 * order. The last five messages alone can't answer this: "SAFETY CAR
 * DEPLOYED" stays among them after "SAFETY CAR IN THIS LAP", and drops out
 * during a long safety-car period.
 *
 * Track-wide green isn't recorded as such (a sector "CLEAR" is stored as a
 * green flag too), so only the safety-car messages themselves, a red flag
 * or the chequered flag end a period.
 */
export function safetyCarStateAt(raceControl, lap) {
  let state = null;
  for (const e of raceControl) {
    if ((e.lapNumber ?? 0) > lap) continue;
    const payload = e.payload ?? {};
    if (e.eventType === 'flag_event') {
      if (payload.flag === 'safety_car') state = 'SC';
      else if (payload.flag === 'vsc') state = 'VSC';
      else if (payload.flag === 'red' || payload.flag === 'chequered') state = null;
      continue;
    }
    const text = String(payload.message_text ?? '').toUpperCase();
    if (/VIRTUAL SAFETY CAR (DEPLOYED|IN EFFECT)/.test(text)) state = 'VSC';
    else if (/VIRTUAL SAFETY CAR ENDING/.test(text)) state = null;
    else if (/SAFETY CAR DEPLOYED/.test(text)) state = 'SC';
    else if (/SAFETY CAR IN THIS LAP|SAFETY CAR (IS )?WITHDRAWN/.test(text)) state = null;
  }
  return state;
}

/**
 * The whole race at once, as columns rather than as a leaderboard per lap.
 *
 * This is computeStateAtLap asked the same question for every lap, then
 * transposed: each measure becomes one array indexed by lap - 1, so a chart
 * (or a stint table, or a pace comparison) reads a driver's season of laps
 * as one list instead of scanning a row per lap. Nothing extra is derived
 * and nothing is interpolated — a driver who has no lap N simply carries a
 * null at that index.
 *
 * Built on computeStateAtLap on purpose rather than by re-reading the event
 * log a second time: whatever the /state endpoint answers for lap N is
 * exactly what this series holds at index N - 1, so a panel under the map
 * and the leaderboard beside it can never disagree about the same lap.
 */
export function buildLapSeries(context) {
  const { session, entries, totalLaps } = context;

  const snapshots = [];
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    snapshots.push(computeStateAtLap(context, lap));
  }

  const column = (entryId, measure) => snapshots.map((state) => {
    const driver = state.leaderboard.find((d) => d.entryId === entryId);
    return driver ? (driver[measure] ?? null) : null;
  });

  const drivers = entries.map((entry) => ({
    entryId: entry.id,
    driverName: entry.driver.name,
    teamName: entry.team.name,
    lapTimeSeconds: column(entry.id, 'lastLapTime'),
    position: column(entry.id, 'position'),
    compound: column(entry.id, 'tyreCompound'),
    stintNumber: column(entry.id, 'stintNumber'),
    gapToAhead: column(entry.id, 'gapToAhead'),
    // Only ever set at the flag — the classification event is what carries
    // it, and computeStateAtLap only reads that on the session's last lap.
    status: snapshots.at(-1)?.leaderboard.find((d) => d.entryId === entry.id)?.status ?? null,
  }));

  // Race order at the flag, so every panel that lists drivers lists them the
  // way the results read. A driver the log never placed sorts last.
  drivers.sort((a, b) => {
    const posA = a.position.at(-1) ?? Number.MAX_SAFE_INTEGER;
    const posB = b.position.at(-1) ?? Number.MAX_SAFE_INTEGER;
    return posA !== posB ? posA - posB : a.driverName.localeCompare(b.driverName);
  });

  return { sessionId: session.id, totalLaps, drivers };
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

/**
 * Build (or rebuild) a session's replay context and cache it, and hand back
 * the whole-race lap series RaceSync reads — called the moment a race has
 * been synced (see ingestion/openf1/syncSession.js), so the first person to
 * open it doesn't wait on the database. A rebuild replaces whatever was
 * cached before the sync.
 */
export async function warmReplayContext(sessionId) {
  contextCache.delete(sessionId);
  const context = await getCachedReplayContext(sessionId);
  if (!context || context.totalLaps === 0) return null;
  const series = buildLapSeries(context);
  return { totalLaps: context.totalLaps, drivers: series.drivers.length };
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

/**
 * The panels under RaceSync's map read the race as a whole, so they ask for
 * it as a whole: one response instead of one /state request per lap. Same
 * cached context, same pure builders — a read of an existing view, not a
 * second implementation of it.
 */
raceReplayRouter.get('/:sessionId/lap-series', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const context = await getCachedReplayContext(sessionId);
    if (!context) return res.status(404).json({ error: 'Fixture not found' });
    if (context.totalLaps === 0) {
      return res.status(400).json({ error: 'This fixture has no synced lap data to replay' });
    }

    return res.json(buildLapSeries(context));
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

    // 1. A real offline FastF1 trace for this circuit, if one's been
    // generated — checked FIRST, not second, despite being a "fallback" by
    // name. Race Replay's leaderboard never carries real per-car x/y (see
    // computeStateAtLap above — x/y is always null here), so this endpoint
    // only ever supplies the drawn track OUTLINE, and a static per-circuit
    // trace is exactly as real for that purpose as this exact session's own
    // live telemetry would be — same physical circuit, same shape. Static
    // is also a single local file read, versus live's ~10-12 chunked
    // /location requests (each behind a mandatory rate-limit pace delay,
    // see openf1.js's paceBundleRequests/fetchLocationDataChunked), which
    // was previously leaving the frontend on its illustrative fallback for
    // 30s-2min+ on every single load. Checking static first makes the
    // common case (a circuit we've already generated a trace for) instant.
    // Saved files come from FastF1 (generate_track_shapes.py) or, for
    // circuits FastF1 can't map, from OpenF1 location data
    // (generate-track-shape-from-openf1.js); `source` says which.
    const staticShape = await readStaticTrackShape(session.meeting.circuit.name);
    if (staticShape) {
      const source = staticShape.source === 'openf1' ? 'openf1-static' : 'fastf1-static-fallback';
      return res.json({ ...staticShape, source });
    }

    // 2. No static trace for this circuit yet — worth the slower live fetch
    // as a last resort, for whatever session-specific telemetry it can get.
    if (session.openf1Key != null) {
      try {
        const telemetry = await fetchSessionTrackTelemetryRaw(session.openf1Key);
        if (telemetry) {
          const shape = deriveTrackShapeFromTelemetry(telemetry.location, telemetry.laps);
          if (shape) return res.json({ ...shape, source: 'openf1-live' });
        }
      } catch (err) {
        // OpenF1 being unreachable shouldn't fail the whole request — fall
        // through to the illustrative fallback below.
        console.warn(`OpenF1 track telemetry fetch failed for session ${sessionId}:`, err.message);
      }
    }

    // 3. Neither exists — the frontend has an illustrative fallback for
    // this, so a 404 here is an expected, handled outcome, not an error.
    return res.status(404).json({ error: 'No real track telemetry available for this circuit yet' });
  } catch (err) {
    return next(err);
  }
});