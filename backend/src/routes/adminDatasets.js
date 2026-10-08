import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, requireVerifiedEmail } from '../middleware/requireAuth.js';

/**
 * Admin view of dataset submissions (/api/admin/datasets).
 *
 * Only datasets uploaded by developers (source manual_upload) are managed
 * here; the automated OpenF1 sync batches are not datasets anyone submitted.
 * Reviewing (accept/reject) stays on PATCH /api/submissions/:id.
 */
export const adminDatasetsRouter = Router();

adminDatasetsRouter.use(requireAuth, requireVerifiedEmail, requireAdmin);

const LIST_LIMIT = 200;
const MANUAL = { source: 'manual_upload' };

// Each admin tab is one of these views. Race data moves through
// pending -> accepted/rejected; test data has a tab of its own; anything
// deleted, of either purpose, is under "deleted".
const VIEWS = {
  pending: { ...MANUAL, purpose: 'race_data', deletedAt: null, status: 'pending' },
  accepted: { ...MANUAL, purpose: 'race_data', deletedAt: null, status: { in: ['accepted', 'partially_accepted'] } },
  rejected: { ...MANUAL, purpose: 'race_data', deletedAt: null, status: 'rejected' },
  test: { ...MANUAL, purpose: 'code_test', deletedAt: null },
  deleted: { ...MANUAL, deletedAt: { not: null } },
};
const VIEW_NAMES = Object.keys(VIEWS);

const SESSION_SELECT = {
  id: true,
  openf1Key: true,
  type: true,
  startTime: true,
  meeting: { select: { name: true, season: true } },
};

const ROW_SELECT = {
  id: true,
  purpose: true,
  status: true,
  submitterId: true,
  submittedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  deletedAt: true,
  deletedBy: true,
  summary: true,
  session: { select: SESSION_SELECT },
  upload: { select: { sizeBytes: true } },
  _count: { select: { events: true } },
};

function sessionLabel(session) {
  if (!session) return null;
  return {
    id: session.id,
    sessionKey: session.openf1Key,
    type: session.type,
    startTime: session.startTime,
    meetingName: session.meeting?.name ?? null,
    season: session.meeting?.season ?? null,
  };
}

export function toListRow(row) {
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    submitterId: row.submitterId,
    submittedAt: row.submittedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    session: sessionLabel(row.session),
    // Older submissions have no summary; their counts are unknown, not zero.
    validRecords: row.summary?.validRecords ?? null,
    rejectedRecords: row.summary?.rejectedRecords ?? null,
    eventCount: row._count.events,
    hasOriginalUpload: Boolean(row.upload),
    uploadSizeBytes: row.upload?.sizeBytes ?? null,
  };
}

adminDatasetsRouter.get('/', async (req, res, next) => {
  try {
    const view = req.query.view ?? 'pending';
    if (!VIEW_NAMES.includes(view)) {
      return res.status(400).json({ error: `view must be one of: ${VIEW_NAMES.join(', ')}` });
    }

    const [rows, ...countList] = await Promise.all([
      prisma.submission.findMany({
        where: VIEWS[view],
        orderBy: { submittedAt: 'desc' },
        take: LIST_LIMIT,
        select: ROW_SELECT,
      }),
      ...VIEW_NAMES.map((name) => prisma.submission.count({ where: VIEWS[name] })),
    ]);

    const counts = Object.fromEntries(VIEW_NAMES.map((name, i) => [name, countList[i]]));
    res.json({ view, datasets: rows.map(toListRow), counts });
  } catch (err) {
    next(err);
  }
});

adminDatasetsRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await prisma.submission.findFirst({
      where: { id: req.params.id, ...MANUAL },
      select: {
        ...ROW_SELECT,
        validationErrors: true,
        upload: { select: { sizeBytes: true, sha256: true, contentType: true, createdAt: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Dataset not found' });

    res.json({
      ...toListRow(row),
      rejections: Array.isArray(row.validationErrors) ? row.validationErrors : [],
      upload: row.upload
        ? { kind: 'original', ...row.upload }
        : { kind: 'rebuilt', note: 'Uploaded before originals were kept; the download is rebuilt from what was stored.' },
    });
  } catch (err) {
    next(err);
  }
});
