import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireAuth } from '../middleware/requireAuth.js';
import { parseYouTubeId } from '../lib/youtube.js';

/**
 * Video requests — a race video a user wants added to Telemetry TV when it
 * isn't in the race list yet.
 *
 *   POST  /api/video-requests            (signed in) send a request: the race
 *         { raceName, videoUrl?, hostedDescription?, notes? }
 *         and either a YouTube link / embed code or a description of where
 *         the video is hosted on YouTube.
 *   GET   /api/video-requests/mine       (signed in) the caller's requests
 *   GET   /api/video-requests?status=    (admin) the review queue
 *   PATCH /api/video-requests/:id        (admin) { status, reviewNote? }
 *
 * The site is strict about copyright: nothing a user sends goes live by
 * itself. Every request is stored PENDING and a developer checks the video
 * isn't copyright-blocked before it is added; approving or rejecting it
 * notifies the requester (a system_alert in their notifications), which is
 * why a request needs a signed-in user.
 *
 * Not behind the response cache: these are per-user and change on review.
 */

const LIMITS = { raceName: 160, videoUrl: 2000, hostedDescription: 1000, notes: 1000, reviewNote: 500 };
// Enough to stop a flood, never enough to get in a real fan's way.
const MAX_PENDING_PER_USER = 5;
const MIN_DESCRIPTION = 10;

const clean = (value, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
};

export const videoRequestsRouter = Router();

videoRequestsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const raceName = clean(req.body?.raceName, LIMITS.raceName);
    const videoUrl = clean(req.body?.videoUrl, LIMITS.videoUrl);
    const hostedDescription = clean(req.body?.hostedDescription, LIMITS.hostedDescription);
    const notes = clean(req.body?.notes, LIMITS.notes);

    if (!raceName) return res.status(400).json({ error: 'Tell us which race the video is of.' });
    const youtubeId = videoUrl ? parseYouTubeId(videoUrl) : null;
    if (videoUrl && !youtubeId) {
      return res.status(400).json({ error: 'That link is not a YouTube video we can read.' });
    }
    if (!youtubeId && (!hostedDescription || hostedDescription.length < MIN_DESCRIPTION)) {
      return res.status(400).json({
        error: 'Add a YouTube link, or describe where the video is hosted on YouTube.',
      });
    }

    const pending = await prisma.videoRequest.count({
      where: { userId: req.user.uid, status: 'pending' },
    });
    if (pending >= MAX_PENDING_PER_USER) {
      return res.status(429).json({
        error: `You already have ${pending} videos waiting for review. We'll notify you as each one is checked.`,
      });
    }

    const request = await prisma.videoRequest.create({
      data: {
        userId: req.user.uid,
        userEmail: req.user.email ?? null,
        raceName,
        videoUrl: youtubeId ? videoUrl : null,
        youtubeId,
        hostedDescription,
        notes,
      },
    });
    return res.status(201).json({ request });
  } catch (err) {
    return next(err);
  }
});

videoRequestsRouter.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const requests = await prisma.videoRequest.findMany({
      where: { userId: req.user.uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

videoRequestsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status
      : undefined;
    const requests = await prisma.videoRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
      take: 200,
    });
    return res.json({ requests });
  } catch (err) {
    return next(err);
  }
});

videoRequestsRouter.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }
    const reviewNote = clean(req.body?.reviewNote, LIMITS.reviewNote);
    if (status === 'rejected' && !reviewNote) {
      return res.status(400).json({ error: 'Say why the video was not added — the requester is told.' });
    }

    const existing = await prisma.videoRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'No such request' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: `This request was already ${existing.status}.` });
    }

    const [request] = await prisma.$transaction([
      prisma.videoRequest.update({
        where: { id: existing.id },
        data: { status, reviewNote, reviewedBy: req.user.uid, reviewedAt: new Date() },
      }),
      prisma.notification.create({
        data: {
          userId: existing.userId,
          type: 'system_alert',
          title: status === 'approved' ? 'Your race video is live' : 'We could not add your race video',
          message:
            status === 'approved'
              ? `The video you sent for ${existing.raceName} passed our copyright check and is now on Telemetry TV.`
              : `The video you sent for ${existing.raceName} was not added: ${reviewNote}`,
          linkUrl: '/telemetry-tv',
        },
      }),
    ]);
    return res.json({ request });
  } catch (err) {
    return next(err);
  }
});
