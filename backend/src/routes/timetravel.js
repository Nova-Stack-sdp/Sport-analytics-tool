import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { computeSessionStatsForEntry } from '../derivation/pure.js';

export const timeTravelRouter = Router();

function sessionLabel(session) {
  return `${session.meeting.name} ${session.meeting.season} · ${session.type}`;
}

/**
 * Context for one fixture: its real "checkpoints" (one per submission that
 * ever touched it, in ingestion order — this is real audit history, not a
 * simulated dataset-release timeline) and its entries, for the driver
 * selector.
 */
timeTravelRouter.get('/context', async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { startTime: 'desc' },
      include: { meeting: true },
      take: 20,
    });
    const availableSessions = sessions.map((s) => ({ id: s.id, label: sessionLabel(s) }));

    const sessionId = req.query.sessionId || sessions[0]?.id || null;
    if (!sessionId) {
      return res.json({ availableSessions, session: null, checkpoints: [], entries: [] });
    }

    const session =
      sessions.find((s) => s.id === sessionId) ??
      (await prisma.session.findUnique({ where: { id: sessionId }, include: { meeting: true } }));
    if (!session) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const submissions = await prisma.submission.findMany({
      where: { sessionId },
      orderBy: { submittedAt: 'asc' },
      select: { id: true, submittedAt: true, status: true, source: true },
    });
    const checkpoints = submissions.map((s) => ({
      date: s.submittedAt,
      label: `${s.source === 'openf1_sync' ? 'Sync' : 'Upload'} · ${s.status}`,
      submissionId: s.id,
    }));

    const entries = await prisma.entry.findMany({
      where: { sessionId },
      include: { driver: true },
    });
    const entryOptions = entries.map((e) => ({
      entryId: e.id,
      driverId: e.driverId,
      name: e.driver.name,
    }));

    res.json({
      availableSessions,
      session: { id: session.id, label: sessionLabel(session) },
      checkpoints,
      entries: entryOptions,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Real audit trail for one entry's classification (points/final position):
 * every classification event ever written for it, in ingestion order.
 * Corrections show up as later rows, never edits to earlier ones — matches
 * "nothing is overwritten" from the event log's design.
 */
timeTravelRouter.get('/changelog', async (req, res, next) => {
  try {
    const { entryId } = req.query;
    if (!entryId) return res.status(400).json({ error: 'entryId is required' });

    const entry = await prisma.entry.findUnique({
      where: { id: entryId },
      include: { driver: true, team: true },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const events = await prisma.event.findMany({
      where: { entryId, eventType: 'classification' },
      orderBy: { ingestedAt: 'asc' },
    });

    res.json({
      driverName: entry.driver.name,
      teamName: entry.team.name,
      history: events.map((e, i) => ({
        eventId: e.id,
        occurredAt: e.occurredAt,
        ingestedAt: e.ingestedAt,
        payload: e.payload,
        isOriginal: i === 0,
        wasCorrectedLater: e.supersededById !== null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Reconstructs one entry's session stats as they would have appeared as of
 * a given date: only events from submissions submitted at or before the
 * cutoff, and only the version that was live at that time (not yet
 * corrected by a submission before the cutoff). Reuses the same pure
 * computeSessionStatsForEntry the live derivation pipeline uses — same
 * math, different event set.
 *
 * Deliberately compares submittedAt to submittedAt (via each event's
 * sourceSubmission), not event.ingestedAt to submission.submittedAt —
 * those are two different timestamp columns that can round to different
 * milliseconds once serialized, which put an event right on its own
 * checkpoint's boundary and wrongly excluded it.
 */
timeTravelRouter.get('/asof', async (req, res, next) => {
  try {
    const { sessionId, entryId, date } = req.query;
    if (!sessionId || !entryId || !date) {
      return res.status(400).json({ error: 'sessionId, entryId, and date are required' });
    }
    const cutoff = new Date(date);
    if (Number.isNaN(cutoff.getTime())) {
      return res.status(400).json({ error: 'date is not a valid date' });
    }

    const events = await prisma.event.findMany({
      where: { sessionId, entryId },
      include: {
        sourceSubmission: { select: { submittedAt: true } },
        supersededBy: { include: { sourceSubmission: { select: { submittedAt: true } } } },
      },
    });

    const asOfEvents = events.filter((e) => {
      if (new Date(e.sourceSubmission.submittedAt) > cutoff) return false;
      if (e.supersededBy && new Date(e.supersededBy.sourceSubmission.submittedAt) <= cutoff) return false;
      return true;
    });

    const stats = computeSessionStatsForEntry(asOfEvents);
    res.json({ sessionId, entryId, date, stats, eventsConsidered: asOfEvents.length });
  } catch (err) {
    next(err);
  }
});