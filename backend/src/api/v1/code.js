/**
 * Public API: approved code.
 *
 *   GET /api/v1/code          every approved script, newest first
 *   GET /api/v1/code/:slug    one script, e.g. /api/v1/code/average-pit-loss
 *
 * Every script here was reviewed and approved by an admin. The API returns
 * the code exactly as it was submitted, plus what it does (its description).
 * It never runs the code. Who submitted it is deliberately not exposed.
 */
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { parsers, parseQuery, badRequest } from './params.js';

export const codeRouter = Router();

export const CODE_LANGUAGES = ['JavaScript', 'Python'];
// Slugs are made by the database (see migration 20261009120000_add_verified_code_slug).
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

const PUBLIC_SELECT = {
  slug: true,
  title: true,
  description: true,
  language: true,
  code: true,
  tags: true,
  verifiedAt: true,
};

/** The public shape agreed with the stats page. Keep field names stable. */
export function publicCode(row) {
  return {
    slug: row.slug,
    name: row.title,
    description: row.description ?? null,
    language: row.language,
    code: row.code,
    tags: row.tags ?? [],
    approvedAt: row.verifiedAt,
    endpoint: `/api/v1/code/${row.slug}`,
  };
}

const listSpec = {
  language: parsers.oneOf(CODE_LANGUAGES),
  tag: parsers.text({ maxLength: 24 }),
};

codeRouter.get('/', async (req, res, next) => {
  try {
    const { values, errors } = parseQuery(req.query, listSpec);
    if (errors) return badRequest(res, errors);
    const rows = await prisma.verifiedCode.findMany({
      where: {
        // A row whose slug is still empty has no public address yet.
        slug: { not: '' },
        ...(values.language && { language: values.language }),
        ...(values.tag && { tags: { has: values.tag.toLowerCase() } }),
      },
      orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
      select: PUBLIC_SELECT,
    });
    return res.json({ data: rows.map(publicCode) });
  } catch (err) {
    return next(err);
  }
});

codeRouter.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    if (slug.length > MAX_SLUG_LENGTH || !SLUG.test(slug)) {
      return badRequest(res, { slug: 'must be lower-case letters, digits and single dashes, e.g. average-pit-loss' });
    }
    const row = await prisma.verifiedCode.findUnique({ where: { slug }, select: PUBLIC_SELECT });
    if (!row) return res.status(404).json({ error: 'Code not found' });
    return res.json({ data: publicCode(row) });
  } catch (err) {
    return next(err);
  }
});
