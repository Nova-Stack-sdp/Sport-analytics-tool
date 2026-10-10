// The momentum reading behind the speedometer: how fast the leader's published
// margin moved on the selected lap, measured against the range of swing the
// race has already shown, so the needle's travel means something instead of
// amplifying a quiet race into a full-scale lurch.
//
// It reads the same published margin the Race Control bar quotes (the leader's
// lap-by-lap "diff"), taken as a series rather than a single step. Same
// spoiler rule as the rest of the page: only laps at or before the cursor are
// sampled, so the dial never swings on a move the broadcast has not reached.
// Pure functions only — unit-testable without a browser.

import { formatGapSeconds } from './raceAnalytics.js';

// Below this the margin is noise rather than a move — the same threshold the
// Race Control bar already uses before it shows a trend arrow.
const DELTA_FLOOR = 0.05;

// A dial needs a scale even in a processional race: the swing range never
// collapses below this, or every 0.1 s wobble would read as full deflection.
const MIN_SPAN = 0.25;

const DIRECTIONS = {
  pulling: { tone: 'pace', label: 'Pulling away' },
  holding: { tone: 'neutral', label: 'Holding steady' },
  pressure: { tone: 'caution', label: 'Under pressure' },
};

export function buildMomentumModel(lapTrend, lap) {
  const records = Array.isArray(lapTrend?.records) ? lapTrend.records : [];
  const cursor = Number.isFinite(Number(lap)) ? Math.floor(Number(lap)) : 1;
  const gaps = records
    .filter((record) => record.lap <= cursor && record.gapToLeaderSec != null)
    .map((record) => ({ lap: record.lap, gap: record.gapToLeaderSec }))
    .sort((first, second) => first.lap - second.lap);
  if (gaps.length === 0) return null;

  const samples = [];
  for (let index = 1; index < gaps.length; index += 1) {
    const previous = gaps[index - 1];
    const current = gaps[index];
    // A gap missing for an intermediate lap would turn the step across the
    // hole into a fake move, so only consecutive laps are compared.
    if (current.lap !== previous.lap + 1) continue;
    samples.push({
      lap: current.lap,
      gap: current.gap,
      previousGap: previous.gap,
      delta: Number((current.gap - previous.gap).toFixed(4)),
    });
  }

  const current = samples.find((sample) => sample.lap === cursor)
    ?? gaps.find((entry) => entry.lap === cursor)
    ?? null;
  const hasDelta = current != null && 'delta' in current;
  const span = Math.max(
    samples.reduce((widest, sample) => Math.max(widest, Math.abs(sample.delta)), 0),
    MIN_SPAN
  );

  const delta = hasDelta ? current.delta : null;
  const direction = delta == null
    ? 'holding'
    : delta >= DELTA_FLOOR
      ? 'pulling'
      : delta <= -DELTA_FLOOR
        ? 'pressure'
        : 'holding';
  const { tone, label } = DIRECTIONS[direction];
  const detail = current == null
    ? 'No margin published for this lap'
    : [
      `Margin ${formatGapSeconds(current.gap)}`,
      hasDelta ? `${delta >= 0 ? 'grew' : 'gave up'} ${Math.abs(delta).toFixed(2)}s on lap ${current.lap}` : null,
    ].filter(Boolean).join(' · ');

  return {
    lap: cursor,
    samples,
    current: current
      ? {
        lap: current.lap,
        gap: current.gap,
        previousGap: 'previousGap' in current ? current.previousGap : null,
        // Null means "the margin is published but there is no earlier lap to
        // measure it against" — the dial parks rather than inventing a move.
        delta,
      }
      : null,
    delta,
    // A late sample (the cursor sits on a lap without a published margin)
    // leaves the dial on the last move the broadcast actually showed.
    latest: samples.length ? samples[samples.length - 1] : null,
    span,
    peakDelta: samples.reduce((widest, sample) => (
      Math.abs(sample.delta) > Math.abs(widest) ? sample.delta : widest
    ), 0),
    peakLap: samples.reduce((widest, sample) => (
      Math.abs(sample.delta) > Math.abs(widest.delta ?? 0) ? sample : widest
    ), samples[0] ?? null)?.lap ?? null,
    fraction: delta == null ? 0 : Math.max(-1, Math.min(1, delta / span)),
    direction,
    tone,
    label,
    detail,
    readout: delta == null
      ? '--'
      : `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}s`,
  };
}
