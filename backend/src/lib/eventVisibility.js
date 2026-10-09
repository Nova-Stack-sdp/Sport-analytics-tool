/**
 * Event visibility shared by every route that reads the event log.
 *
 * The event log is append-only, so deleting a dataset does not remove its
 * events: the submission is soft-deleted (deleted_at set) and every read
 * filters its events out. Spread these into a Prisma `where` on Event.
 *
 * - FROM_UNDELETED_DATASET: everything except deleted datasets. For admin
 *   and developer views that must also show data still under review.
 * - FROM_PUBLISHED_DATASET: only data the public may see — OpenF1 syncs
 *   and developer uploads an admin has accepted, never deleted ones. This
 *   is the same rule the statistics are derived with (derivation/db.js,
 *   derivation/rebuild.js), so public pages and statistics always agree.
 */
export const PUBLISHED_SUBMISSION_STATUSES = ['accepted', 'partially_accepted'];

export const FROM_UNDELETED_DATASET = { sourceSubmission: { deletedAt: null } };

export const FROM_PUBLISHED_DATASET = {
  sourceSubmission: { deletedAt: null, status: { in: PUBLISHED_SUBMISSION_STATUSES } },
};

/** The same rule for a Prisma `where` on Submission itself. */
export const PUBLISHED_SUBMISSION = { deletedAt: null, status: { in: PUBLISHED_SUBMISSION_STATUSES } };

/** True when an event loaded with `sourceSubmission` came from a deleted dataset. */
export function isFromDeletedDataset(event) {
  return Boolean(event?.sourceSubmission?.deletedAt);
}
