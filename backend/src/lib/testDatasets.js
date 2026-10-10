/**
 * Test data lives exactly as long as the code it was uploaded for: kept
 * while the code is pending or published, retired when the code is
 * rejected or removed.
 *
 * "Retired" means soft-deleted, like an admin delete (deleted_at and
 * deleted_by set), so it stays visible under the admin Deleted tab and can
 * be restored there. Test data never wrote events, so there are no
 * statistics to recompute.
 *
 * Call it with the transaction client of the change that triggers it, so
 * the code's status and its test data change together.
 */
export async function retireTestDataset(tx, datasetId, adminUid, at = new Date()) {
  if (!datasetId) return false;
  const { count } = await tx.submission.updateMany({
    where: { id: datasetId, purpose: 'code_test', deletedAt: null },
    data: { deletedAt: at, deletedBy: adminUid },
  });
  return count === 1;
}
