import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin, requireVerifiedEmail } from '../middleware/requireAuth.js';
import { retireTestDataset } from '../lib/testDatasets.js';

/**
 * Admin management of published (approved) code: /api/admin/verified-code.
 *
 *   GET    /       everything currently published, newest first
 *   DELETE /:id    take a script off the public API, permanently
 *
 * Removing deletes the verified_code row, so the script's public address
 * (/api/v1/code/<slug>) stops working at once (allowing for the API's
 * 60-second response cache). Once approval moves code instead of copying
 * it, this row is the only copy left, so there is no undo. The admin
 * panel asks for confirmation before calling this.
 *
 * The script's test data, if any, is retired (soft-deleted) in the same
 * transaction; it can still be restored from the admin Deleted tab.
 */
export const adminVerifiedCodeRouter = Router();

adminVerifiedCodeRouter.use(requireAuth, requireVerifiedEmail, requireAdmin);

const LIST_LIMIT = 200;

function adminRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    language: row.language,
    sourceSubmissionId: row.sourceSubmissionId,
    submitterId: row.submitterId,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt,
    endpoint: `/api/v1/code/${row.slug}`,
    testDatasetId: row.testDatasetId ?? null,
  };
}

const ADMIN_SELECT = {
  id: true,
  slug: true,
  title: true,
  language: true,
  sourceSubmissionId: true,
  submitterId: true,
  verifiedBy: true,
  verifiedAt: true,
  testDatasetId: true,
};

adminVerifiedCodeRouter.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.verifiedCode.findMany({
      orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
      take: LIST_LIMIT,
      select: ADMIN_SELECT,
    });
    res.json({ code: rows.map(adminRow) });
  } catch (err) {
    next(err);
  }
});

adminVerifiedCodeRouter.delete('/:id', async (req, res, next) => {
  try {
    const row = await prisma.verifiedCode.findUnique({ where: { id: req.params.id }, select: ADMIN_SELECT });
    if (!row) return res.status(404).json({ error: 'Published code not found' });

    // deleteMany so a concurrent removal is a clean 404, not an exception.
    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.verifiedCode.deleteMany({ where: { id: row.id } });
      if (count === 0) return null;
      const testDataRetired = await retireTestDataset(tx, row.testDatasetId, req.user.uid);
      return { testDataRetired };
    }, { maxWait: 15000, timeout: 30000 });
    if (!result) return res.status(404).json({ error: 'Published code not found' });

    console.info(`Admin ${req.user.uid} removed published code ${row.id} (${row.slug})`);
    res.json({ id: row.id, slug: row.slug, removed: true, testDataRetired: result.testDataRetired });
  } catch (err) {
    next(err);
  }
});
