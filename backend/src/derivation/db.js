import {
  computeSessionStatsForEntry,
  computeCareerAggregate,
  computeSeasonAggregate,
  computeHeadToHead,
} from "./pure.js";

/**
 * A "live" event is one that hasn't been corrected yet: supersededBy is null.
 * If an event was corrected, the newer event (which itself has
 * supersededBy: null until it too gets corrected) is what derivation reads —
 * the old one is skipped. This is the only place that filter needs to be
 * applied; everything downstream just sees the current truth.
 */
const LIVE = { supersededBy: null };

/** Recompute driver_session_stats for every entry in one session. */
export async function deriveSessionStats(prisma, sessionId) {
  const entries = await prisma.entry.findMany({ where: { sessionId } });

  for (const entry of entries) {
    const events = await prisma.event.findMany({
      where: { sessionId, entryId: entry.id, ...LIVE },
    });
    const stats = computeSessionStatsForEntry(events);

    await prisma.driverSessionStats.upsert({
      where: { entryId: entry.id },
      create: { entryId: entry.id, ...stats },
      update: stats,
    });
  }

  return entries;
}

/** Pull one entry's classification event, if it has one. */
async function getClassification(prisma, entryId) {
  const event = await prisma.event.findFirst({
    where: { entryId, eventType: "classification", ...LIVE },
  });
  if (!event) return null;
  return {
    finalPosition: event.payload.final_position ?? null,
    points: event.payload.points ?? 0,
    status: event.payload.status ?? null,
  };
}

/** Recompute driver_career_stats for one driver/season from every race session that season. */
export async function deriveDriverCareerStats(prisma, driverId, season) {
  const entries = await prisma.entry.findMany({
    where: {
      driverId,
      session: { type: "Race", meeting: { season } },
    },
  });

  const results = [];
  for (const entry of entries) {
    const classification = await getClassification(prisma, entry.id);
    if (classification) results.push(classification);
  }

  const agg = computeCareerAggregate(results);

  await prisma.driverCareerStats.upsert({
    where: { driverId_season: { driverId, season } },
    create: { driverId, season, ...agg },
    update: agg,
  });
}

/** Recompute team_season_stats for one team/season from every race session that season. */
export async function deriveTeamSeasonStats(prisma, teamId, season) {
  const entries = await prisma.entry.findMany({
    where: {
      teamId,
      session: { type: "Race", meeting: { season } },
    },
  });

  const results = [];
  for (const entry of entries) {
    const classification = await getClassification(prisma, entry.id);
    if (classification) results.push(classification);
  }

  const agg = computeSeasonAggregate(results);

  await prisma.teamSeasonStats.upsert({
    where: { teamId_season: { teamId, season } },
    create: { teamId, season, ...agg },
    update: agg,
  });
}

/**
 * Recompute head-to-head for one pair of drivers, from scratch, across every
 * race session both of them entered. subjectAId/subjectBId should already be
 * in canonical (sorted) order by the caller so a pair is never stored twice
 * in reversed form.
 */
export async function deriveHeadToHead(prisma, subjectAId, subjectBId) {
  const [entriesA, entriesB] = await Promise.all([
    prisma.entry.findMany({
      where: { driverId: subjectAId, session: { type: "Race" } },
    }),
    prisma.entry.findMany({
      where: { driverId: subjectBId, session: { type: "Race" } },
    }),
  ]);

  const sessionsA = new Map(entriesA.map((e) => [e.sessionId, e.id]));
  const sharedSessionIds = entriesB
    .map((e) => e.sessionId)
    .filter((sid) => sessionsA.has(sid));

  const resultsA = [];
  const resultsB = [];
  for (const sessionId of sharedSessionIds) {
    const entryIdA = sessionsA.get(sessionId);
    const entryIdB = entriesB.find((e) => e.sessionId === sessionId).id;
    const [a, b] = await Promise.all([
      getClassification(prisma, entryIdA),
      getClassification(prisma, entryIdB),
    ]);
    resultsA.push(a ?? { finalPosition: null });
    resultsB.push(b ?? { finalPosition: null });
  }

  const { winsA, winsB, sampleSize } = computeHeadToHead(resultsA, resultsB);

  await prisma.headToHead.upsert({
    where: {
      subjectAId_subjectBId_subjectType: {
        subjectAId,
        subjectBId,
        subjectType: "driver",
      },
    },
    create: {
      subjectAId,
      subjectBId,
      subjectType: "driver",
      winsA,
      winsB,
      sampleSize,
    },
    update: { winsA, winsB, sampleSize },
  });
}
