// The reading side of the panels under RaceSync's map: the backend's lap
// series — one column per measure per driver, indexed by lap - 1, see
// buildLapSeries in backend/src/routes/raceReplay.js — turned into the few
// shapes the panels actually draw. Pure and synchronous, one function per
// panel reading, so what a panel will show can be checked without rendering
// it.
//
// Two rules hold throughout, and they are the page's own: only laps the
// playhead has passed are ever looked at (nothing on screen spoils a lap that
// hasn't been played), and nothing is invented — a lap with no record stays a
// gap rather than being filled in from its neighbours, and a reading the data
// can't support is left out rather than estimated.

// One driver's race up to the playhead: the first `uptoLap` entries of one of
// the series' own columns. The playhead is the only thing that decides how much
// of the race exists, so every panel is playhead-aware by construction.
const played = (column, uptoLap) =>
  Array.isArray(column) ? column.slice(0, Math.max(0, Math.floor(uptoLap) || 0)) : [];

const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

// ---------------------------------------------------------------------------
// Stoppages
// ---------------------------------------------------------------------------

// A lap time is only a lap time if a car could have driven it. When a race is
// stopped — a red flag, a long hold — the next interval in the log carries the
// whole pause: the Monza fixture writes 1955.709 seconds where a lap of some
// cars belongs, twenty-three times the pace. That is the clock's number, not
// the car's. No lap of any race in this data comes near ten minutes and a
// pause is always far past it, so ten minutes is where the two divide.
//
// Every reading that treats a value as a lap time — a chart's lines, a stint's
// wear, a pace median — leaves such intervals out. The race state table is the
// exception on purpose: that column is the log's own last-lap figure, reported
// as it stands.
export const LAP_TIME_CEILING_SECONDS = 600;
const isLapTime = (seconds) =>
  Number.isFinite(seconds) && seconds <= LAP_TIME_CEILING_SECONDS;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// m:ss.mmm — the format every timing screen uses, and the only one that reads
// at a glance for a lap of Monza. Anything under a minute keeps the seconds
// form, because a chart axis of "0:59.8" wastes the width that matters.
export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(3).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${rest}` : rest;
}

// A difference between two lap times, signed: +0.412 / -1.234.
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds < 0 ? '-' : '+'}${Math.abs(seconds).toFixed(3)}`;
}

// A gap between two cars: the same number, read as a distance rather than as a
// change, so it carries no sign.
export function formatGap(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return Math.abs(seconds).toFixed(3);
}

// ---------------------------------------------------------------------------
// Tyres and stops
// ---------------------------------------------------------------------------

// The compound as the broadcast shows it: one letter, in the tyre's own
// colour. The database carries the compound's name (SOFT, MEDIUM, …) rather
// than Pirelli's C-numbers, so the letter is all there is to show — and all a
// timing screen shows for an unchosen set anyway.
const COMPOUNDS = {
  soft: { letter: 'S', label: 'Soft' },
  medium: { letter: 'M', label: 'Medium' },
  hard: { letter: 'H', label: 'Hard' },
  intermediate: { letter: 'I', label: 'Intermediate' },
  wet: { letter: 'W', label: 'Wet' },
};

export function compoundChip(compound) {
  const name = String(compound ?? '').trim();
  if (!name) return null;
  const known = COMPOUNDS[name.toLowerCase()];
  if (known) return { key: name.toLowerCase(), letter: known.letter, label: known.label };
  // A compound this build doesn't know: show what the log says rather than
  // hide the tyre.
  return { key: 'other', letter: name.slice(0, 1).toUpperCase(), label: name };
}

// Measured wear, not a model: the second half of a stint's laps against its
// first, expressed per lap. Only meaningful once a stint has two halves of two
// timed laps each — anything shorter would be reading noise.
function wearPerLap(times) {
  const half = Math.floor(times.length / 2);
  if (half < 2) return null;
  const gap = times.length - half; // laps between the two halves' midpoints
  return (mean(times.slice(-half)) - mean(times.slice(0, half))) / gap;
}

// One stint: a run of laps on the same set of tyres. A run ends where the stint
// number or the compound changes — either means a new set, so a driver whose log
// carries one but not the other still gets a correct boundary.
export function stintSegments(driver, uptoLap) {
  const lapTimes = played(driver?.lapTimeSeconds, uptoLap);
  const compounds = played(driver?.compound, uptoLap);
  const stints = played(driver?.stintNumber, uptoLap);

  const segments = [];
  lapTimes.forEach((seconds, index) => {
    const key = `${stints[index] ?? ''}|${compounds[index] ?? ''}`;
    let segment = segments.at(-1);
    if (!segment || segment.key !== key) {
      segment = {
        key,
        compound: compounds[index] ?? null,
        stintNumber: stints[index] ?? null,
        fromLap: index + 1,
        toLap: index + 1,
        times: [],
      };
      segments.push(segment);
    }
    segment.toLap = index + 1;
    // A stoppage interval (see isLapTime) is not a lap the tyres ran, so it
    // neither averages into the stint nor counts towards its wear.
    if (isLapTime(seconds)) segment.times.push(seconds);
  });

  return segments.map(({ times, ...segment }) => ({
    ...segment,
    laps: segment.toLap - segment.fromLap + 1,
    timedLaps: times.length,
    average: times.length > 0 ? mean(times) : null,
    wearPerLap: wearPerLap(times),
  }));
}

// Where a driver's tyres changed, and what the stop cost or won: the position
// on the lap before the new set appears against the position on the first lap
// it is on. Positive places are places gained — the reading of an undercut or
// an overcut that this data actually supports.
export function pitStops(driver, uptoLap) {
  const segments = stintSegments(driver, uptoLap);
  const positions = played(driver?.position, uptoLap);

  return segments.slice(1).map((segment, index) => {
    const before = positions[segment.fromLap - 2] ?? null;
    const after = positions[segment.fromLap - 1] ?? null;
    return {
      lap: segment.fromLap,
      from: segments[index].compound,
      to: segment.compound,
      positionBefore: before,
      positionAfter: after,
      places: before != null && after != null ? before - after : null,
    };
  });
}

// How many times each driver has changed tyres so far — the race state table's
// own column, read off the same stint boundaries the tyre panel draws.
export function stopCounts(drivers, uptoLap) {
  const counts = new Map();
  for (const driver of drivers ?? []) {
    counts.set(driver.entryId, Math.max(0, stintSegments(driver, uptoLap).length - 1));
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

function medianOf(sorted) {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

// The comparison's pace so far, quickest first: each driver's best lap, the
// middle of their timed laps, and how far that best sits off the quickest in
// the comparison. The median is the honest centre for a race lap — one traffic
// lap or one safety-car lap moves an average but not a median — and a stop in
// the race (see isLapTime) is not a lap at all, so it is not counted here.
export function paceRows(drivers, uptoLap) {
  const rows = (drivers ?? []).map((driver) => {
    const times = played(driver.lapTimeSeconds, uptoLap).filter(isLapTime);
    const sorted = [...times].sort((a, b) => a - b);
    return {
      entryId: driver.entryId,
      driverName: driver.driverName,
      teamName: driver.teamName,
      laps: times.length,
      best: sorted.length > 0 ? sorted[0] : null,
      median: medianOf(sorted),
    };
  });

  const quickest = rows.reduce(
    (min, row) => (row.best != null && (min == null || row.best < min) ? row.best : min),
    null
  );

  return rows
    .map((row) => ({
      ...row,
      gapToBest: row.best != null && quickest != null ? row.best - quickest : null,
    }))
    .sort((a, b) => (a.best ?? Number.POSITIVE_INFINITY) - (b.best ?? Number.POSITIVE_INFINITY));
}

// One driver read in depth, for the Driver Analysis card: the summary tiles
// the data honestly supports and nothing else. Average and best pace over the
// laps actually run (stoppages out, same rule as every other reading), the
// best's own lap, the latest stint's measured wear expressed against that
// stint's own pace, the stint lengths so far, and a handful of takeaways —
// each one a true sentence about the numbers, never an inferred cause. (A
// recommendation or a sector claim would need data no synced session has.)
export function driverSummary(driver, drivers, uptoLap) {
  if (!driver) return null;

  const timed = [];
  played(driver.lapTimeSeconds, uptoLap).forEach((seconds, index) => {
    if (isLapTime(seconds)) timed.push({ lap: index + 1, seconds });
  });
  const segments = stintSegments(driver, uptoLap);
  const stops = pitStops(driver, uptoLap);

  const average = timed.length > 0 ? mean(timed.map((entry) => entry.seconds)) : null;

  // The average's delta reads against the best average in the comparison —
  // the same "off whose pace" convention the pace rows use.
  const averages = (drivers ?? [])
    .map((other) => {
      const times = played(other.lapTimeSeconds, uptoLap).filter(isLapTime);
      return times.length > 0 ? mean(times) : null;
    })
    .filter((value) => value != null);
  const averageGap = average != null && averages.length > 0 ? average - Math.min(...averages) : null;

  const best = timed.length > 0 ? Math.min(...timed.map((entry) => entry.seconds)) : null;
  const bestLap = best != null ? timed.find((entry) => entry.seconds === best)?.lap ?? null : null;

  // Wear as the mockup's percentage: the latest stint whose two halves can be
  // compared, measured against that stint's own average pace. A young stint
  // has no measurable wear yet — null, not a zero.
  const wearable = segments.filter(
    (segment) => segment.wearPerLap != null && segment.average != null && segment.average > 0
  );
  const latestWear = wearable.at(-1) ?? null;
  const degradation = latestWear ? (latestWear.wearPerLap / latestWear.average) * 100 : null;

  const takeaways = [];
  const latestStop = [...stops].reverse().find((stop) => stop.places != null);
  if (latestStop) {
    takeaways.push(
      latestStop.places > 0
        ? `Gained +${latestStop.places} over the stop on L${latestStop.lap}`
        : latestStop.places < 0
          ? `Lost ${Math.abs(latestStop.places)} over the stop on L${latestStop.lap}`
          : `Held position over the stop on L${latestStop.lap}`
    );
  }
  if (bestLap != null) takeaways.push(`Best lap L${bestLap} — ${formatLapTime(best)}`);
  if (degradation != null) {
    takeaways.push(
      Math.abs(degradation) < 0.005
        ? 'Latest stint: no measurable tyre wear yet'
        : degradation > 0
          ? `Latest stint: tyres losing ${degradation.toFixed(2)}% of pace per lap`
          : `Latest stint: tyres improving ${Math.abs(degradation).toFixed(2)}% per lap`
    );
  }

  return {
    laps: timed.length,
    average,
    averageGap,
    best,
    bestLap,
    degradation,
    stintLengths: segments.map((segment) => segment.laps),
    stopCount: stops.length,
    takeaways,
  };
}

// ---------------------------------------------------------------------------
// Lap charts
// ---------------------------------------------------------------------------

// The lines a lap-time chart draws: one trace per driver, each point a lap that
// really has a time. `reference` is the quickest lap among the drivers on the
// chart — what a delta reading is measured against, so the comparison is always
// against the pace that is actually being looked at.
export function lapTraces(drivers, uptoLap) {
  // Intervals a car cannot have driven (see isLapTime) are counted rather than
  // plotted: one of them would spike the band and flatten every real lap on the
  // chart, so the chart says how many it left out instead.
  let stoppageLaps = 0;
  const traces = (drivers ?? []).map((driver) => {
    const points = [];
    played(driver.lapTimeSeconds, uptoLap).forEach((seconds, index) => {
      if (isLapTime(seconds)) points.push({ lap: index + 1, seconds });
      else if (Number.isFinite(seconds)) stoppageLaps += 1;
    });
    return {
      entryId: driver.entryId,
      driverName: driver.driverName,
      teamName: driver.teamName,
      points,
    };
  });

  const times = traces.flatMap((trace) => trace.points.map((point) => point.seconds));

  return {
    reference: times.length > 0 ? Math.min(...times) : null,
    stoppageLaps,
    traces: traces.map((trace) => ({
      ...trace,
      best: trace.points.length > 0 ? Math.min(...trace.points.map((point) => point.seconds)) : null,
    })),
  };
}

// What one point is plotted as: the lap time itself, or how far off the
// reference lap it was.
export function plottedValue(point, { mode, reference }) {
  if (mode === 'delta' && reference != null) return point.seconds - reference;
  return point.seconds;
}

// The band a chart's y axis has to cover, so lines are drawn to a scale rather
// than to whatever happens to be on screen. A delta chart starts at zero —
// it reads as "how much off the pace", and a floating baseline would lie about
// that — while a lap-time chart covers the times themselves with a little air
// above and below.
export function chartDomain({ traces, reference, mode }) {
  const values = (traces ?? []).flatMap((trace) =>
    trace.points.map((point) => plottedValue(point, { mode, reference }))
  );
  if (values.length === 0) return null;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const min = mode === 'delta' ? 0 : low;
  // A field all on the same pace, or a single lap of data, still needs a band
  // to draw in — otherwise every line collapses onto the axis.
  const pad = (high - min || 1) * 0.12;
  return { min: mode === 'delta' ? 0 : min - pad, max: high + pad };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

// One cell of the export: a reading the log doesn't carry stays an empty
// field rather than a zero or a guess, and a cell that would break the row —
// a comma, a quote, a newline — is quoted the way CSV asks for.
function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// The session's readings as a CSV file: one row per driver per lap, cut at
// the playhead exactly as the panels are — the export never spoils a lap the
// replay hasn't reached either. Screens interpret (a stoppage interval is left
// out of a chart so the axis stays honest); an export reports, so the log's
// own numbers stand in the file as they stand in the log, and a recipient
// filtering them out is one clause away.
export function readingsCsv(drivers, uptoLap) {
  const header = 'lap,driver,team,position,lap_time_s,compound,stint';
  const lines = [header];
  const laps = Math.max(0, Math.floor(uptoLap) || 0);
  for (let lap = 1; lap <= laps; lap += 1) {
    for (const driver of drivers ?? []) {
      const index = lap - 1;
      const seconds = driver?.lapTimeSeconds?.[index];
      lines.push(
        [
          lap,
          csvCell(driver?.driverName),
          csvCell(driver?.teamName),
          driver?.position?.[index] ?? '',
          Number.isFinite(seconds) ? seconds.toFixed(3) : '',
          csvCell(driver?.compound?.[index]),
          driver?.stintNumber?.[index] ?? '',
        ].join(',')
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

// The file's own name, from the race it was cut from: the meeting's name as a
// slug, and the lap the playhead stood on when it was cut — two exports from
// the same race at different laps are different files, and say so.
export function readingsCsvFilename(raceName, uptoLap) {
  const slug =
    String(raceName ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'race';
  return `${slug}-through-lap-${Math.max(0, Math.floor(uptoLap) || 0)}.csv`;
}
