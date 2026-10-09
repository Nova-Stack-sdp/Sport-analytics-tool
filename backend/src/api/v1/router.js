/**
 * Public API, version 1 — mounted at /api/v1.
 *
 * This is the API other platforms build on. It's separate from the
 * /api/* routes the website uses, which are shaped around individual pages
 * and can change with them; everything under /api/v1 keeps its shape for as
 * long as v1 exists. A breaking change means a /api/v2, not an edit here.
 *
 *   GET /api/v1                                  what's available
 *   GET /api/v1/fixtures                         filter + page fixtures
 *   GET /api/v1/fixtures/:id
 *   GET /api/v1/fixtures/:id/statistics          derived stats per driver
 *   GET /api/v1/fixtures/:id/statistics/:driverId  …and the events behind them
 *   GET /api/v1/events                           filter + page events
 *   GET /api/v1/events/:id
 *   GET /api/v1/drivers, /api/v1/teams           ids for filtering
 *   GET /api/v1/statistics/drivers               season aggregates
 *   GET /api/v1/statistics/drivers/:driverId/seasons/:season  …and their sources
 *   GET /api/v1/statistics/teams
 *   GET /api/v1/exports/events                   filtered events as CSV/JSON file
 *   GET /api/v1/exports/driver-season-stats      season table as CSV/JSON file
 *
 * List responses: { data: [...], page: { limit, hasMore, nextCursor } }.
 * Pass `cursor=<nextCursor>` for the next page. Bad parameters -> 400 with
 * a per-parameter explanation.
 */
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { FROM_UNDELETED_DATASET, isFromDeletedDataset } from '../../lib/eventVisibility.js';
import {
  parseQuery, parsers, pagingSpec, badRequest, DEFAULT_LIMIT,
} from './params.js';
import { decodeCursor, pageArgs, buildPage } from './pagination.js';
import {
  fixtureFilterSpec, fixtureWhere, fixtureOrder, fixtureInclude,
  eventFilterSpec, eventWhere, eventOrder, eventInclude,
} from './filters.js';
import * as shape from './serializers.js';
import { csvRow } from './csv.js';
import { codeRouter } from './code.js';

export const apiV1Router = Router();

apiV1Router.use((req, res, next) => {
  res.set('API-Version', '1');
  next();
});

const UUID = parsers.uuid();

function parsePaged(req, res, spec) {
  const { values, errors } = parseQuery(req.query, { ...spec, ...pagingSpec });
  if (errors) {
    badRequest(res, errors);
    return null;
  }
  const cursorId = values.cursor ? decodeCursor(values.cursor) : null;
  if (values.cursor && !cursorId) {
    badRequest(res, { cursor: 'is not a cursor this API issued — use page.nextCursor from a previous response' });
    return null;
  }
  return { values, limit: values.limit ?? DEFAULT_LIMIT, cursorId };
}

function checkId(res, name, value) {
  if (UUID(value).error) {
    badRequest(res, { [name]: 'must be an id (UUID)' });
    return false;
  }
  return true;
}

const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

// ------------------------------------------------------------------
// Index
// ------------------------------------------------------------------
apiV1Router.get('/', (req, res) => {
  res.json({
    version: 1,
    docs: 'See the API documentation page on the site (Developer → API docs).',
    endpoints: [
      'GET /api/v1/fixtures',
      'GET /api/v1/fixtures/:id',
      'GET /api/v1/fixtures/:id/statistics',
      'GET /api/v1/fixtures/:id/statistics/:driverId',
      'GET /api/v1/events',
      'GET /api/v1/events/:id',
      'GET /api/v1/drivers',
      'GET /api/v1/teams',
      'GET /api/v1/statistics/drivers',
      'GET /api/v1/statistics/drivers/:driverId/seasons/:season',
      'GET /api/v1/statistics/teams',
      'GET /api/v1/exports/events',
      'GET /api/v1/exports/driver-season-stats',
      'GET /api/v1/code',
      'GET /api/v1/code/:slug',
    ],
  });
});

// ------------------------------------------------------------------
// Approved code (see ./code.js)
// ------------------------------------------------------------------
apiV1Router.use('/code', codeRouter);

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------
apiV1Router.get('/fixtures', async (req, res, next) => {
  try {
    const parsed = parsePaged(req, res, fixtureFilterSpec);
    if (!parsed) return undefined;
    const rows = await prisma.session.findMany({
      where: fixtureWhere(parsed.values),
      orderBy: fixtureOrder,
      include: fixtureInclude,
      ...pageArgs(parsed),
    });
    const { data, page } = buildPage(rows, parsed.limit);
    return res.json({ data: data.map(shape.fixture), page });
  } catch (err) {
    return next(err);
  }
});

apiV1Router.get('/fixtures/:id', async (req, res, next) => {
  try {
    if (!checkId(res, 'id', req.params.id)) return undefined;
    const session = await prisma.session.findUnique({ where: { id: req.params.id }, include: fixtureInclude });
    if (!session) return notFound(res, 'Fixture');
    return res.json({ data: shape.fixture(session) });
  } catch (err) {
    return next(err);
  }
});

const sessionStatInclude = { entry: { include: { driver: true, team: true } } };

apiV1Router.get('/fixtures/:id/statistics', async (req, res, next) => {
  try {
    if (!checkId(res, 'id', req.params.id)) return undefined;
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) return notFound(res, 'Fixture');
    const rows = await prisma.driverSessionStats.findMany({
      where: { entry: { sessionId: req.params.id } },
      include: sessionStatInclude,
    });
    const data = rows
      .map(shape.driverSessionStat)
      .sort((a, b) => (a.finalPosition ?? 999) - (b.finalPosition ?? 999));
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
});

// One driver's derived stats in one fixture, with the exact events each
// figure was computed from and the submissions those events came in on.
apiV1Router.get('/fixtures/:id/statistics/:driverId', async (req, res, next) => {
  try {
    if (!checkId(res, 'id', req.params.id) || !checkId(res, 'driverId', req.params.driverId)) return undefined;
    const entry = await prisma.entry.findUnique({
      where: { sessionId_driverId: { sessionId: req.params.id, driverId: req.params.driverId } },
      include: { driver: true, team: true, sessionStats: true },
    });
    if (!entry) return notFound(res, 'Driver in this fixture');

    const events = await prisma.event.findMany({
      where: { entryId: entry.id, supersededById: null, ...FROM_UNDELETED_DATASET },
      orderBy: eventOrder,
      include: eventInclude,
    });
    const statSources = shape.sessionStatSources(events);
    const usedIds = new Set(Object.values(statSources).flat());
    const usedEvents = events.filter((e) => usedIds.has(e.id));

    const submissionIds = [...new Set(usedEvents.map((e) => e.sourceSubmissionId))];
    const submissions = submissionIds.length
      ? await prisma.submission.findMany({ where: { id: { in: submissionIds } } })
      : [];

    const stats = entry.sessionStats
      ? shape.driverSessionStat({ ...entry.sessionStats, entry })
      : null;

    return res.json({
      data: {
        statistics: stats,
        statSources,
        events: usedEvents.map(shape.event),
        submissions: submissions.map((s) =>
          shape.submission(s, usedEvents.filter((e) => e.sourceSubmissionId === s.id).length)
        ),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------
apiV1Router.get('/events', async (req, res, next) => {
  try {
    const parsed = parsePaged(req, res, eventFilterSpec);
    if (!parsed) return undefined;
    const rows = await prisma.event.findMany({
      where: eventWhere(parsed.values),
      orderBy: eventOrder,
      include: eventInclude,
      ...pageArgs(parsed),
    });
    const { data, page } = buildPage(rows, parsed.limit);
    return res.json({ data: data.map(shape.event), page });
  } catch (err) {
    return next(err);
  }
});

apiV1Router.get('/events/:id', async (req, res, next) => {
  try {
    if (!checkId(res, 'id', req.params.id)) return undefined;
    const e = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        ...eventInclude,
        supersedes: { select: { id: true } },
        sourceSubmission: { select: { deletedAt: true } },
      },
    });
    if (!e || isFromDeletedDataset(e)) return notFound(res, 'Event');
    // `supersedes` = the older event this one corrected, if any.
    return res.json({ data: { ...shape.event(e), supersedes: e.supersedes?.id ?? null } });
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------------
// Drivers and teams (for resolving ids to filter by)
// ------------------------------------------------------------------
const seasonSpec = { season: parsers.int({ min: 1950, max: 2100 }) };

apiV1Router.get('/drivers', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, seasonSpec);
    if (errors) return badRequest(res, errors);
    const drivers = await prisma.driver.findMany({
      where: values.season !== undefined ? { entries: { some: { session: { meeting: { season: values.season } } } } } : {},
      orderBy: { driverNumber: 'asc' },
    });
    return res.json({ data: drivers.map(shape.driver) });
  } catch (err) {
    return next(err);
  }
});

apiV1Router.get('/teams', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, seasonSpec);
    if (errors) return badRequest(res, errors);
    const teams = await prisma.team.findMany({
      where: values.season !== undefined ? { season: values.season } : {},
      orderBy: [{ season: 'desc' }, { name: 'asc' }],
    });
    return res.json({ data: teams.map(shape.team) });
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------------
// Season statistics
// ------------------------------------------------------------------
apiV1Router.get('/statistics/drivers', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, { ...seasonSpec, driver: parsers.uuid() });
    if (errors) return badRequest(res, errors);
    const rows = await prisma.driverCareerStats.findMany({
      where: {
        ...(values.season !== undefined && { season: values.season }),
        ...(values.driver && { driverId: values.driver }),
      },
      include: { driver: true },
      orderBy: [{ season: 'desc' }, { points: 'desc' }, { driverId: 'asc' }],
    });
    return res.json({ data: rows.map(shape.driverSeasonStat) });
  } catch (err) {
    return next(err);
  }
});

// A driver's season total, broken down into the race results it was summed
// from — each traceable to its classification event and submission.
apiV1Router.get('/statistics/drivers/:driverId/seasons/:season', async (req, res, next) => {
  try {
    if (!checkId(res, 'driverId', req.params.driverId)) return undefined;
    const seasonCheck = seasonSpec.season(req.params.season);
    if (seasonCheck.error) return badRequest(res, { season: seasonCheck.error });
    const season = seasonCheck.value;

    const row = await prisma.driverCareerStats.findUnique({
      where: { driverId_season: { driverId: req.params.driverId, season } },
      include: { driver: true },
    });
    if (!row) return notFound(res, 'Season statistics for this driver');

    // Same selection as deriveDriverCareerStats (src/derivation/db.js).
    const entries = await prisma.entry.findMany({
      where: { driverId: req.params.driverId, session: { type: 'Race', meeting: { season } } },
      include: {
        session: { include: fixtureInclude },
        events: { where: { eventType: 'classification', supersededById: null }, take: 1 },
      },
    });
    const results = entries
      .map((entry) => {
        const c = entry.events[0];
        return {
          fixture: shape.fixture(entry.session),
          classificationEventId: c?.id ?? null,
          submissionId: c?.sourceSubmissionId ?? null,
          finalPosition: c?.payload?.final_position ?? null,
          points: c?.payload?.points ?? null,
          status: c?.payload?.status ?? null,
        };
      })
      .sort((a, b) => new Date(a.fixture.startTime) - new Date(b.fixture.startTime));

    return res.json({ data: { statistics: shape.driverSeasonStat(row), results } });
  } catch (err) {
    return next(err);
  }
});

apiV1Router.get('/statistics/teams', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, { ...seasonSpec, team: parsers.uuid() });
    if (errors) return badRequest(res, errors);
    const rows = await prisma.teamSeasonStats.findMany({
      where: {
        ...(values.season !== undefined && { season: values.season }),
        ...(values.team && { teamId: values.team }),
      },
      include: { team: true },
      orderBy: [{ season: 'desc' }, { points: 'desc' }, { teamId: 'asc' }],
    });
    return res.json({ data: rows.map(shape.teamSeasonStat) });
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------------
// Exports — the same filters as the list endpoints, as a downloadable file.
// Streamed in batches so a whole season doesn't have to fit in memory.
// ------------------------------------------------------------------
const formatSpec = { format: parsers.oneOf(['csv', 'json']) };
const EXPORT_BATCH = 2000;

const EVENT_CSV_COLUMNS = [
  'event_id', 'fixture_id', 'season', 'meeting', 'session_type', 'event_type', 'lap',
  'occurred_at', 'driver_id', 'driver_number', 'driver_name', 'team_id', 'team_name',
  'submission_id', 'superseded_by', 'payload',
];

function eventCsvValues(e) {
  return [
    e.id, e.sessionId, e.session?.meeting?.season, e.session?.meeting?.name, e.session?.type,
    e.eventType, e.lapNumber, e.occurredAt, e.entry?.driver?.id, e.entry?.driver?.driverNumber,
    e.entry?.driver?.name, e.entry?.team?.id, e.entry?.team?.name, e.sourceSubmissionId,
    e.supersededById, e.payload,
  ];
}

function startDownload(res, filename, format) {
  res.set('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}.${format}"`);
}

function exportName(base, values) {
  const parts = [base];
  if (values.season !== undefined) parts.push(String(values.season));
  if (values.fixture) parts.push(values.fixture.slice(0, 8));
  if (values.type) parts.push(values.type.join('+'));
  return parts.join('-');
}

apiV1Router.get('/exports/events', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, { ...eventFilterSpec, ...formatSpec });
    if (errors) return badRequest(res, errors);
    const format = values.format ?? 'csv';
    const where = eventWhere(values);
    const include = { ...eventInclude, session: { include: { meeting: true } } };

    startDownload(res, exportName('events', values), format);
    res.write(format === 'csv' ? csvRow(EVENT_CSV_COLUMNS) : '[\n');

    let cursorId = null;
    let first = true;
    // Page through with the same cursor mechanism as the list endpoint.
    for (;;) {
      const batch = await prisma.event.findMany({
        where, orderBy: eventOrder, include,
        take: EXPORT_BATCH,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      for (const e of batch) {
        if (format === 'csv') {
          res.write(csvRow(eventCsvValues(e)));
        } else {
          res.write(`${first ? '' : ',\n'}${JSON.stringify({ ...shape.event(e), season: e.session?.meeting?.season ?? null })}`);
          first = false;
        }
      }
      if (batch.length < EXPORT_BATCH) break;
      cursorId = batch[batch.length - 1].id;
    }

    if (format === 'json') res.write('\n]\n');
    return res.end();
  } catch (err) {
    // Headers may already be sent mid-stream; let Express end the response.
    if (res.headersSent) return res.end();
    return next(err);
  }
});

apiV1Router.get('/exports/driver-season-stats', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, { ...seasonSpec, ...formatSpec });
    if (errors) return badRequest(res, errors);
    const format = values.format ?? 'csv';
    const rows = await prisma.driverCareerStats.findMany({
      where: values.season !== undefined ? { season: values.season } : {},
      include: { driver: true },
      orderBy: [{ season: 'desc' }, { points: 'desc' }, { driverId: 'asc' }],
    });

    startDownload(res, exportName('driver-season-stats', values), format);
    if (format === 'json') return res.end(JSON.stringify(rows.map(shape.driverSeasonStat), null, 2));

    res.write(csvRow(['season', 'driver_id', 'driver_number', 'driver_name', 'points', 'wins', 'podiums', 'dnf_count']));
    for (const r of rows) {
      res.write(csvRow([r.season, r.driver.id, r.driver.driverNumber, r.driver.name, r.points, r.wins, r.podiums, r.dnfCount]));
    }
    return res.end();
  } catch (err) {
    return next(err);
  }
});

// Anything else under /api/v1.
apiV1Router.use((req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'GET /api/v1 lists the available endpoints.' });
});
