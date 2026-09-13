import { Router } from 'express';
import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { runDerivationForSession } from '../derivation/index.js';
import {
  mapLap,
  mapPitStop,
  mapTyreStint,
  mapPositionChanges,
  mapRaceControlRecord,
  mapWeather,
  mapGridPosition,
  mapClassification,
} from '../validation/event-records.js';

const { SubmissionSource, SubmissionStatus } = pkg;

export const submissionsRouter = Router();

/**
 * Builds an entryId lookup for an already-synced session, keyed by OpenF1
 * driver_number — mirrors what openf1-sync.js's syncDimensions() builds.
 * Manual uploads deliberately never create dimension data themselves: the
 * session, meeting, and driver/team entries must already exist (e.g. from
 * a prior OpenF1 sync). See project notes for this scope decision.
 */
async function buildEntryLookup(sessionId) {
  const entries = await prisma.entry.findMany({
    where: { sessionId },
    include: { driver: true },
  });
  const map = new Map();
  for (const e of entries) {
    map.set(e.driver.driverNumber, e.id);
  }
  return map;
}

/**
 * POST /api/submissions
 * Body: { session_key: <OpenF1 session_key>, laps, pit, stints, position,
 *         race_control, weather, starting_grid, session_result }
 * All arrays optional, OpenF1-shaped — the same raw record shapes
 * openf1-sync.js fetches live, so every validation rule (mapLap,
 * mapPitStop, etc. in ../validation/event-records.js) is shared with the
 * automated sync job rather than duplicated.
 *
 * Events are written immediately, tagged to this submission. If literally
 * nothing in the upload validates, that's a malformed file, not a judgment
 * call — auto-reject immediately (per the brief: "a rejection should tell
 * the submitter what was wrong"). Otherwise the submission is staged
 * pending: events exist in the log but are excluded from derived stats
 * until an admin approves (see the LIVE filter in derivation/db.js).
 */
submissionsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { session_key: sessionKey } = req.body;
    if (!sessionKey) {
      return res.status(400).json({ error: 'session_key is required' });
    }

    const session = await prisma.session.findUnique({
      where: { openf1Key: Number(sessionKey) },
    });
    if (!session) {
      return res.status(404).json({
        error: `No session found for session_key=${sessionKey}. Manual uploads can only add data to a session whose dimension data (circuit/meeting/session/entries) has already been synced.`,
      });
    }

    const entryByDriverNumber = await buildEntryLookup(session.id);
    const entryFor = (driverNumber) => entryByDriverNumber.get(driverNumber) ?? null;

    const events = [];
    const rejections = [];
    const reject = (eventType, record, reason) => {
      rejections.push({ eventType, reason, record });
    };

    for (const l of req.body.laps ?? []) {
      const event = mapLap(l, entryFor, reject);
      if (event) events.push(event);
    }
    for (const p of req.body.pit ?? []) {
      const event = mapPitStop(p, entryFor, reject);
      if (event) events.push(event);
    }
    for (const s of req.body.stints ?? []) {
      const event = mapTyreStint(s, entryFor, reject);
      if (event) events.push(event);
    }
    events.push(...mapPositionChanges(req.body.position ?? [], entryFor, reject));
    for (const rc of req.body.race_control ?? []) {
      const event = mapRaceControlRecord(rc, reject);
      if (event) events.push(event);
    }
    for (const w of req.body.weather ?? []) {
      events.push(mapWeather(w));
    }
    for (const g of req.body.starting_grid ?? []) {
      const event = mapGridPosition(g, entryFor, reject);
      if (event) events.push(event);
    }
    for (const r of req.body.session_result ?? []) {
      const event = mapClassification(r, entryFor, reject);
      if (event) events.push(event);
    }

    const status = events.length === 0 ? SubmissionStatus.rejected : SubmissionStatus.pending;

    const submission = await prisma.$transaction(
      async (tx) => {
        const created = await tx.submission.create({
          data: {
            source: SubmissionSource.manual_upload,
            submitterId: req.user.uid,
            sessionId: session.id,
            status,
            validationErrors: rejections.length > 0 ? rejections : undefined,
          },
        });

        if (events.length > 0) {
          await tx.event.createMany({
            data: events.map((e) => ({
              sessionId: session.id,
              entryId: e.entryId,
              eventType: e.eventType,
              lapNumber: e.lapNumber,
              occurredAt: e.occurredAt,
              payload: e.payload,
              sourceSubmissionId: created.id,
            })),
          });
        }

        return created;
      },
      { maxWait: 15000, timeout: 30000 }
    );

    res.status(status === SubmissionStatus.rejected ? 422 : 201).json({
      submissionId: submission.id,
      status: submission.status,
      eventsWritten: events.length,
      rejections,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions?status=pending
 * Review queue. Shape matches overview.js's existing submissionQueue
 * fields, plus review-relevant extras (submitterId, validationErrors).
 */
submissionsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const submissions = await prisma.submission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        source: true,
        status: true,
        submittedAt: true,
        sessionId: true,
        submitterId: true,
        reviewedBy: true,
        reviewedAt: true,
        validationErrors: true,
      },
    });
    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/submissions/:id
 * Body: { status: 'accepted' | 'rejected' }
 * Admin review action. No role check yet — any authenticated user can
 * approve/reject (no Submitter/Role model exists in the schema yet; see
 * project notes). Approving triggers derivation so the now-live events
 * actually count toward stats.
 */
submissionsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (![SubmissionStatus.accepted, SubmissionStatus.rejected].includes(status)) {
      return res.status(400).json({ error: "status must be 'accepted' or 'rejected'" });
    }

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.status !== SubmissionStatus.pending) {
      return res.status(409).json({ error: `Submission is already '${submission.status}', not pending` });
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { status, reviewedBy: req.user.uid, reviewedAt: new Date() },
    });

    if (status === SubmissionStatus.accepted) {
      await runDerivationForSession(prisma, submission.sessionId);
    }

    res.json({ submissionId: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});
