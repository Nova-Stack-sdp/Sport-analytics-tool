import { Router } from 'express';
import pkg from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, requireVerifiedEmail } from '../middleware/requireAuth.js';
import { runDerivationForSession } from '../derivation/index.js';
import { buildUploadRecord } from '../lib/datasetUpload.js';
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

const { SubmissionSource, SubmissionStatus, SubmissionPurpose } = pkg;
const PURPOSES = Object.values(SubmissionPurpose);

export const submissionsRouter = Router();

function requireDeveloperOrAdmin(req, res, next) {
  if (!req.user.developer && !req.user.admin) {
    return res.status(403).json({ error: 'Developer or admin access required to submit data' });
  }
  next();
}

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
submissionsRouter.post('/', requireAuth, requireVerifiedEmail, requireDeveloperOrAdmin, async (req, res, next) => {
  try {
    const { session_key: sessionKey } = req.body;
    if (!sessionKey) {
      return res.status(400).json({ error: 'session_key is required' });
    }
    // race_data (default): events go into the event log, pending review.
    // code_test: sample data for testing a developer's code. Validated the
    // same way and stored as uploaded, but never written to the event log,
    // so it can never reach statistics, the public API or replays.
    const purpose = req.body.purpose ?? SubmissionPurpose.race_data;
    if (!PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: `purpose must be one of: ${PURPOSES.join(', ')}` });
    }
    const isTestData = purpose === SubmissionPurpose.code_test;

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
    const upload = buildUploadRecord(req);
    const eventsToWrite = isTestData ? [] : events;

    const submission = await prisma.$transaction(
      async (tx) => {
        const created = await tx.submission.create({
          data: {
            source: SubmissionSource.manual_upload,
            submitterId: req.user.uid,
            sessionId: session.id,
            status,
            purpose,
            validationErrors: rejections.length > 0 ? rejections : undefined,
            summary: {
              validRecords: events.length,
              rejectedRecords: rejections.length,
              eventsWritten: eventsToWrite.length,
            },
          },
        });

        // The original upload is kept even when nothing in it validated, so
        // an admin can see exactly what was sent.
        await tx.submissionUpload.create({ data: { submissionId: created.id, ...upload } });

        if (eventsToWrite.length > 0) {
          await tx.event.createMany({
            data: eventsToWrite.map((e) => ({
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
      purpose,
      validRecords: events.length,
      eventsWritten: eventsToWrite.length,
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
submissionsRouter.get('/', requireAuth, requireVerifiedEmail, async (req, res, next) => {
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
        purpose: true,
        deletedAt: true,
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
 * Admin review action (requireAdmin). Approving triggers derivation so the
 * now-live events actually count toward stats. Test data (purpose
 * code_test) and deleted datasets cannot be reviewed here.
 */
submissionsRouter.patch('/:id', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (![SubmissionStatus.accepted, SubmissionStatus.rejected].includes(status)) {
      return res.status(400).json({ error: "status must be 'accepted' or 'rejected'" });
    }

    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    if (submission.deletedAt) {
      return res.status(409).json({ error: 'Submission has been deleted; restore it before reviewing' });
    }
    if (submission.purpose === SubmissionPurpose.code_test) {
      return res.status(409).json({
        error: 'Test data is not reviewed on its own; it is reviewed together with the code it belongs to',
      });
    }
    if (submission.status !== SubmissionStatus.pending) {
      return res.status(409).json({ error: `Submission is already '${submission.status}', not pending` });
    }

    // Conditional update: if the submission was reviewed or deleted after the
    // read above, nothing changes and the admin gets a conflict.
    const { count } = await prisma.submission.updateMany({
      where: { id: submission.id, status: SubmissionStatus.pending, deletedAt: null },
      data: { status, reviewedBy: req.user.uid, reviewedAt: new Date() },
    });
    if (count === 0) {
      return res.status(409).json({ error: 'Submission changed while it was being reviewed; reload and try again' });
    }

    if (status === SubmissionStatus.accepted) {
      await runDerivationForSession(prisma, submission.sessionId);
    }

    res.json({ submissionId: submission.id, status });
  } catch (err) {
    next(err);
  }
});
