// Picks the curated broadcast event that is live at the given video second, so
// the ticker narrates the race in step with playback instead of cycling on a
// timer. Curated races (Toronto) stamp every event with the video second it
// aired on and ship them through the payload's events array; races without
// video-stamped events simply return null and keep the lap-based commentary.

function eventSeconds(event) {
  const seconds = Number(event?.video_s ?? event?.videoSeconds);
  return Number.isFinite(seconds) ? seconds : null;
}

export function pickVideoTickerEvent(events, videoSeconds) {
  if (!Array.isArray(events) || videoSeconds == null) return null;
  const seconds = Number(videoSeconds);
  if (!Number.isFinite(seconds)) return null;

  // The stream can arrive out of order (payload events merge ahead of the
  // curated ones), so track the latest event at or before the clock.
  let current = null;
  let currentSeconds = -Infinity;
  for (const event of events) {
    const at = eventSeconds(event);
    if (at == null || at > seconds || at < currentSeconds) continue;
    if (typeof event?.detail !== 'string' || event.detail.trim() === '') continue;
    current = event;
    currentSeconds = at;
  }

  if (!current) return null;
  return {
    id: current.id ?? null,
    videoSeconds: currentSeconds,
    type: current.type ?? null,
    description: current.detail.trim(),
  };
}
