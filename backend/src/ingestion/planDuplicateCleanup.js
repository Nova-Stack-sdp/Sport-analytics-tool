import { eventIdentity, sameEventData } from './eventIdentity.js';

/**
 * planDuplicateCleanup — works out how to repair a session whose events were
 * inserted more than once (every OpenF1 re-sync used to insert the whole
 * session again).
 *
 * For each group of live events that are the same event (same identity):
 *   - exact copies of an earlier event are deleted — they carry no
 *     information, they're the bug;
 *   - a copy whose data differs from the one before it is kept, and the
 *     earlier one is marked superseded by it — that's a genuine change
 *     between two syncs, so it's recorded as a correction, oldest first.
 * Afterwards each group has exactly one live event.
 *
 * An event that another event already points at (it's the target of an
 * earlier correction) is never deleted; if that blocks a repair, the group
 * is reported under `skipped` for a person to look at.
 *
 * Pure: takes every event of one session (live and superseded) and returns
 * a plan; the script in scripts/dedupe-events.js applies it.
 *
 * @param {Array} events - { id, eventType, entryId, lapNumber, occurredAt,
 *   payload, ingestedAt, supersededById }
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
    if (group.length < 2) continue;
    plan.duplicateGroups += 1;
    group.sort((a, b) =>
      new Date(a.ingestedAt) - new Date(b.ingestedAt) || String(a.id).localeCompare(String(b.id))
    );

    let current = group[0];
    for (const next of group.slice(1)) {
      if (sameEventData(current, next) && !referenced.has(next.id)) {
        plan.deleteIds.push(next.id);
      } else if (!sameEventData(current, next) && !referenced.has(next.id)) {
        plan.supersede.push({ id: current.id, supersededById: next.id });
        current = next;
      } else {
        plan.skipped.push({ identity, eventId: next.id, reason: 'already the target of a correction' });
      }
    }
  }

  return plan;
}
