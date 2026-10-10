// Maps the embedded broadcast video's clock to the race lap cursor.
// The page feeds it getCurrentTime seconds from the YouTube player and it
// returns the lap that was running at that video moment, using the
// calibration points the race payload already carries (clock.checkpoints) or
// the curated lapCalibration array when a race ships one.

// The shipped clock.checkpoints are built as embedStartSeconds + race clock,
// treating race.video.embedStartSeconds as the green flag. Races with curated
// broadcast anchors (Toronto) ship a lapCalibration array instead, and that
// always wins, so this constant only ever touches the rough shipped clock. If
// an in-player check shows a shipped-clock race still reads offset (the curated
// Toronto anchors place the green flag at 535 s while the shipped model says
// 184 s, a 351 s difference), set this to the gap and every checkpoint shifts
// together. 0 = trust the shipped clock model. The video time readout in the
// playback status bar makes that check a five-second job.
export const GREEN_FLAG_VIDEO_SHIFT_SECONDS = 0;

function raceTotalLaps(race) {
  const total = Number(race?.session?.totalLaps ?? race?.totalLaps);
  return Number.isFinite(total) && total > 0 ? total : null;
}

// Checkpoint labels look like "Green flag (start of timing)", "Lap 1 complete",
// "Lead change: X takes P1 (lap 4)", "Caution 3 starts (lap 30)" and
// "Checkered flag (winner crosses)". Values are "the lap in progress at that
// moment" so the curve is strictly increasing: finishing lap N starts lap N+1.
function lapValueForLabel(label, totalLaps) {
  if (typeof label !== 'string') return null;
  if (/checkered/i.test(label)) return totalLaps == null ? null : totalLaps + 1;
  if (/green flag/i.test(label)) return 1;
  const completed = label.match(/lap\s+(\d+)\s+complete/i);
  if (completed) return Number(completed[1]) + 1;
  const stated = label.match(/\(lap\s+(\d+)\)/i);
  return stated ? Number(stated[1]) : null;
}

export function buildLapCalibration(race) {
  const totalLaps = raceTotalLaps(race);
  const curated = Array.isArray(race?.lapCalibration) ? race.lapCalibration : null;

  const points = curated
    ? curated.map((entry) => ({
      videoSeconds: Number(entry?.video_s ?? entry?.videoSeconds),
      lap: Number(entry?.lap),
    }))
    : (Array.isArray(race?.clock?.checkpoints) ? race.clock.checkpoints : []).map((checkpoint) => ({
      videoSeconds: Number(checkpoint?.videoSeconds) + GREEN_FLAG_VIDEO_SHIFT_SECONDS,
      lap: lapValueForLabel(checkpoint?.event, totalLaps),
    }));

  const sorted = points
    .filter((point) => Number.isFinite(point.videoSeconds)
      && Number.isFinite(point.lap)
      && point.lap >= 1)
    .sort((first, second) => first.videoSeconds - second.videoSeconds);

  // Interpolation needs a strictly increasing curve: duplicate or out-of-order
  // lap values (two events on one lap, noisy labels) are dropped.
  const monotonic = [];
  for (const point of sorted) {
    const previous = monotonic[monotonic.length - 1];
    if (!previous || point.lap > previous.lap) monotonic.push(point);
  }

  if (monotonic.length < 2) return null;
  const lastLap = monotonic[monotonic.length - 1].lap;
  return { points: monotonic, totalLaps: totalLaps ?? Math.floor(lastLap) };
}

// Video second at which the race itself starts: the green flag, i.e. the
// calibration's first point (lap 1 in progress). Everything the player shows
// before it is build-up — grid walk, intros, formation laps — so the page
// waits rather than reporting a race that has not begun. Null when the race
// ships no usable calibration: with no known start to wait for, callers keep
// the always-on behaviour.
export function raceStartVideoSeconds(race) {
  const calibration = buildLapCalibration(race);
  return calibration ? calibration.points[0].videoSeconds : null;
}

// Lap running at the given video second, clamped to the race distance. Null
// when the race ships no usable calibration, so callers can fall back to the
// manual lap cursor.
export function lapFromVideoSeconds(race, videoSeconds) {
  const calibration = buildLapCalibration(race);
  if (!calibration || videoSeconds == null) return null;
  const seconds = Number(videoSeconds);
  if (!Number.isFinite(seconds)) return null;

  const { points, totalLaps } = calibration;
  const first = points[0];
  const last = points[points.length - 1];
  let lapValue = first.lap;

  if (seconds >= last.videoSeconds) {
    lapValue = last.lap;
  } else if (seconds > first.videoSeconds) {
    for (let index = 1; index < points.length; index++) {
      const before = points[index - 1];
      const after = points[index];
      if (seconds > after.videoSeconds) continue;
      const span = after.videoSeconds - before.videoSeconds;
      lapValue = span <= 0
        ? after.lap
        : before.lap + ((seconds - before.videoSeconds) / span) * (after.lap - before.lap);
      break;
    }
  }

  const lap = Math.floor(lapValue);
  return Math.min(Math.max(lap, 1), totalLaps);
}

// Video second at which the given lap starts: the inverse of
// lapFromVideoSeconds, used to seek the player when the user drags the slider.
export function videoSecondsForLap(race, lap) {
  const calibration = buildLapCalibration(race);
  if (!calibration || lap == null) return null;
  const target = Math.floor(Number(lap));
  if (!Number.isFinite(target)) return null;

  const { points, totalLaps } = calibration;
  const first = points[0];
  const last = points[points.length - 1];
  const clampedLap = Math.min(Math.max(target, 1), totalLaps);
  if (clampedLap <= first.lap) return first.videoSeconds;
  if (clampedLap >= last.lap) return last.videoSeconds;

  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1];
    const after = points[index];
    if (clampedLap > after.lap) continue;
    const span = after.lap - before.lap;
    if (span <= 0) return after.videoSeconds;
    const ratio = (clampedLap - before.lap) / span;
    return before.videoSeconds + ratio * (after.videoSeconds - before.videoSeconds);
  }
  return last.videoSeconds;
}
