// Readable names for the event types stored in the event log
// (backend: EventType in prisma/schema.prisma). Unknown types fall back to
// the raw value with underscores turned into spaces, so a new type still
// renders sensibly.
const EVENT_TYPE_LABELS = {
  lap_completed: 'Lap completed',
  pit_stop: 'Pit stop',
  tyre_stint: 'Tyre stint',
  position_change: 'Position change',
  flag_event: 'Flag',
  race_control_message: 'Race control',
  weather_snapshot: 'Weather',
  session_status_change: 'Session status',
  classification: 'Result',
  grid_position: 'Grid position',
};

export function eventTypeLabel(type) {
  if (!type) return '—';
  return EVENT_TYPE_LABELS[type] ?? String(type).replace(/_/g, ' ');
}

const SOURCE_LABELS = {
  openf1_sync: 'OpenF1 sync',
  manual_upload: 'Developer upload',
};

export function submissionSourceLabel(source) {
  return SOURCE_LABELS[source] ?? (source ? String(source).replace(/_/g, ' ') : '—');
}

/** "Abu Dhabi Grand Prix · Race" */
export function sessionLabel(session) {
  if (!session) return '—';
  return [session.meetingName, session.type].filter(Boolean).join(' · ');
}

/** 0.6667 → "67%". Accepts a 0–1 fraction; null/undefined → "—". */
export function percent(fraction) {
  if (fraction === null || fraction === undefined || Number.isNaN(Number(fraction))) return '—';
  return `${Math.round(Number(fraction) * 100)}%`;
}
