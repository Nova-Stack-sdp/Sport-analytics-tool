import { eventIdentity, sameEventData } from './eventIdentity.js';

/**
 * planIngestion — decides what a submission actually changes, before
 * anything is written.
 *
 * Given the events a submission brings in and the events already live for
 * that session, every incoming event lands in exactly one bucket:
 *
 *   insert      — never seen before: write it.
 *   unchanged   — already stored with identical data: skip it. This is what
 *                 makes resubmitting a batch safe — nothing is counted twice.
 *   corrections — same event, different data: write the new version and
 *                 mark the old one as superseded by it. The old row is kept,
 *                 so the correction leaves a history behind it.
 *   duplicates  — the same event appears more than once in this batch: only
 *                 the first is considered, the rest are reported.
 *
 * Pure (no database) so it can be unit tested and reused by any submission
 * path, not just the OpenF1 sync.
 *
 * @param {Array} incoming - events in the submission
 * @param {Array} existingLive - live (not superseded) events already stored
 *   for the same session; each must include `id`
 */
export function planIngestion(incoming, existingLive) {
  const existingByIdentity = new Map();
  for (const event of existingLive) {
    // If the store itself already holds duplicates (from before this fix),
    // compare against the most recently ingested copy.
    const key = eventIdentity(event);
    const current = existingByIdentity.get(key);
    if (!current || new Date(event.ingestedAt ?? 0) >= new Date(current.ingestedAt ?? 0)) {
      existingByIdentity.set(key, event);
    }
  }

  const plan = { insert: [], unchanged: [], corrections: [], duplicates: [] };
  const seenInBatch = new Set();

  for (const event of incoming) {
    const key = eventIdentity(event);
    if (seenInBatch.has(key)) {
      plan.duplicates.push({ event, identity: key });
      continue;
    }
    seenInBatch.add(key);

    const existing = existingByIdentity.get(key);
    if (!existing) {
      plan.insert.push(event);
    } else if (sameEventData(existing, event)) {
      plan.unchanged.push({ event, existingId: existing.id });
    } else {
      plan.corrections.push({ event, supersedesId: existing.id, identity: key });
    }
  }

  return plan;
}

// The one-line summary stored on the submission and printed by the sync.
export function summarizePlan(plan, rejectedCount = 0) {
  return {
    inserted: plan.insert.length,
    corrected: plan.corrections.length,
    unchanged: plan.unchanged.length,
    duplicatesInBatch: plan.duplicates.length,
    rejected: rejectedCount,
  };
}
