/**
 * eventIdentity — what makes two events "the same event".
 *
 * Re-syncing a session (or resubmitting a batch) must not double-count
 * anything. To tell a re-sent event apart from a genuinely new one we need
 * an identity that doesn't change between submissions: which session, which
 * car, which type of event, and whatever pins it down within that (the lap,
 * the stint, the timestamp...). The payload is deliberately NOT part of the
 * identity — if the same lap arrives again with a different time, that's a
 * correction to the same event, not a new event (see planIngestion.js).
 *
 * Pure: works the same on a freshly built event and on a row read back from
 * the database, so the sync job and the duplicate-cleanup script agree on
 * exactly what counts as a duplicate.
 */

function ts(value) {
  if (value === null || value === undefined) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function part(value) {
  return value === null || value === undefined ? '-' : String(value);
}

// Stable JSON: object keys sorted, so {a,b} and {b,a} compare equal.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value ?? null);
}

/**
 * Returns the identity string for one event, scoped to its session.
 * `event` needs: eventType, entryId, lapNumber, occurredAt, payload.
 */
export function eventIdentity(event) {
  const { eventType, entryId, lapNumber, occurredAt } = event;
  const payload = event.payload ?? {};
  const who = part(entryId);

  switch (eventType) {
    case 'lap_completed':
      return `lap_completed|${who}|${part(lapNumber)}`;
    case 'pit_stop':
      return `pit_stop|${who}|${ts(occurredAt)}`;
    case 'tyre_stint':
      return `tyre_stint|${who}|${part(payload.stint_number ?? lapNumber)}`;
    case 'position_change':
      return `position_change|${who}|${ts(occurredAt)}`;
    // One result and one grid slot per car per session — their timestamps
    // aren't meaningful (see openf1-sync.js), so they're not part of the key.
    case 'classification':
      return `classification|${who}`;
    case 'grid_position':
      return `grid_position|${who}`;
    case 'flag_event':
      return `flag_event|${ts(occurredAt)}|${part(payload.flag)}`;
    // Several messages can share a timestamp, and a message never gets
    // "corrected", so the text itself is part of what identifies it.
    case 'race_control_message':
      return `race_control_message|${ts(occurredAt)}|${canonicalJson(payload)}`;
    case 'weather_snapshot':
      return `weather_snapshot|${ts(occurredAt)}`;
    default:
      return `${eventType}|${who}|${part(lapNumber)}|${ts(occurredAt)}`;
  }
}

/**
 * True when two events with the same identity also carry the same data —
 * i.e. the second one is an exact re-send, not a correction.
 */
export function sameEventData(a, b) {
  return (
    part(a.lapNumber) === part(b.lapNumber)
    && part(a.entryId) === part(b.entryId)
    && canonicalJson(a.payload ?? {}) === canonicalJson(b.payload ?? {})
  );
}
