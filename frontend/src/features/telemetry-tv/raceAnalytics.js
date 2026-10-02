// Turns the race-report payload the API already serves into the analytics the
// playback page can show: per-lap pace and flag strip, the leader's margin at
// every lap, official per-driver classification stats, and the finish summary.
// Pure functions only, so the numbers are unit-testable without a browser.

export function carKey(value) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// "01:03.5827" (lap time) and "00:01.0451" (gap to leader) both parse to
// seconds; "No Time"/null/- become null.
export function parseLapTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) return null;
  return Number((Number(match[1]) * 60 + Number(match[2])).toFixed(4));
}

// "01:48:23.9092" -> 6503.9092 seconds; used for retirements that completed
// fewer than the race distance.
export function parseDuration(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

// m:ss.mmm for lap times, else "+ss.s" for gaps; both null-safe.
export function formatLapSeconds(seconds) {
  if (seconds == null) return '--';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  const minutes = Math.floor(value / 60);
  const rest = value - minutes * 60;
  return `${minutes}:${String(rest.toFixed(3)).padStart(6, '0')}`;
}

export function formatGapSeconds(seconds) {
  if (seconds == null) return '--';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  if (value < 60) return `${value.toFixed(1)}s`;
  return `${Math.floor(value / 60)}:${String((value % 60).toFixed(1)).padStart(4, '0')}`;
}

export function formatDurationSeconds(seconds) {
  if (seconds == null) return '--';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '--';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function displayName(row) {
  if (typeof row?.DriverName === 'string' && row.DriverName.trim() !== '') return row.DriverName;
  const joined = [row?.FirstName, row?.LastName].filter(Boolean).join(' ');
  return joined || `Car ${row?.CarNumber ?? '--'}`;
}

// One entry per leader lap: pace (real reported lap time), flag, and the
// leader's margin at that lap. Missing samples stay null so the charts can
// skip them rather than draw a fabricated value.
export function buildLapTrend(race) {
  const records = (Array.isArray(race?.leaderLaps) ? race.leaderLaps : [])
    .map((record) => {
      const lap = numberOrNull(record?.lap);
      if (lap == null || lap < 1) return null;
      return {
        lap: Math.floor(lap),
        lapSeconds: parseLapTime(record?.lapTime),
        speedMph: numberOrNull(record?.speed),
        gapToLeaderSec: parseLapTime(record?.diff),
        flag: typeof record?.flag === 'string' ? record.flag : null,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.lap - second.lap);

  const paced = records.filter((record) => record.lapSeconds != null);
  const best = paced.length
    ? paced.reduce((current, record) => (
      record.lapSeconds < current.lapSeconds ? record : current
    ))
    : null;
  const averageLapSeconds = paced.length
    ? paced.reduce((total, record) => total + record.lapSeconds, 0) / paced.length
    : null;

  return {
    totalLaps: records.length ? records[records.length - 1].lap : 0,
    records,
    averageLapSeconds,
    bestLap: best ? { lap: best.lap, seconds: best.lapSeconds, speedMph: best.speedMph } : null,
  };
}

// Margin change between the selected lap and the one before it, so the
// playback bar can say whether the leader is pulling away or being caught.
export function marginDelta(race, lap) {
  const target = numberOrNull(lap);
  if (target == null || target < 2) return null;
  const records = Array.isArray(race?.leaderLaps) ? race.leaderLaps : [];
  const current = records.find((record) => Number(record?.lap) === Math.floor(target));
  const previous = records.find((record) => Number(record?.lap) === Math.floor(target) - 1);
  const currentGap = parseLapTime(current?.diff);
  const previousGap = parseLapTime(previous?.diff);
  if (currentGap == null || previousGap == null) return null;
  return {
    currentGap,
    previousGap,
    delta: Number((currentGap - previousGap).toFixed(4)),
  };
}

// Official per-driver classification numbers: best lap, average speed, laps
// led, pit stops, points and retirement status.
export function buildDriverStats(race) {
  const records = (Array.isArray(race?.classification) ? race.classification : [])
    .filter((record) => record && record.IsDeleted !== true);

  const rows = records.map((record) => {
    const lapsComplete = numberOrNull(record.LapsComplete);
    const totalLaps = numberOrNull(race?.session?.totalLaps);
    const rawStatus = typeof record.Status === 'string' ? record.Status.trim() : '';
    const status = rawStatus !== '' && rawStatus !== '0' && rawStatus !== '--' ? rawStatus : null;
    // Records without any lifecycle fields (older payload shapes) are treated
    // as classified finishers rather than inventing retirements.
    const finished = lapsComplete == null && status == null
      ? true
      : lapsComplete != null && totalLaps != null
        ? lapsComplete >= totalLaps
        : status === 'Running';
    let dnfReason = null;
    if (!finished) {
      dnfReason = lapsComplete === 0 ? 'Did not start' : (status ?? 'Retired');
    }
    return {
      carNumber: carKey(record.CarNumber),
      driverName: displayName(record),
      teamName: record.TeamName ?? null,
      finishPosition: numberOrNull(record.PositionFinish),
      startPosition: numberOrNull(record.PositionStart),
      bestLapSeconds: parseLapTime(record.BestLapTime),
      bestSpeedMph: numberOrNull(record.BestSpeed),
      averageSpeedMph: numberOrNull(record.SpeedAvg),
      lapsLed: numberOrNull(record.LapsLed) ?? 0,
      timesLed: numberOrNull(record.TimesLed) ?? 0,
      pitStops: numberOrNull(record.PitStops),
      points: numberOrNull(record.PointsEarned),
      status,
      lapsComplete,
      elapsedSeconds: parseDuration(record.ElapsedTime),
      finished,
      dnfReason,
    };
  }).sort((first, second) => (
    (first.finishPosition ?? Infinity) - (second.finishPosition ?? Infinity)
    || (first.startPosition ?? Infinity) - (second.startPosition ?? Infinity)
    || first.driverName.localeCompare(second.driverName)
  ));

  const finishers = rows.filter((row) => row.finished);
  const retirements = rows.filter((row) => !row.finished);
  const winner = finishers.find((row) => row.finishPosition === 1) ?? finishers[0] ?? null;
  const fastest = rows.filter((row) => row.bestLapSeconds != null)
    .sort((first, second) => first.bestLapSeconds - second.bestLapSeconds)[0] ?? null;

  return { rows, finishers, retirements, winner, fastest };
}

// Podium, pole and retirement summary for the end of the race. Reads the
// derived podium/pole when present and falls back to the classification.
export function buildFinishSummary(race) {
  const stats = buildDriverStats(race);
  const podium = (Array.isArray(race?.podium) ? race.podium : []).map((entry) => ({
    position: numberOrNull(entry?.pos),
    carNumber: carKey(entry?.car),
    driverName: entry?.driver ?? null,
    teamName: entry?.team ?? null,
    started: numberOrNull(entry?.started),
    lapsLed: numberOrNull(entry?.lapsLed) ?? 0,
  }));

  const pole = race?.pole
    ? {
      carNumber: carKey(race.pole.car),
      driverName: race.pole.driver ?? null,
    }
    : (() => {
      const polesitter = stats.rows
        .filter((row) => row.startPosition === 1)
        .sort((first, second) => (first.finishPosition ?? Infinity) - (second.finishPosition ?? Infinity))[0];
      return polesitter
        ? { carNumber: polesitter.carNumber, driverName: polesitter.driverName }
        : null;
    })();

  return {
    podium,
    pole,
    winner: stats.winner,
    fastestLap: stats.fastest
      ? {
        driverName: stats.fastest.driverName,
        carNumber: stats.fastest.carNumber,
        seconds: stats.fastest.bestLapSeconds,
        speedMph: stats.fastest.bestSpeedMph,
      }
      : null,
    finishedCount: stats.finishers.length,
    retirements: stats.retirements,
  };
}
