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

codeSubmissionsRouter.get('/', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }

    const [submissions, grouped] = await Promise.all([
      prisma.codeSubmission.findMany({
        where: status ? { status } : {},
        orderBy: { submittedAt: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          title: true,
          language: true,
          status: true,
          submitterId: true,
          submitterEmail: true,
          submittedAt: true,
          reviewedBy: true,
          reviewedAt: true,
        },
      }),
      prisma.codeSubmission.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of grouped) counts[row.status] = row._count._all;

    res.json({ submissions, counts });
  } catch (err) {
    next(err);
  }
});

codeSubmissionsRouter.get('/:id', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res, next) => {
  try {
    const submission = await prisma.codeSubmission.findUnique({ where: { id: req.params.id } });
    if (!submission) return res.status(404).json({ error: 'Code submission not found' });
    res.json(submission);
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