import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, requireVerifiedEmail } from '../middleware/requireAuth.js';

export const codeSubmissionsRouter = Router();

const STATUSES = ['pending', 'approved', 'rejected'];
const REVIEW_STATUSES = ['approved', 'rejected'];

const ALLOWED_LANGUAGES = ['JavaScript', 'Python'];
const LIMITS = {
  titleMin: 3,
  titleMax: 80,
  codeMax: 50000,
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

  if (description.length > LIMITS.descriptionMax) {
    errors.push(`Description must be at most ${LIMITS.descriptionMax} characters.`);
  }

  if (tags.length > LIMITS.maxTags) errors.push(`Use at most ${LIMITS.maxTags} tags.`);
  if (tags.some((tag) => tag.length > LIMITS.tagMax)) {
    errors.push(`Each tag must be at most ${LIMITS.tagMax} characters.`);
  }

  return { errors, value: { title, language, code, description: description || null, tags } };
}

codeSubmissionsRouter.post('/', requireAuth, requireVerifiedEmail, requireDeveloperOrAdmin, async (req, res, next) => {
  try {
    const { errors, value } = validateBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' '), errors });
    }

    const created = await prisma.codeSubmission.create({
      data: {
        ...value,
        submitterId: req.user.uid,
        submitterEmail: req.user.email,
        status: 'pending',
      },
      select: { id: true, status: true, submittedAt: true },
    });

    res.status(201).json({ id: created.id, status: created.status, submittedAt: created.submittedAt });
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

codeSubmissionsRouter.patch('/:id', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body ?? {};
    if (!REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.codeSubmission.updateMany({
        where: { id: req.params.id, status: 'pending' },
        data: { status, reviewedBy: req.user.uid, reviewedAt: new Date() },
      });

      if (count === 0) {
        const existing = await tx.codeSubmission.findUnique({
          where: { id: req.params.id },
          select: { status: true },
        });
        return { ok: false, notFound: !existing, currentStatus: existing?.status };
      }

      if (status === 'approved') {
        const submission = await tx.codeSubmission.findUnique({ where: { id: req.params.id } });
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
            verifiedBy: req.user.uid,
          },
        });
      }

      return { ok: true };
    }, { maxWait: 15000, timeout: 30000 });

    if (!result.ok) {
      if (result.notFound) return res.status(404).json({ error: 'Code submission not found' });
      return res.status(409).json({ error: `Code submission is already '${result.currentStatus}', not pending` });
    }

    res.json({ id: req.params.id, status });
  } catch (err) {
    next(err);
  }
});