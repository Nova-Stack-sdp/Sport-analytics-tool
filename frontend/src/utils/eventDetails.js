// One readable line describing what an event in the log recorded, built
// from its stored payload (shapes: backend/src/validation/event-records.js).
// Missing values are skipped rather than shown as "null".

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 95123 → "1:35.123" */
export function formatLapTime(ms) {
  if (!isNum(ms)) return null;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${seconds}` : `${Number(seconds)}s`;
}

const seconds = (ms) => (isNum(ms) ? `${(ms / 1000).toFixed(1)} s` : null);
const pos = (p) => (isNum(p) ? `P${p}` : null);
const join = (...parts) => parts.filter(Boolean).join(' · ');

const DETAILS = {
  lap_completed: (p) => join(formatLapTime(p.lap_time_ms), p.is_pit_out_lap ? 'pit out lap' : null),
  pit_stop: (p) => (isNum(p.pit_duration_ms) ? `${seconds(p.pit_duration_ms)} in the pit lane` : null),
  tyre_stint: (p) => join(
    isNum(p.stint_number) ? `Stint ${p.stint_number}` : null,
    p.compound ? String(p.compound).toUpperCase() : null,
    isNum(p.start_lap) ? `laps ${p.start_lap}–${isNum(p.end_lap) ? p.end_lap : '?'}` : null,
  ),
  position_change: (p) => (isNum(p.from_position) || isNum(p.to_position)
    ? `${pos(p.from_position) ?? '—'} → ${pos(p.to_position) ?? '—'}`
    : null),
  flag_event: (p) => (p.flag ? `${String(p.flag).replace(/_/g, ' ')} flag` : null),
  race_control_message: (p) => p.message_text ?? null,
  weather_snapshot: (p) => join(
    isNum(p.air_temp) ? `Air ${p.air_temp}°C` : null,
    isNum(p.track_temp) ? `Track ${p.track_temp}°C` : null,
    p.rainfall ? 'Rain' : null,
  ),
  classification: (p) => {
    if (p.status === 'dnf' || p.status === 'dsq') {
      return join(String(p.status).toUpperCase(), p.reason);
    }
    return join(pos(p.final_position), isNum(p.points) ? `${p.points} pts` : null);
  },
  grid_position: (p) => (isNum(p.position) ? `Grid ${pos(p.position)}` : null),
  session_status_change: (p) => p.status ?? null,
};

export function eventDetail(event) {
  const describe = DETAILS[event?.eventType];
  if (!describe || !event.payload || typeof event.payload !== 'object') return null;
  return describe(event.payload) || null;
}
