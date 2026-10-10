import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { FROM_PUBLISHED_DATASET, PUBLISHED_SUBMISSION } from '../lib/eventVisibility.js';

export const overviewRouter = Router();

// The Overview page is public, so it reads only published data: OpenF1
// syncs and developer uploads an admin accepted (the same rule the
// statistics use). An event with supersededBy set has been corrected, so
// only the newest version of each is read.
const LIVE = { supersededBy: null, ...FROM_PUBLISHED_DATASET };

// Race data that has been published. Test data for developers' code never
// reaches the event log, so it is not a data update.
const PUBLISHED_RACE_DATA = { ...PUBLISHED_SUBMISSION, purpose: 'race_data' };

const UPDATE_SELECT = {
  id: true,
  source: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  summary: true,
  session: { select: { id: true, type: true, meeting: { select: { name: true } } } },
};

// When a dataset became public: an accepted upload when the admin accepted
// it, an OpenF1 sync (accepted automatically) when it ran.
const publishedAt = (s) => s.reviewedAt ?? s.submittedAt;

function toUpdate(s) {
  const summary = s.summary && typeof s.summary === 'object' ? s.summary : {};
  return {
    id: s.id,
    source: s.source,
    status: s.status,
    publishedAt: publishedAt(s),
    session: s.session
      ? { id: s.session.id, type: s.session.type, meetingName: s.session.meeting?.name ?? null }
      : null,
    eventsAdded: Number.isFinite(summary.inserted) ? summary.inserted : null,
    eventsCorrected: Number.isFinite(summary.corrected) ? summary.corrected : null,
  };
}

// Five most recent publications. Syncs are published when submitted and
// uploads when reviewed, so take the newest of each ordering and merge.
function latestUpdates(bySubmitted, byReviewed) {
  const seen = new Map();
  for (const s of [...bySubmitted, ...byReviewed]) seen.set(s.id, s);
  return [...seen.values()]
    .sort((a, b) => new Date(publishedAt(b)) - new Date(publishedAt(a)))
    .slice(0, 5)
    .map(toUpdate);
}

overviewRouter.get('/', async (req, res, next) => {
  try {
    // Two rounds of queries instead of one after another: everything that
    // doesn't depend on another result is sent together. On a hosted
    // database each round is a network round trip, so this is most of the
    // page's response time (see docs/PERFORMANCE.md).
    const [
      fixturesTracked,
      seasons,
      pendingSubmissions,
      latestMeeting,
      latestSession,
      updatesBySubmitted,
      updatesByReviewed,
    ] = await Promise.all([
      prisma.session.count(),
      prisma.meeting.findMany({ distinct: ['season'], select: { season: true } }),
      // Race data waiting for an admin. Test data is never reviewed on its
      // own, and deleted datasets are out of the queue.
      prisma.submission.count({ where: { status: 'pending', purpose: 'race_data', deletedAt: null } }),
      // "Current season" = the most recent season we have a meeting for.
      // Leaderboard/team comparison are scoped to it so Overview doesn't mix
      // stats across seasons.
      prisma.meeting.findFirst({ orderBy: { season: 'desc' } }),
      prisma.session.findFirst({
        orderBy: { startTime: 'desc' },
        include: { meeting: { include: { circuit: true } } },
      }),
      prisma.submission.findMany({
        where: PUBLISHED_RACE_DATA,
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: UPDATE_SELECT,
      }),
      prisma.submission.findMany({
        where: { ...PUBLISHED_RACE_DATA, reviewedAt: { not: null } },
        orderBy: { reviewedAt: 'desc' },
        take: 5,
        select: UPDATE_SELECT,
      }),
    ]);
    const currentSeason = latestMeeting?.season ?? null;
    const recentUpdates = latestUpdates(updatesBySubmitted, updatesByReviewed);

    const [careerRows, teamRows, recentEvents] = await Promise.all([
      currentSeason !== null
        ? prisma.driverCareerStats.findMany({
          where: { season: currentSeason },
          // Championship order: points, then wins, then podiums.
          orderBy: [{ points: 'desc' }, { wins: 'desc' }, { podiums: 'desc' }],
          take: 5,
          include: { driver: true },
        })
        : [],
      currentSeason !== null
        ? prisma.teamSeasonStats.findMany({
          where: { season: currentSeason },
          orderBy: [{ points: 'desc' }, { wins: 'desc' }],
          take: 2,
          include: { team: true },
        })
        : [],
      latestSession
        ? prisma.event.findMany({
          where: { sessionId: latestSession.id, ...LIVE },
          orderBy: { occurredAt: 'desc' },
          take: 5,
          select: {
            id: true,
            eventType: true,
            lapNumber: true,
            occurredAt: true,
            entry: { select: { driver: { select: { name: true } } } },
          },
        })
        : [],
    ]);

    const leaderboard = careerRows.map((r) => ({
      driverId: r.driverId,
      name: r.driver.name,
      driverNumber: r.driver.driverNumber,
      points: r.points,
      wins: r.wins,
      podiums: r.podiums,
    }));
    const teamComparison = teamRows.map((r) => ({
      teamId: r.teamId,
      name: r.team.name,
      points: r.points,
      wins: r.wins,
      reliabilityRate: r.reliabilityRate,
    }));

    res.json({
      stats: {
        fixturesTracked,
        seasonsCovered: seasons.length,
        pendingSubmissions,
        lastDataUpdate: recentUpdates[0]?.publishedAt ?? null,
      },
      season: currentSeason,
      latestSession: latestSession
        ? {
            id: latestSession.id,
            type: latestSession.type,
            status: latestSession.status,
            startTime: latestSession.startTime,
            meetingName: latestSession.meeting.name,
            circuitName: latestSession.meeting.circuit.name,
            country: latestSession.meeting.circuit.country,
          }
        : null,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        lapNumber: e.lapNumber,
        occurredAt: e.occurredAt,
        driverName: e.entry?.driver?.name ?? null,
      })),
      leaderboard,
      teamComparison,
      recentUpdates,
    });
  } catch (err) {
    next(err);
  }
});
