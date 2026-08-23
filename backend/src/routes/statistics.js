import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const statisticsRouter = Router();

function sessionLabel(session) {
  return `${session.meeting.name} ${session.meeting.season} · ${session.type}`;
}

/** One driver row per season, from driver_career_stats (which, despite the
 * name, is keyed by driverId+season — see schema.prisma), enriched with
 * team and fastest-lap info pulled from that season's entries. */
async function getSeasonRows(season) {
  const careerRows = await prisma.driverCareerStats.findMany({
    where: { season },
    orderBy: { points: 'desc' },
    include: { driver: true },
  });
  if (careerRows.length === 0) return [];

  const driverIds = careerRows.map((r) => r.driverId);
  const entries = await prisma.entry.findMany({
    where: { driverId: { in: driverIds }, session: { meeting: { season } } },
    include: { team: true, sessionStats: true },
  });

  const byDriver = new Map();
  for (const e of entries) {
    if (!byDriver.has(e.driverId)) byDriver.set(e.driverId, []);
    byDriver.get(e.driverId).push(e);
  }

  return careerRows.map((r) => {
    const driverEntries = byDriver.get(r.driverId) ?? [];
    const team = driverEntries[driverEntries.length - 1]?.team ?? null;
    const lapTimes = driverEntries
      .map((e) => e.sessionStats?.fastestLapMs)
      .filter((t) => typeof t === 'number');

    return {
      driverId: r.driverId,
      name: r.driver.name,
      teamName: team?.name ?? null,
      points: r.points,
      wins: r.wins,
      podiums: r.podiums,
      fastestLapMs: lapTimes.length ? Math.min(...lapTimes) : null,
      fixturesCount: driverEntries.length,
    };
  });
}

/** True career totals: every driver_career_stats row (one per season a
 * driver raced) summed together per driver — this table is per-season, so
 * "career" means aggregating across all of a driver's season rows. */
async function getCareerRows() {
  const careerRows = await prisma.driverCareerStats.findMany({ include: { driver: true } });
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

  const driverIds = [...totals.keys()];
  const entries = await prisma.entry.findMany({
    where: { driverId: { in: driverIds } },
    include: { team: true, sessionStats: true, session: true },
  });

  const byDriver = new Map();
  for (const e of entries) {
    if (!byDriver.has(e.driverId)) byDriver.set(e.driverId, []);
    byDriver.get(e.driverId).push(e);
  }

  const rows = [...totals.values()].map((t) => {
    const driverEntries = (byDriver.get(t.driverId) ?? []).slice().sort(
      (a, b) => new Date(a.session.startTime) - new Date(b.session.startTime)
    );
    const mostRecentTeam = driverEntries[driverEntries.length - 1]?.team ?? null;
    const lapTimes = driverEntries
      .map((e) => e.sessionStats?.fastestLapMs)
      .filter((n) => typeof n === 'number');

    return {
      ...t,
      teamName: mostRecentTeam?.name ?? null,
      fastestLapMs: lapTimes.length ? Math.min(...lapTimes) : null,
      fixturesCount: driverEntries.length,
    };
  });

  rows.sort((a, b) => b.points - a.points);
  return rows;
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
      teamName: e.team.name,
      finalPosition: e.sessionStats?.finalPosition ?? null,
      points: e.sessionStats?.points ?? null,
      fastestLapMs: e.sessionStats?.fastestLapMs ?? null,
      avgLapMs: e.sessionStats?.avgLapMs ?? null,
      totalPitTimeMs: e.sessionStats?.totalPitTimeMs ?? null,
      positionsGained: e.sessionStats?.positionsGained ?? null,
    }))
    .sort((a, b) => {
      if (a.finalPosition == null) return 1;
      if (b.finalPosition == null) return -1;
      return a.finalPosition - b.finalPosition;
    });
}

statisticsRouter.get('/', async (req, res, next) => {
  try {
    const view = ['season', 'career', 'fixture'].includes(req.query.view)
      ? req.query.view
      : 'season';

    if (view === 'season') {
      const meetings = await prisma.meeting.findMany({
        distinct: ['season'],
        select: { season: true },
        orderBy: { season: 'desc' },
      });
      const availableSeasons = meetings.map((m) => m.season);
      const season = req.query.season ? Number(req.query.season) : availableSeasons[0] ?? null;
      const rows = season !== null ? await getSeasonRows(season) : [];
      return res.json({ view, season, availableSeasons, rows });
    }

    if (view === 'career') {
      const rows = await getCareerRows();
      return res.json({ view, rows });
    }

    // view === 'fixture'
    const sessions = await prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      include: { meeting: true },
      take: 20,
    });
    const availableSessions = sessions.map((s) => ({ id: s.id, label: sessionLabel(s) }));
    const sessionId = req.query.sessionId || sessions[0]?.id || null;
    const rows = sessionId ? await getFixtureRows(sessionId) : [];
    const session = sessions.find((s) => s.id === sessionId) ?? null;

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