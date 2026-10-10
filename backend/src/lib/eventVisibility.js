/**
 * Event visibility shared by every route that reads the event log.
 *
 * The event log is append-only, so deleting a dataset does not remove its
 * events: the submission is soft-deleted (deleted_at set) and every read
 * filters its events out. Spread this into a Prisma `where` on Event.
 *
 * Statistics use a stricter filter (accepted datasets only), defined with
 * the derivation code in derivation/db.js and derivation/rebuild.js.
 */
export const FROM_UNDELETED_DATASET = { sourceSubmission: { deletedAt: null } };

/** True when an event loaded with `sourceSubmission` came from a deleted dataset. */
export function isFromDeletedDataset(event) {
  return Boolean(event?.sourceSubmission?.deletedAt);
}
