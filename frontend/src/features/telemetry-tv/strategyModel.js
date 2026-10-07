// Derives the Strategy / Tyre Analysis rows from the laps already run: how
// the leader's green-flag pace drifts through the current run, how long ago
// the last pit stop came, and the selected lap's gap to the fastest lap so
// far. Pure and spoiler-safe — every input is already clipped to the lap the
// broadcast has reached, so the rows never quote a lap the viewer has not
// seen. Missing data falls back to honest "not enough yet" states rather than
// fabricated numbers.

// Pace drift below this threshold between the early and late parts of a
// green run reads as "holding" rather than "degrading".
const DEGRADATION_THRESHOLD_SECONDS = 0.15;
// Fewer timed green laps than this in the current run and there is nothing
// to compare yet.
const MIN_RUN_LAPS = 4;

function averageLapSeconds(records) {
  return records.reduce((total, record) => total + record.lapSeconds, 0) / records.length;
}

export function buildStrategyModel({ lapTrend, lap, cautions = [], pitStops = [] } = {}) {
  const records = (Array.isArray(lapTrend?.records) ? lapTrend.records : [])
    .filter((record) => record.lap <= lap);
  const paced = records.filter((record) => record.lapSeconds != null);

  // Pace delta: the selected lap against the fastest lap already run.
  const fastest = paced.length
    ? paced.reduce((best, record) => (record.lapSeconds < best.lapSeconds ? record : best))
    : null;
  const selected = records.find((record) => record.lap === lap) ?? null;
  const paceDelta = selected?.lapSeconds != null && fastest
    ? {
      seconds: Number((selected.lapSeconds - fastest.lapSeconds).toFixed(3)),
      isFastest: selected.lap === fastest.lap,
    }
    : null;

  // Tyre read: compare the early and late parts of the current green run —
  // the laps since the last caution that has already ended. Cautions reset
  // the run because they reset the picture the comparison is about.
  const lastCautionEnd = (Array.isArray(cautions) ? cautions : [])
    .map((caution) => Number(caution?.toLap ?? caution?.to))
    .filter((toLap) => Number.isFinite(toLap) && toLap <= lap)
    .reduce((max, toLap) => Math.max(max, toLap), 0);
  const runLaps = paced.filter((record) => (
    record.lap > lastCautionEnd && record.flag === 'Green'
  ));

  let tyre = { status: 'insufficient', drift: null, fromLap: null, toLap: null };
  if (runLaps.length >= MIN_RUN_LAPS) {
    const half = Math.floor(runLaps.length / 2);
    const early = averageLapSeconds(runLaps.slice(0, half));
    const late = averageLapSeconds(runLaps.slice(runLaps.length - half));
    const drift = Number((late - early).toFixed(3));
    tyre = {
      status: drift > DEGRADATION_THRESHOLD_SECONDS ? 'degrading' : 'holding',
      drift,
      fromLap: runLaps[0].lap,
      toLap: runLaps[runLaps.length - 1].lap,
    };
  }

  // Pit window: laps since the most recent visible stop at or before the lap.
  const stops = (Array.isArray(pitStops) ? pitStops : [])
    .map((stop) => ({ ...stop, stopLap: Number(stop?.raceLap ?? stop?.lap) }))
    .filter((stop) => Number.isFinite(stop.stopLap) && stop.stopLap >= 1 && stop.stopLap <= lap)
    .sort((first, second) => second.stopLap - first.stopLap);
  const lastStop = stops[0] ?? null;

  return {
    tyre,
    pit: {
      lapsSinceLastStop: lastStop ? Math.max(0, lap - lastStop.stopLap) : null,
      lastStopLap: lastStop?.stopLap ?? null,
      lastStopDriver: lastStop?.driver ?? null,
      lastStopCar: lastStop?.car ?? null,
      totalStops: stops.length,
    },
    paceDelta,
    fastest: fastest ? { lap: fastest.lap, seconds: fastest.lapSeconds } : null,
  };
}
