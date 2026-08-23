import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const fixturesRouter = Router();

// List every fixture (session), newest first, flagging any that have had an
// event corrected — "corrected" isn't a stored SessionStatus, it's derived
// by checking whether any event for that session has been superseded.
fixturesRouter.get('/', async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      include: { meeting: { include: { circuit: true } } },
    });

    const correctedGroups = await prisma.event.groupBy({
      by: ['sessionId'],
      where: { supersededById: { not: null } },
      _count: { _all: true },
    });
    const correctedSessionIds = new Set(correctedGroups.map((g) => g.sessionId));

    const fixtures = sessions.map((s) => ({
      id: s.id,
      meetingName: s.meeting.name,
      circuitName: s.meeting.circuit.name,
      country: s.meeting.circuit.country,
      season: s.meeting.season,
      type: s.type,
      startTime: s.startTime,
      status: s.status,
      hasCorrections: correctedSessionIds.has(s.id),
    }));

    res.json({ fixtures });
  } catch (err) {
    next(err);
  }
});

// Full event log for one fixture, chronological — this is the raw record
// everything else on the site is derived from, so nothing here is
// aggregated or filtered beyond a sane page size.
fixturesRouter.get('/:sessionId/events', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { meeting: { include: { circuit: true } } },
    });
    if (!session) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const events = await prisma.event.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
      include: { entry: { include: { driver: true } } },
      take: 200, // guard against an unbounded event log on one request
    });

    const derivedStatsCount = await prisma.driverSessionStats.count({
      where: { entry: { sessionId } },
    });

    res.json({
      session: {
        id: session.id,
        meetingName: session.meeting.name,
        circuitName: session.meeting.circuit.name,
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
        corrected: e.supersededById !== null,
      })),
    });
  } catch (err) {
    next(err);
  }
});