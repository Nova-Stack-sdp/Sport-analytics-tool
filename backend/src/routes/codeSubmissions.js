import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { notifyCodeSubmissionReviewed } from '../services/notificationService.js';
import { requireAuth, requireAdmin, requireVerifiedEmail } from '../middleware/requireAuth.js';

export const codeSubmissionsRouter = Router();

const STATUSES = ['pending', 'approved', 'rejected'];
const REVIEW_STATUSES = ['approved', 'rejected'];

const ALLOWED_LANGUAGES = ['JavaScript', 'Python'];
const LIMITS = {
  titleMin: 3,
  titleMax: 80,
  codeMax: 50000,
  // The description is what the public API and the stats page show as
  // "what this code does", so it is required and must say something.
  descriptionMin: 10,
  descriptionMax: 1000,
  maxTags: 5,
  tagMax: 24,
};

const LIST_LIMIT = 200;

function requireDeveloperOrAdmin(req, res, next) {
  if (!req.user.developer && !req.user.admin) {
    return res.status(403).json({ error: 'Developer or admin access required to submit code' });
  }
  next();
}

function parseTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item ?? '').trim().replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function validateBody(body = {}) {
  const errors = [];
  const title = String(body.title ?? '').trim();
  const language = String(body.language ?? '').trim();
  const code = String(body.code ?? '');
  const description = String(body.description ?? '').trim();
  const tags = parseTags(body.tags);

  if (!title) errors.push('Title is required.');
  else if (title.length < LIMITS.titleMin) errors.push(`Title must be at least ${LIMITS.titleMin} characters.`);
  else if (title.length > LIMITS.titleMax) errors.push(`Title must be at most ${LIMITS.titleMax} characters.`);

  if (!language) errors.push('Language is required.');
  else if (!ALLOWED_LANGUAGES.includes(language)) {
    errors.push(`Language must be one of: ${ALLOWED_LANGUAGES.join(', ')}.`);
  }

  if (!code.trim()) errors.push('Code is required.');
  else if (code.length > LIMITS.codeMax) errors.push(`Code must be at most ${LIMITS.codeMax} characters.`);

  if (!description) errors.push('Description is required: say what the code does.');
  else if (description.length < LIMITS.descriptionMin) {
    errors.push(`Description must be at least ${LIMITS.descriptionMin} characters.`);
  } else if (description.length > LIMITS.descriptionMax) {
    errors.push(`Description must be at most ${LIMITS.descriptionMax} characters.`);
  }

  if (tags.length > LIMITS.maxTags) errors.push(`Use at most ${LIMITS.maxTags} tags.`);
  if (tags.some((tag) => tag.length > LIMITS.tagMax)) {
    errors.push(`Each tag must be at most ${LIMITS.tagMax} characters.`);
  }

  return { errors, value: { title, language, code, description, tags } };
}

/**
 * Checks the optional test dataset a developer attaches to their code.
 * Returns null when it is usable, otherwise { status, error }.
 *
 * It must be the developer's own upload, uploaded as test data, not
 * deleted, with at least one valid record, and not already attached to
 * another script (one dataset tests one script).
 */
async function checkTestDataset(testDatasetId, uid) {
  if (typeof testDatasetId !== 'string' || !testDatasetId.trim()) {
    return { status: 400, error: 'testDatasetId must be the ID of one of your test-data uploads.' };
  }
  const dataset = await prisma.submission.findUnique({
    where: { id: testDatasetId },
    select: { id: true, submitterId: true, purpose: true, status: true, deletedAt: true },
  });
  if (!dataset || dataset.submitterId !== uid) {
    return { status: 400, error: 'That test dataset was not found among your uploads.' };
  }
  if (dataset.purpose !== 'code_test') {
    return { status: 400, error: 'That dataset was uploaded as race data. Upload it again as "Test data for my submitted code".' };
  }
  if (dataset.deletedAt) return { status: 400, error: 'That test dataset was deleted by an admin.' };
  if (dataset.status === 'rejected') {
    return { status: 400, error: 'None of the records in that test dataset were valid, so it cannot be used to test code.' };
  }
  const [pendingUses, publishedUses] = await Promise.all([
    prisma.codeSubmission.count({ where: { testDatasetId, status: 'pending' } }),
    prisma.verifiedCode.count({ where: { testDatasetId } }),
  ]);
  if (pendingUses + publishedUses > 0) {
    return { status: 409, error: 'That test dataset is already attached to another script.' };
  }
  return null;
}

codeSubmissionsRouter.post('/', requireAuth, requireVerifiedEmail, requireDeveloperOrAdmin, async (req, res, next) => {
  try {
    const { errors, value } = validateBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' '), errors });
    }

    const testDatasetId = req.body?.testDatasetId ?? null;
    if (testDatasetId !== null) {
      const problem = await checkTestDataset(testDatasetId, req.user.uid);
      if (problem) return res.status(problem.status).json({ error: problem.error });
    }

    const created = await prisma.codeSubmission.create({
      data: {
        ...value,
        testDatasetId,
        submitterId: req.user.uid,
        submitterEmail: req.user.email,
        status: 'pending',
      },
      select: { id: true, status: true, submittedAt: true, testDatasetId: true },
    });

    res.status(201).json({
      id: created.id,
      status: created.status,
      submittedAt: created.submittedAt,
      testDatasetId: created.testDatasetId,
    });
  } catch (err) {
    next(err);
  }
});

// Approved code lives in verified_code, not code_submission. These map a
// verified row onto the same shape the admin list/detail already use, with
// `id` set to the original submission ID so links and keys stay stable.
const LIST_SELECT = {
  id: true,
  title: true,
  language: true,
  status: true,
  submitterId: true,
  submitterEmail: true,
  submittedAt: true,
  reviewedBy: true,
  reviewedAt: true,
};

function verifiedAsListRow(v) {
  return {
    id: v.sourceSubmissionId,
    verifiedCodeId: v.id,
    title: v.title,
    language: v.language,
    status: 'approved',
    submitterId: v.submitterId,
    submitterEmail: v.submitterEmail,
    submittedAt: v.submittedAt,
    reviewedBy: v.verifiedBy,
    reviewedAt: v.verifiedAt,
  };
}

function findVerifiedForList(take) {
  return prisma.verifiedCode.findMany({
    orderBy: { submittedAt: 'desc' },
    take,
    select: {
      id: true,
      sourceSubmissionId: true,
      title: true,
      language: true,
      submitterId: true,
      submitterEmail: true,
      submittedAt: true,
      verifiedBy: true,
      verifiedAt: true,
    },
  });
}

codeSubmissionsRouter.get('/', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }

    // Pending and rejected rows come from code_submission; approved rows
    // come from verified_code. code_submission rows still marked 'approved'
    // (from before approval moved code) are never listed, so nothing shows
    // twice.
    const [unreviewed, verified, grouped, approvedCount] = await Promise.all([
      status === 'approved'
        ? []
        : prisma.codeSubmission.findMany({
          where: status ? { status } : { status: { in: ['pending', 'rejected'] } },
          orderBy: { submittedAt: 'desc' },
          take: LIST_LIMIT,
          select: LIST_SELECT,
        }),
      status === undefined || status === 'approved' ? findVerifiedForList(LIST_LIMIT) : [],
      prisma.codeSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.verifiedCode.count(),
    ]);

    const submissions = [...unreviewed, ...verified.map(verifiedAsListRow)]
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, LIST_LIMIT);

    const counts = { pending: 0, approved: approvedCount, rejected: 0 };
    for (const row of grouped) {
      if (row.status !== 'approved') counts[row.status] = row._count._all;
    }

    res.json({ submissions, counts });
  } catch (err) {
    next(err);
  }
});

function verifiedAsDetail(v) {
  return {
    ...verifiedAsListRow(v),
    code: v.code,
    description: v.description,
    tags: v.tags,
  };
}

// Looks in code_submission first (pending, rejected, and rows approved
// before approval moved code), then in verified_code by the original
// submission ID, since that is the ID the admin list hands out for
// approved rows.
codeSubmissionsRouter.get('/:id', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const submission = await prisma.codeSubmission.findUnique({ where: { id: req.params.id } });
    if (submission) return res.json(submission);

    const verified = await prisma.verifiedCode.findUnique({ where: { sourceSubmissionId: req.params.id } });
    if (verified) return res.json(verifiedAsDetail(verified));

    res.status(404).json({ error: 'Code submission not found' });
  } catch (err) {
    next(err);
  }
});

// Thrown inside the approval transaction to roll it back when the
// submission stopped being pending between the read and the delete.
class ReviewConflict extends Error {
  constructor(currentStatus) {
    super('review conflict');
    this.currentStatus = currentStatus;
  }
}

// Approving MOVES the code: the verified_code row is created and the
// code_submission row is deleted in one transaction, so the code is never
// stored twice and never lost. Rejecting only changes the status; rejected
// rows are deleted later by jobs/rejected-code-cleanup.js.
async function approveSubmission(id, adminUid) {
  try {
    return await prisma.$transaction(async (tx) => {
      const submission = await tx.codeSubmission.findUnique({ where: { id } });
      if (!submission) {
        const verified = await tx.verifiedCode.findUnique({
          where: { sourceSubmissionId: id },
          select: { id: true },
        });
        return verified
          ? { ok: false, currentStatus: 'approved' }
          : { ok: false, notFound: true };
      }
      if (submission.status !== 'pending') return { ok: false, currentStatus: submission.status };

      await tx.verifiedCode.create({
        data: {
          sourceSubmissionId: submission.id,
          title: submission.title,
          language: submission.language,
          code: submission.code,
          description: submission.description,
          tags: submission.tags,
          submitterId: submission.submitterId,
          submitterEmail: submission.submitterEmail,
          submittedAt: submission.submittedAt,
          verifiedBy: adminUid,
        },
      }).catch((err) => {
        // Only a duplicate verified row represents a concurrent approval.
        if (err?.code === 'P2002') throw new ReviewConflict('approved');
        throw err;
      });

      // Only delete if it is still pending. If a concurrent reject got there
      // first, nothing is deleted and throwing undoes the insert above.
      const { count } = await tx.codeSubmission.deleteMany({ where: { id, status: 'pending' } });
      if (count !== 1) {
        const current = await tx.codeSubmission.findUnique({ where: { id }, select: { status: true } });
        throw new ReviewConflict(current?.status ?? 'approved');
      }
      await notifyCodeSubmissionReviewed(submission, 'approved', tx);
      return { ok: true };
    }, { maxWait: 15000, timeout: 30000 });
  } catch (err) {
    if (err instanceof ReviewConflict) return { ok: false, currentStatus: err.currentStatus };
    throw err;
  }
}

async function rejectSubmission(id, adminUid) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.codeSubmission.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'rejected', reviewedBy: adminUid, reviewedAt: new Date() },
    });
    if (count === 1) {
      const submission = await tx.codeSubmission.findUnique({ where: { id } });
      await notifyCodeSubmissionReviewed(submission, 'rejected', tx);
      return { ok: true };
    }

    const existing = await tx.codeSubmission.findUnique({ where: { id }, select: { status: true } });
    if (existing) return { ok: false, currentStatus: existing.status };
    const verified = await tx.verifiedCode.findUnique({ where: { sourceSubmissionId: id }, select: { id: true } });
    return verified ? { ok: false, currentStatus: 'approved' } : { ok: false, notFound: true };
  }, { maxWait: 15000, timeout: 30000 });
}

codeSubmissionsRouter.patch('/:id', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body ?? {};
    if (!REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const result = status === 'approved'
      ? await approveSubmission(req.params.id, req.user.uid)
      : await rejectSubmission(req.params.id, req.user.uid);

    if (!result.ok) {
      if (result.notFound) return res.status(404).json({ error: 'Code submission not found' });
      return res.status(409).json({ error: `Code submission is already '${result.currentStatus}', not pending` });
    }

    res.json({ id: req.params.id, status });
  } catch (err) {
    next(err);
  }
});
