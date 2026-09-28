import { eventIdentity, isSingular, sameEventData } from './eventIdentity.js';

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
 *   duplicates  — a second copy of a singular event (e.g. lap 5 for the same
 *                 car twice) in this batch: only the first is considered,
 *                 the rest are reported.
 *
 * Events are compared per identity (see eventIdentity.js), and within an
 * identity as a set: each incoming event is matched one-to-one against a
 * stored event with the same data. That way two genuinely separate records
 * that share an identity (two position changes at the same instant, say)
 * are each matched to their own stored copy, instead of one being mistaken
 * for a duplicate of the other.
 *
 * Pure (no database) so it can be unit tested and reused by any submission
 * path, not just the OpenF1 sync.
 *
 * @param {Array} incoming - events in the submission
 * @param {Array} existingLive - live (not superseded) events already stored
 *   for the same session; each must include `id`
 */
export function planIngestion(incoming, existingLive) {
  const existingByIdentity = groupByIdentity(existingLive);
  const incomingByIdentity = groupByIdentity(incoming);

  const plan = { insert: [], unchanged: [], corrections: [], duplicates: [] };

  for (const [identity, group] of incomingByIdentity) {
    let batch = group;
    if (isSingular(group[0].eventType) && group.length > 1) {
      batch = [group[0]];
      for (const extra of group.slice(1)) plan.duplicates.push({ event: extra, identity });
    }

    // Stored events of this identity not yet matched to an incoming one.
    const pool = [...(existingByIdentity.get(identity) ?? [])];
    const leftovers = [];
    for (const event of batch) {
      const matchIndex = pool.findIndex((stored) => sameEventData(stored, event));
      if (matchIndex >= 0) {
        plan.unchanged.push({ event, existingId: pool[matchIndex].id });
        pool.splice(matchIndex, 1);
      } else {
        leftovers.push(event);
      }
    }

    if (leftovers.length === 1 && pool.length >= 1 && (pool.length === 1 || isSingular(leftovers[0].eventType))) {
      // One new value where one stored value no longer matches: that's the
      // same event with corrected data. (For a singular event, the store may
      // still hold old duplicate copies — correct the most recent one.)
      const target = newest(pool);
      plan.corrections.push({ event: leftovers[0], supersedesId: target.id, identity });
    } else {
      // Anything else unmatched is new: insert it. Stored events it doesn't
      // match are left alone — we can't tell which one it would replace.
      plan.insert.push(...leftovers);
    }
  }

  return plan;
}

function groupByIdentity(events) {
  const groups = new Map();
  for (const event of events) {
    const key = eventIdentity(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return groups;
}

function newest(events) {
  return events.reduce((latest, event) =>
    new Date(event.ingestedAt ?? 0) >= new Date(latest.ingestedAt ?? 0) ? event : latest
  );
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
