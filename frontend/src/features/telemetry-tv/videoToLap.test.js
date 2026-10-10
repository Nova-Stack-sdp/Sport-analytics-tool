import {
  buildLapCalibration,
  lapFromVideoSeconds,
  raceStartVideoSeconds,
  videoSecondsForLap,
} from './videoToLap';

// Real Toronto clock model: checkpoints arrive out of chronological order and
// the label is the only place the lap number lives.
const TORONTO_RACE = {
  session: { totalLaps: 90 },
  clock: {
    checkpoints: [
      { event: 'Green flag (start of timing)', videoSeconds: 184 },
      { event: 'Lap 1 complete', videoSeconds: 248 },
      { event: 'Lead change: Palou, Alex takes P1 (lap 4)', videoSeconds: 481 },
      { event: 'Half-distance (lap 45)', videoSeconds: 3780 },
      { event: 'Caution 1 starts (lap 3)', videoSeconds: 312 },
      { event: 'Caution 5 starts (lap 88)', videoSeconds: 6432 },
      { event: 'Checkered flag (winner crosses)', videoSeconds: 6688 },
    ],
  },
};

describe('buildLapCalibration', () => {
  test('sorts checkpoints by time and turns labels into the lap in progress', () => {
    const calibration = buildLapCalibration(TORONTO_RACE);

    expect(calibration.totalLaps).toBe(90);
    expect(calibration.points).toEqual([
      { videoSeconds: 184, lap: 1 },
      { videoSeconds: 248, lap: 2 },
      { videoSeconds: 312, lap: 3 },
      { videoSeconds: 481, lap: 4 },
      { videoSeconds: 3780, lap: 45 },
      { videoSeconds: 6432, lap: 88 },
      { videoSeconds: 6688, lap: 91 },
    ]);
  });

  test('drops duplicate laps, unlabelled entries, and non-monotonic values', () => {
    const calibration = buildLapCalibration({
      session: { totalLaps: 5 },
      clock: {
        checkpoints: [
          { event: 'Green flag (start of timing)', videoSeconds: 100 },
          { event: 'Caution 1 starts (lap 2)', videoSeconds: 200 },
          { event: 'Caution 2 starts (lap 2)', videoSeconds: 260 },
          { event: 'Track note without a lap', videoSeconds: 300 },
          { event: 'Checkered flag (winner crosses)', videoSeconds: 400 },
        ],
      },
    });

    expect(calibration.points).toEqual([
      { videoSeconds: 100, lap: 1 },
      { videoSeconds: 200, lap: 2 },
      { videoSeconds: 400, lap: 6 },
    ]);
  });

  test('prefers a curated lapCalibration array when the race ships one', () => {
    const calibration = buildLapCalibration({
      session: { totalLaps: 90 },
      lapCalibration: [
        { video_s: 535, lap: 1 },
        { video_s: 1957, lap: 21 },
        { video_s: 2625, lap: 30 },
      ],
      clock: { checkpoints: [{ event: 'Green flag (start of timing)', videoSeconds: 184 }] },
    });

    expect(calibration.points).toEqual([
      { videoSeconds: 535, lap: 1 },
      { videoSeconds: 1957, lap: 21 },
      { videoSeconds: 2625, lap: 30 },
    ]);
  });

  test('returns null when fewer than two usable points exist', () => {
    expect(buildLapCalibration({ session: { totalLaps: 2 } })).toBeNull();
    expect(buildLapCalibration({
      session: { totalLaps: 2 },
      clock: { checkpoints: [{ event: 'Green flag (start of timing)', videoSeconds: 100 }] },
    })).toBeNull();
  });
});

describe('raceStartVideoSeconds', () => {
  test('returns the first calibration point — the green-flag second', () => {
    expect(raceStartVideoSeconds(TORONTO_RACE)).toBe(184);
    expect(raceStartVideoSeconds({
      session: { totalLaps: 90 },
      lapCalibration: [
        { video_s: 535, lap: 1 },
        { video_s: 1957, lap: 21 },
      ],
    })).toBe(535);
  });

  test('returns null when the race has no usable calibration', () => {
    expect(raceStartVideoSeconds({ session: { totalLaps: 2 } })).toBeNull();
    expect(raceStartVideoSeconds(null)).toBeNull();
  });
});

describe('lapFromVideoSeconds', () => {
  test('clamps before the green flag and after the checkered flag', () => {
    expect(lapFromVideoSeconds(TORONTO_RACE, 100)).toBe(1);
    expect(lapFromVideoSeconds(TORONTO_RACE, 184)).toBe(1);
    expect(lapFromVideoSeconds(TORONTO_RACE, 6688)).toBe(90);
    expect(lapFromVideoSeconds(TORONTO_RACE, 7000)).toBe(90);
  });

  test('advances to the next lap exactly when a lap completes', () => {
    expect(lapFromVideoSeconds(TORONTO_RACE, 248)).toBe(2);
    expect(lapFromVideoSeconds(TORONTO_RACE, 312)).toBe(3);
  });

  test('interpolates between checkpoints', () => {
    // Halfway between "lap 1 complete" (lap 2) and the lap 3 caution.
    expect(lapFromVideoSeconds(TORONTO_RACE, 280)).toBe(2);
    // Midpoint between the lap 4 lead change and half distance (lap 45).
    expect(lapFromVideoSeconds(TORONTO_RACE, 2130.5)).toBe(24);
  });

  test('returns null when the race has no usable calibration', () => {
    expect(lapFromVideoSeconds({ session: { totalLaps: 2 } }, 300)).toBeNull();
    expect(lapFromVideoSeconds(TORONTO_RACE, null)).toBeNull();
  });
});

describe('videoSecondsForLap', () => {
  test('returns checkpoint times for checkpoint laps', () => {
    expect(videoSecondsForLap(TORONTO_RACE, 1)).toBe(184);
    expect(videoSecondsForLap(TORONTO_RACE, 3)).toBe(312);
    expect(videoSecondsForLap(TORONTO_RACE, 4)).toBe(481);
    expect(videoSecondsForLap(TORONTO_RACE, 45)).toBe(3780);
    expect(videoSecondsForLap(TORONTO_RACE, 88)).toBe(6432);
  });

  test('inverts the interpolation for laps without a checkpoint', () => {
    expect(videoSecondsForLap(TORONTO_RACE, 20)).toBeCloseTo(1768.5, 0);
    expect(videoSecondsForLap(TORONTO_RACE, 90)).toBeCloseTo(6602.7, 0);
  });

  test('clamps laps outside the race distance', () => {
    expect(videoSecondsForLap(TORONTO_RACE, 0)).toBe(184);
    expect(videoSecondsForLap(TORONTO_RACE, 91)).toBeCloseTo(6602.7, 0);
  });

  test('returns null when the race has no usable calibration', () => {
    expect(videoSecondsForLap({ session: { totalLaps: 2 } }, 1)).toBeNull();
    expect(videoSecondsForLap(TORONTO_RACE, null)).toBeNull();
  });
});
