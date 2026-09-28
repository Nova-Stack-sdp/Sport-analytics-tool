import { eventIdentity, sameEventData } from './eventIdentity.js';

/**
 * planDuplicateCleanup — works out how to repair a session whose events were
 * inserted more than once (every OpenF1 re-sync used to insert the whole
 * session again, as a new submission).
 *
 * The bug produced copies across SUBMISSIONS: sync run 2 re-inserted what
 * run 1 had already stored. So for every group of live events that share an
 * identity, the events from the earliest submission are kept as they are —
 * including several of them if the source genuinely sent several (two
 * position changes at the same instant, several flags in the same second).
 * Only events from later submissions are examined:
 *   - one that matches a kept event exactly is a re-sent copy → deleted;
 *   - if a later submission brought exactly one differing value where
 *     exactly one kept event no longer matches, that's a genuine change
 *     between syncs → the older event is marked superseded by the newer one
 *     (recorded as a correction);
 *   - anything else a later submission added is new data → kept.
 * Events that arrived together in one submission are never compared with
 * each other, so separate records that happen to share a timestamp are safe.
 *
 * An event that another event already points at (it's the target of an
 * earlier correction) is never deleted or re-pointed; it's reported under
 * `skipped` instead.
 *
 * Pure: takes every event of one session (live and superseded) and returns a
 * plan; scripts/dedupe-events.js applies it.
 *
 * @param {Array} events - { id, eventType, entryId, lapNumber, occurredAt,
 *   payload, ingestedAt, supersededById, sourceSubmissionId }
 */
export function planDuplicateCleanup(events) {
  const referenced = new Set(events.map((e) => e.supersededById).filter(Boolean));
  const groups = new Map();
  for (const event of events) {
    if (event.supersededById) continue; // already replaced — not live
    const key = eventIdentity(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  const plan = { deleteIds: [], supersede: [], skipped: [], duplicateGroups: 0 };

  for (const [identity, group] of groups) {
    const bySubmission = groupBySubmission(group);
    if (bySubmission.length < 2) continue; // all from one submission: nothing re-sent

    let changed = false;
    const kept = [...bySubmission[0]];

    for (const laterEvents of bySubmission.slice(1)) {
      const matchedKept = new Set();
      const leftovers = [];

      for (const event of laterEvents) {
        const match = kept.find((k) => !matchedKept.has(k) && sameEventData(k, event));
        if (!match) {
          leftovers.push(event);
        } else if (referenced.has(event.id)) {
          matchedKept.add(match);
          plan.skipped.push({ identity, eventId: event.id, reason: 'already the target of a correction' });
        } else {
          matchedKept.add(match);
          plan.deleteIds.push(event.id);
          changed = true;
        }
      }

      const unmatchedKept = kept.filter((k) => !matchedKept.has(k));
      if (leftovers.length === 1 && unmatchedKept.length === 1 && !referenced.has(leftovers[0].id)) {
        const [older] = unmatchedKept;
        plan.supersede.push({ id: older.id, supersededById: leftovers[0].id });
        kept.splice(kept.indexOf(older), 1, leftovers[0]);
        changed = true;
      } else {
        kept.push(...leftovers);
      }
    }

    if (changed) plan.duplicateGroups += 1;
  }

  return plan;
}

// Events of one identity, split by the submission that brought them in,
// oldest submission first.
function groupBySubmission(events) {
  const bySubmission = new Map();
  for (const event of events) {
    const key = event.sourceSubmissionId ?? `unknown:${event.id}`;
    if (!bySubmission.has(key)) bySubmission.set(key, []);
    bySubmission.get(key).push(event);
  }
  const firstIngest = (list) => Math.min(...list.map((e) => new Date(e.ingestedAt).getTime()));
  return [...bySubmission.values()]
    .map((list) => list.sort((a, b) => new Date(a.ingestedAt) - new Date(b.ingestedAt) || String(a.id).localeCompare(String(b.id))))
    .sort((a, b) => firstIngest(a) - firstIngest(b) || String(a[0].id).localeCompare(String(b[0].id)));
}
