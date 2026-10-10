import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { teamIdentity } from '../lib/teamIdentity.js';

export const statisticsRouter = Router();

const VIEWS = ['season', 'career', 'fixture', 'constructors'];
// Sessions whose results count towards a driver's season: points are only
// scored in races and sprints.
const RACE_TYPES = new Set(['Race', 'Sprint']);

function sessionLabel(session) {
  return `${session.meeting.name} ${session.meeting.season} · ${session.type}`;
}

/** teamId, teamName, teamColor and teamCode for a row. */
function teamFields(team) {
  const { color, code } = teamIdentity(team?.name);
  return {
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    teamColor: team ? color : null,
    teamCode: team ? code : null,
  };
}

// Championship order: points, then wins, then podiums, then name so equal
// rows always come out the same way.
function byChampionship(a, b) {
  return (b.points - a.points) || (b.wins - a.wins) || ((b.podiums ?? 0) - (a.podiums ?? 0))
    || String(a.name).localeCompare(String(b.name));
}

function groupByDriver(entries) {
  const byDriver = new Map();
  for (const e of entries) {
    if (!byDriver.has(e.driverId)) byDriver.set(e.driverId, []);
    byDriver.get(e.driverId).push(e);
  }
  for (const list of byDriver.values()) {
    list.sort((a, b) => new Date(a.session.startTime) - new Date(b.session.startTime));
  }
  return byDriver;
}

function entryFigures(driverEntries) {
  const lapTimes = driverEntries
    .map((e) => e.sessionStats?.fastestLapMs)
    .filter((t) => typeof t === 'number');
  return {
    fastestLapMs: lapTimes.length ? Math.min(...lapTimes) : null,
    // Races and sprints entered — the sessions the points come from.
    racesCount: driverEntries.filter((e) => RACE_TYPES.has(e.session.type)).length,
  };
}

/** One driver row per season, from driver_career_stats (which, despite the
 * name, is keyed by driverId+season — see schema.prisma), enriched with
 * team and fastest-lap info pulled from that season's entries. */
async function getSeasonRows(season) {
  // Both reads only need the season, so they go to the database together
  // (one round trip). Entries of drivers without a stats row are ignored below.
  const [careerRows, entries] = await Promise.all([
    prisma.driverCareerStats.findMany({
      where: { season },
      include: { driver: true },
    }),
    prisma.entry.findMany({
      where: { session: { meeting: { season } } },
      include: { team: true, sessionStats: true, session: true },
    }),
  ]);
  if (careerRows.length === 0) return [];

  const byDriver = groupByDriver(entries);
  return careerRows
    .map((r) => {
      const driverEntries = byDriver.get(r.driverId) ?? [];
      return {
        driverId: r.driverId,
        name: r.driver.name,
        ...teamFields(driverEntries[driverEntries.length - 1]?.team ?? null),
        points: r.points,
        wins: r.wins,
        podiums: r.podiums,
        ...entryFigures(driverEntries),
      };
    })
    .sort(byChampionship);
}

/** True career totals: every driver_career_stats row (one per season a
 * driver raced) summed together per driver — this table is per-season, so
 * "career" means aggregating across all of a driver's season rows. */
async function getCareerRows() {
  // Sent together, as in getSeasonRows.
  const [careerRows, entries] = await Promise.all([
    prisma.driverCareerStats.findMany({ include: { driver: true } }),
    prisma.entry.findMany({ include: { team: true, sessionStats: true, session: true } }),
  ]);
  if (careerRows.length === 0) return [];

  const totals = new Map();
  for (const r of careerRows) {
    if (!totals.has(r.driverId)) {
      totals.set(r.driverId, {
        driverId: r.driverId,
        name: r.driver.name,
        points: 0,
        wins: 0,
        podiums: 0,
        seasonsCount: 0,
      });
    }
    const t = totals.get(r.driverId);
    t.points += r.points;
    t.wins += r.wins;
    t.podiums += r.podiums;
    t.seasonsCount += 1;
  }

  const byDriver = groupByDriver(entries);
  return [...totals.values()]
    .map((t) => {
      const driverEntries = byDriver.get(t.driverId) ?? [];
      return {
        ...t,
        ...teamFields(driverEntries[driverEntries.length - 1]?.team ?? null),
        ...entryFigures(driverEntries),
      };
    })
    .sort(byChampionship);
}

/** Per-driver result for one specific session, straight from
 * driver_session_stats. */
async function getFixtureRows(sessionId) {
  const entries = await prisma.entry.findMany({
    where: { sessionId },
    include: { driver: true, team: true, sessionStats: true },
  });

  return entries
    .map((e) => ({
      driverId: e.driverId,
      name: e.driver.name,
      ...teamFields(e.team),
      finalPosition: e.sessionStats?.finalPosition ?? null,
      points: e.sessionStats?.points ?? null,
      fastestLapMs: e.sessionStats?.fastestLapMs ?? null,
      avgLapMs: e.sessionStats?.avgLapMs ?? null,
      totalPitTimeMs: e.sessionStats?.totalPitTimeMs ?? null,
      positionsGained: e.sessionStats?.positionsGained ?? null,
    }))
    .sort((a, b) => {
      if (a.finalPosition == null && b.finalPosition == null) return a.name.localeCompare(b.name);
      if (a.finalPosition == null) return 1;
      if (b.finalPosition == null) return -1;
      return a.finalPosition - b.finalPosition;
    });
}

/** Constructors' standings for one season, from team_season_stats. */
async function getConstructorRows(season) {
  const rows = await prisma.teamSeasonStats.findMany({
    where: { season },
    include: { team: true },
  });
  return rows
    .map((r) => ({
      ...teamFields(r.team),
      name: r.team.name,
      points: r.points,
      wins: r.wins,
      reliabilityRate: r.reliabilityRate,
    }))
    .sort(byChampionship);
}

async function availableSeasons() {
  const meetings = await prisma.meeting.findMany({
    distinct: ['season'],
    select: { season: true },
    orderBy: { season: 'desc' },
  });
  return meetings.map((m) => m.season);
}

function parseSeason(value) {
  if (value === undefined || value === '') return { season: null };
  const season = Number(value);
  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    return { error: 'season must be a year between 1950 and 2100' };
  }
  return { season };
}

statisticsRouter.get('/', async (req, res, next) => {
  try {
    const view = req.query.view === undefined ? 'season' : req.query.view;
    if (!VIEWS.includes(view)) {
      return res.status(400).json({ error: `view must be one of: ${VIEWS.join(', ')}` });
    }

    if (view === 'season' || view === 'constructors') {
      const { season: requested, error } = parseSeason(req.query.season);
      if (error) return res.status(400).json({ error });
      const getRows = view === 'season' ? getSeasonRows : getConstructorRows;
      // With ?season= the rows don't depend on the season list: fetch both at once.
      const [seasons, requestedRows] = await Promise.all([
        availableSeasons(),
        requested !== null ? getRows(requested) : null,
      ]);
      const season = requested ?? seasons[0] ?? null;
      const rows = requestedRows ?? (season !== null ? await getRows(season) : []);
      return res.json({ view, season, availableSeasons: seasons, rows });
    }

    if (view === 'career') {
      const rows = await getCareerRows();
      return res.json({ view, rows });
    }

    // view === 'fixture': every session, newest first, so any fixture can
    // be picked (not only the latest 20).
    const sessions = await prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      include: { meeting: true },
    });
    const availableSessions = sessions.map((s) => ({
      id: s.id,
      label: sessionLabel(s),
      season: s.meeting.season,
      type: s.type,
    }));
    const sessionId = req.query.sessionId || sessions[0]?.id || null;
    const session = sessions.find((s) => s.id === sessionId) ?? null;
    if (req.query.sessionId && !session) {
      return res.status(404).json({ error: 'Fixture not found' });
    }
    const rows = sessionId ? await getFixtureRows(sessionId) : [];

    return res.json({
      view,
      sessionId,
      sessionLabel: session ? sessionLabel(session) : null,
      availableSessions,
      rows,
    });
  } catch (err) {
    next(err);
  }
});
