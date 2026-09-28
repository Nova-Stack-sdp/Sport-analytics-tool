/**
 * Bulk rebuild of every projection table, for backfills.
 *
 * runDerivationForSession() is right for one new or corrected session, but
 * replaying it for every session is very slow over a network: each session
 * recomputes the whole season for each of its drivers and teams, one small
 * query at a time. For 100 sessions that is hundreds of thousands of
 * queries. At ~0.3 s per round trip to Neon, that takes more than 8 hours.
 *
 * This does the same work in bulk and reuses the same pure functions from
 * pure.js, so the numbers are identical:
 *   1. driver_session_stats: one read of the session's events and one
 *      write per session.
 *   2. driver_career_stats, team_season_stats, head_to_head: one read of
 *      every Race/Sprint entry and classification, everything computed in
 *      memory, then written in a single transaction.
 */
import {
  computeSessionStatsForEntry,
  computeCareerAggregate,
  computeSeasonAggregate,
  computeHeadToHead,
} from "./pure.js";

const LIVE = { supersededById: null };
const POINTS_SESSIONS = ["Race", "Sprint"];
// The only event types computeSessionStatsForEntry reads — no need to pull
// thousands of position_change / weather rows across the network.
const SESSION_STAT_TYPES = ["lap_completed", "pit_stop", "classification", "grid_position"];

/** driver_session_stats for one session: 3 round trips however many entries it has. */
export async function rebuildSessionStats(prisma, sessionId) {
  const [entries, events] = await Promise.all([
    prisma.entry.findMany({ where: { sessionId }, select: { id: true } }),
    prisma.event.findMany({
      where: { sessionId, entryId: { not: null }, eventType: { in: SESSION_STAT_TYPES }, ...LIVE },
      select: { entryId: true, eventType: true, lapNumber: true, payload: true },
    }),
  ]);

  const byEntry = new Map(entries.map((e) => [e.id, []]));
  for (const event of events) byEntry.get(event.entryId)?.push(event);

  const rows = entries.map((e) => ({ entryId: e.id, ...computeSessionStatsForEntry(byEntry.get(e.id)) }));
  await prisma.$transaction([
    prisma.driverSessionStats.deleteMany({ where: { entry: { sessionId } } }),
    prisma.driverSessionStats.createMany({ data: rows }),
  ]);
  return rows.length;
}

/**
 * Pure: every aggregate row, from the Race/Sprint entries of the given
 * sessions and their classifications. Mirrors runDerivationForSession:
 *   - a (driver, season) or (team, season) row for everyone with an entry;
 *   - head-to-head for every pair of teammates who shared a session,
 *     counted over every Grand Prix both entered.
 *
 * @param {Array<{id, driverId, teamId, sessionId, sessionType, season}>} entries
 * @param {Map<string, {finalPosition, points, status}>} classificationByEntry
 */
export function planAggregates(entries, classificationByEntry) {
  const driverSeason = new Map();
  const teamSeason = new Map();
  const add = (map, key, id, season) => {
    if (!map.has(key)) map.set(key, { id, season, results: [] });
    return map.get(key);
  };

  for (const e of entries) {
    const d = add(driverSeason, `${e.driverId}|${e.season}`, e.driverId, e.season);
    const t = add(teamSeason, `${e.teamId}|${e.season}`, e.teamId, e.season);
    const c = classificationByEntry.get(e.id);
    if (c) {
      const result = { ...c, sessionType: e.sessionType };
      d.results.push(result);
      t.results.push(result);
    }
  }

  const careerStats = [...driverSeason.values()].map(({ id, season, results }) => ({
    driverId: id, season, ...computeCareerAggregate(results),
  }));
  const teamStats = [...teamSeason.values()].map(({ id, season, results }) => ({
    teamId: id, season, ...computeSeasonAggregate(results),
  }));

  // Teammate pairs, sorted so a pair is only stored once.
  const pairs = new Set();
  const bySessionTeam = new Map();
  for (const e of entries) {
    const key = `${e.sessionId}|${e.teamId}`;
    if (!bySessionTeam.has(key)) bySessionTeam.set(key, []);
    bySessionTeam.get(key).push(e.driverId);
  }
  for (const drivers of bySessionTeam.values()) {
    for (let i = 0; i < drivers.length; i++) {
      for (let j = i + 1; j < drivers.length; j++) {
        pairs.add([drivers[i], drivers[j]].sort().join("|"));
      }
    }
  }

  // Grand Prix entries per driver: sessionId -> entryId.
  const raceEntries = new Map();
  for (const e of entries) {
    if (e.sessionType !== "Race") continue;
    if (!raceEntries.has(e.driverId)) raceEntries.set(e.driverId, new Map());
    raceEntries.get(e.driverId).set(e.sessionId, e.id);
  }

  const headToHead = [...pairs].map((pair) => {
    const [a, b] = pair.split("|");
    const sessionsA = raceEntries.get(a) ?? new Map();
    const sessionsB = raceEntries.get(b) ?? new Map();
    const resultsA = [];
    const resultsB = [];
    for (const [sessionId, entryA] of sessionsA) {
      const entryB = sessionsB.get(sessionId);
      if (!entryB) continue;
      resultsA.push(classificationByEntry.get(entryA) ?? { finalPosition: null });
      resultsB.push(classificationByEntry.get(entryB) ?? { finalPosition: null });
    }
    return { subjectAId: a, subjectBId: b, subjectType: "driver", ...computeHeadToHead(resultsA, resultsB) };
  });

  return { careerStats, teamStats, headToHead };
}

/** Rebuilds the three aggregate tables for the given sessions in one transaction. */
export async function rebuildAggregates(prisma, sessionIds) {
  const where = { sessionId: { in: sessionIds }, session: { type: { in: POINTS_SESSIONS } } };
  const [entryRows, classifications] = await Promise.all([
    prisma.entry.findMany({
      where,
      select: {
        id: true, driverId: true, teamId: true, sessionId: true,
        session: { select: { type: true, meeting: { select: { season: true } } } },
      },
    }),
    prisma.event.findMany({
      where: { ...where, eventType: "classification", entryId: { not: null }, ...LIVE },
      select: { entryId: true, payload: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const entries = entryRows.map((e) => ({
    id: e.id, driverId: e.driverId, teamId: e.teamId, sessionId: e.sessionId,
    sessionType: e.session.type, season: e.session.meeting.season,
  }));
  // Same reading as getClassification() in db.js: one live classification per entry.
  const classificationByEntry = new Map();
  for (const c of classifications) {
    if (classificationByEntry.has(c.entryId)) continue;
    classificationByEntry.set(c.entryId, {
      finalPosition: c.payload.final_position ?? null,
      points: c.payload.points ?? 0,
      status: c.payload.status ?? null,
    });
  }

  const plan = planAggregates(entries, classificationByEntry);
  await prisma.$transaction([
    prisma.driverCareerStats.deleteMany({}),
    prisma.teamSeasonStats.deleteMany({}),
    prisma.headToHead.deleteMany({ where: { subjectType: "driver" } }),
    prisma.driverCareerStats.createMany({ data: plan.careerStats }),
    prisma.teamSeasonStats.createMany({ data: plan.teamStats }),
    prisma.headToHead.createMany({ data: plan.headToHead }),
  ]);
  return {
    careerStats: plan.careerStats.length,
    teamStats: plan.teamStats.length,
    headToHead: plan.headToHead.length,
  };
}
