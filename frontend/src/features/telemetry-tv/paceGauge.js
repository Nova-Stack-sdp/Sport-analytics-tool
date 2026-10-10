// Everything the pace instrument needs out of the leader's lap times: the
// range the dial spans (fastest to slowest of the laps already run), where the
// selected lap's needle sits inside that range, which colour band that reading
// falls in, and the per-lap bars for the strip under the dial.
//
// Spoiler rule (same as before the dial replaced the flat chart): only laps at
// or before the cursor are ever considered, so the fastest lap, the averages
// and the needle all reveal as the broadcast does and never ahead of it.
// Pure functions only — unit-testable without a browser.

// Share of the fastest-to-slowest span each colour band covers. A lap inside
// the first band is "on the pace", the last band is "off the pace" (a yellow,
// a long run on worn tyres, a mistake). The bands are drawn on the dial, so
// the needle's colour always has the scale to explain itself.
export const PACE_BAND_SHARES = {
  onPace: 0.35,
  neutral: 0.7,
};

// A dial needs air at both ends or the needle pegs on its own axis and reads
// as broken; the pad is a share of the span with a small absolute floor.
function padFor(span) {
  return Math.max(span * 0.08, 0.05);
}

export function buildPaceGauge(lapTrend, lap) {
  const records = Array.isArray(lapTrend?.records) ? lapTrend.records : [];
  const cursor = Number.isFinite(Number(lap)) ? Math.floor(Number(lap)) : 1;
  const visible = records.filter((record) => record.lap <= cursor);
  const paced = visible.filter((record) => record.lapSeconds != null);
  if (paced.length === 0) return null;

  const totalLaps = Number.isFinite(Number(lapTrend?.totalLaps))
    ? Number(lapTrend.totalLaps)
    : (visible.length ? visible[visible.length - 1].lap : 0);
  // Final answers only exist once the checkered lap has been run: before that
  // the fastest lap is "so far", never "of the race".
  const isFinished = totalLaps > 0 && cursor >= totalLaps;

  const fastest = paced.reduce((best, record) => (
    record.lapSeconds < best.lapSeconds ? record : best
  ));
  const slowestSeconds = Math.max(...paced.map((record) => record.lapSeconds));
  const span = Math.max(slowestSeconds - fastest.lapSeconds, 0.05);
  const averageSeconds = paced.reduce((total, record) => total + record.lapSeconds, 0) / paced.length;

  const greenPaced = paced.filter((record) => record.flag === 'Green');
  const greenAverageSeconds = greenPaced.length
    ? greenPaced.reduce((total, record) => total + record.lapSeconds, 0) / greenPaced.length
    : null;

  const selected = visible.find((record) => record.lap === cursor) ?? null;
  const selectedSeconds = selected?.lapSeconds ?? null;
  const deltaToFastest = selectedSeconds == null
    ? null
    : Number((selectedSeconds - fastest.lapSeconds).toFixed(3));

  const onPaceLimit = fastest.lapSeconds + span * PACE_BAND_SHARES.onPace;
  const offPaceLimit = fastest.lapSeconds + span * PACE_BAND_SHARES.neutral;
  const selectedOffset = selectedSeconds == null ? null : selectedSeconds - fastest.lapSeconds;
  const selectedTone = selectedOffset == null
    ? 'neutral'
    : selected.flag === 'Yellow' || selectedOffset >= offPaceLimit - fastest.lapSeconds
      ? 'caution'
      : selectedOffset <= onPaceLimit - fastest.lapSeconds
        ? 'pace'
        : 'neutral';

  const pad = padFor(span);
  // Height fraction for the strip: the fastest lap fills the strip, the
  // slowest keeps a visible stub, so the shape of the run reads at a glance.
  const barPercent = (seconds) => 22 + ((slowestSeconds - seconds) / span) * 78;

  return {
    lap: cursor,
    totalLaps,
    isFinished,
    // Every lap already run, whether or not it carries a time: the strip draws
    // the gaps honestly instead of pretending the untimed laps never happened.
    runLaps: visible.length,
    timedLaps: paced.length,
    greenLaps: greenPaced.length,
    fastest: {
      lap: fastest.lap,
      seconds: fastest.lapSeconds,
      speedMph: fastest.speedMph ?? null,
    },
    slowestSeconds,
    averageSeconds,
    greenAverageSeconds,
    selected: selected == null
      ? null
      : {
        lap: selected.lap,
        seconds: selectedSeconds,
        flag: selected.flag ?? null,
        deltaToFastest,
      },
    needle: {
      value: selectedSeconds,
      min: fastest.lapSeconds - pad,
      max: slowestSeconds + pad,
      tone: selectedTone,
      // Where the reading sits across the dial, 0 at the fast end.
      fraction: selectedSeconds == null ? 0 : (selectedSeconds - fastest.lapSeconds) / span,
    },
    bands: [
      { from: fastest.lapSeconds, to: onPaceLimit, tone: 'pace' },
      { from: onPaceLimit, to: offPaceLimit, tone: 'neutral' },
      { from: offPaceLimit, to: slowestSeconds, tone: 'caution' },
    ],
    bars: paced.map((record) => ({
      lap: record.lap,
      seconds: record.lapSeconds,
      flag: record.flag ?? null,
      speedMph: record.speedMph ?? null,
      gapToLeaderSec: record.gapToLeaderSec ?? null,
      percent: barPercent(record.lapSeconds),
      isFastest: record.lap === fastest.lap,
      isSelected: record.lap === cursor,
    })),
    cursorPercent: totalLaps > 0
      ? ((Math.min(Math.max(cursor, 1), totalLaps) - 0.5) / totalLaps) * 100
      : 0,
  };
}
