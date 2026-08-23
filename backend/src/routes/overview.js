import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const overviewRouter = Router();

// Same "live" filter convention used in src/derivation/db.js: an event with
// supersededBy set has been corrected, so downstream reads should skip it.
const LIVE = { supersededBy: null };

overviewRouter.get('/', async (req, res, next) => {
  try {
    const [fixturesTracked, sessionsFinished, pendingSubmissions, eventsLast24h] =
      await Promise.all([
        prisma.session.count(),
        prisma.session.count({ where: { status: 'finished' } }),
        prisma.submission.count({ where: { status: 'pending' } }),
        prisma.event.count({
          where: { occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
      ]);

    // "Current season" = the most recent season we have a meeting for.
    // Leaderboard/team comparison are scoped to it so Overview doesn't mix
    // stats across seasons.
    const latestMeeting = await prisma.meeting.findFirst({ orderBy: { season: 'desc' } });
    const currentSeason = latestMeeting?.season ?? null;

    let leaderboard = [];
    let teamComparison = [];

    if (currentSeason !== null) {
      const careerRows = await prisma.driverCareerStats.findMany({
        where: { season: currentSeason },
        orderBy: { points: 'desc' },
        take: 5,
        include: { driver: true },
      });
      leaderboard = careerRows.map((r) => ({
        driverId: r.driverId,
        name: r.driver.name,
        driverNumber: r.driver.driverNumber,
        points: r.points,
        wins: r.wins,
        podiums: r.podiums,
      }));

      const teamRows = await prisma.teamSeasonStats.findMany({
        where: { season: currentSeason },
        orderBy: { points: 'desc' },
        take: 2,
        include: { team: true },
      });
      teamComparison = teamRows.map((r) => ({
        teamId: r.teamId,
        name: r.team.name,
        points: r.points,
        wins: r.wins,
        reliabilityRate: r.reliabilityRate,
      }));
    }

    const latestSession = await prisma.session.findFirst({
      orderBy: { startTime: 'desc' },
      include: { meeting: { include: { circuit: true } } },
    });

    let recentEvents = [];
    if (latestSession) {
      recentEvents = await prisma.event.findMany({
        where: { sessionId: latestSession.id, ...LIVE },
        orderBy: { occurredAt: 'desc' },
        take: 5,
        select: { id: true, eventType: true, lapNumber: true, occurredAt: true },
      });
    }

    const submissionQueue = await prisma.submission.findMany({
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, source: true, status: true, submittedAt: true, sessionId: true },
    });

    res.json({
      stats: { fixturesTracked, sessionsFinished, pendingSubmissions, eventsLast24h },
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
      recentEvents,
      leaderboard,
      teamComparison,
      submissionQueue,
    });
  } catch (err) {
    next(err);
  }
});