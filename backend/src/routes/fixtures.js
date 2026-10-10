import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { FROM_PUBLISHED_DATASET } from '../lib/eventVisibility.js';

export const fixturesRouter = Router();

// Fixtures & Events is a public page, so it reads only published data:
// OpenF1 syncs and uploads an admin accepted — the same events the
// statistics are derived from. Uploads still under review, rejected or
// deleted are left out.
const PUBLISHED = FROM_PUBLISHED_DATASET;

const EVENT_TYPES = [
  'lap_completed', 'pit_stop', 'tyre_stint', 'position_change', 'flag_event',
  'race_control_message', 'weather_snapshot', 'session_status_change',
  'classification', 'grid_position',
];
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The event types Race Replay needs present to reconstruct a watchable
// leaderboard — see backend/scripts/inspect-sessions.js, which this mirrors
// (that script is the read-only reporting tool for a human to run; this is
// the same check baked into the live fixtures list so the frontend's match
// picker can filter to only sessions that will actually work).
const REPLAY_REQUIRED_EVENT_TYPES = ['lap_completed', 'position_change', 'classification'];

// List every fixture (session), newest first, flagging any that have had an
// event corrected — "corrected" isn't a stored SessionStatus, it's derived
// by checking whether any event for that session has been superseded.
fixturesRouter.get('/', async (req, res, next) => {
  try {
    // The three reads are independent, so they go to the database together
    // (one round trip instead of three).
    const [sessions, correctedGroups, eventTypeGroups, eventCountGroups] = await Promise.all([
      prisma.session.findMany({
        orderBy: { startTime: 'desc' },
        include: { meeting: { include: { circuit: true } } },
      }),
      prisma.event.groupBy({
        by: ['sessionId'],
        where: { supersededById: { not: null }, ...PUBLISHED },
        _count: { _all: true },
      }),
      // One query for every session's event-type coverage, rather than N+1 —
      // groups by (sessionId, eventType) so we can tell exactly which of the
      // required types each session has.
      prisma.event.groupBy({
        by: ['sessionId', 'eventType'],
        where: { eventType: { in: REPLAY_REQUIRED_EVENT_TYPES }, ...PUBLISHED },
      }),
      // Current (not superseded) published events per session.
      prisma.event.groupBy({
        by: ['sessionId'],
        where: { supersededById: null, ...PUBLISHED },
        _count: { _all: true },
      }),
    ]);
    const eventCounts = new Map(eventCountGroups.map((g) => [g.sessionId, g._count._all]));
    const correctedSessionIds = new Set(correctedGroups.map((g) => g.sessionId));
    const eventTypesBySession = new Map();
    for (const g of eventTypeGroups) {
      if (!eventTypesBySession.has(g.sessionId)) eventTypesBySession.set(g.sessionId, new Set());
      eventTypesBySession.get(g.sessionId).add(g.eventType);
    }

    const fixtures = sessions.map((s) => {
      const presentTypes = eventTypesBySession.get(s.id) ?? new Set();
      return {
        id: s.id,
        meetingName: s.meeting.name,
        circuitName: s.meeting.circuit.name,
        country: s.meeting.circuit.country,
        season: s.meeting.season,
        type: s.type,
        startTime: s.startTime,
        status: s.status,
        hasCorrections: correctedSessionIds.has(s.id),
        eventCount: eventCounts.get(s.id) ?? 0,
        replayReady: REPLAY_REQUIRED_EVENT_TYPES.every((t) => presentTypes.has(t)),
      };
    });

    res.json({ fixtures });
  } catch (err) {
    next(err);
  }
});

// The event log for one fixture, in race order. This is the record every
// statistic on the site is derived from.
//
// Query parameters (all optional):
//   type=<event type>        only that kind of event
//   includeSuperseded=true   also list versions later replaced by a correction
//   limit=1..500             page size (default 200)
//   cursor=<event id>        continue after this event (page.nextCursor)
fixturesRouter.get('/:sessionId/events', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { type, cursor } = req.query;
    const includeSuperseded = ['1', 'true'].includes(String(req.query.includeSuperseded ?? ''));
    const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(req.query.limit);

    if (type !== undefined && !EVENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${EVENT_TYPES.join(', ')}` });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}` });
    }
    if (cursor !== undefined && !UUID.test(String(cursor))) {
      return res.status(400).json({ error: 'cursor must be an event id from page.nextCursor' });
    }

    const where = {
      sessionId,
      ...PUBLISHED,
      ...(includeSuperseded ? {} : { supersededById: null }),
      ...(type ? { eventType: type } : {}),
    };

    // Fetched together; for an unknown id the other reads just come back empty.
    const [session, rows, total, derivedStatsCount] = await Promise.all([
      prisma.session.findUnique({
        where: { id: sessionId },
        include: { meeting: { include: { circuit: true } } },
      }),
      prisma.event.findMany({
        where,
        // id breaks ties between events at the same instant, so pages never
        // skip or repeat an event.
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        include: { entry: { include: { driver: true } }, supersedes: { select: { id: true } } },
        take: limit + 1,
        ...(cursor ? { cursor: { id: String(cursor) }, skip: 1 } : {}),
      }),
      prisma.event.count({ where }),
      // Number of drivers whose session statistics are derived from this log.
      prisma.driverSessionStats.count({
        where: { entry: { sessionId } },
      }),
    ]);
    if (!session) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      session: {
        id: session.id,
        meetingName: session.meeting.name,
        circuitName: session.meeting.circuit.name,
        country: session.meeting.circuit.country,
        season: session.meeting.season,
        type: session.type,
        status: session.status,
        startTime: session.startTime,
      },
      derivedStatsCount,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        lapNumber: e.lapNumber,
        occurredAt: e.occurredAt,
        driverName: e.entry?.driver?.name ?? null,
        payload: e.payload,
        // This event replaced an earlier version (a correction).
        isCorrection: Boolean(e.supersedes),
        // This version was later replaced; only listed with includeSuperseded.
        superseded: e.supersededById !== null,
      })),
      page: { total, nextCursor: hasMore ? events[events.length - 1].id : null },
    });
  } catch (err) {
    next(err);
  }
});
