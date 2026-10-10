import { buildPaceGauge } from './paceGauge';

// lapTrend-shaped input: only the fields the model reads are present.
function trend(records, totalLaps) {
  return { records, totalLaps: totalLaps ?? records[records.length - 1]?.lap ?? 0 };
}

describe('buildPaceGauge', () => {
  test('places the selected lap on the dial and bands the scale it spans', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.0, flag: 'Green' },
        { lap: 3, lapSeconds: 65.0, flag: 'Green' },
      ]),
      3
    );

    expect(gauge.fastest).toEqual({ lap: 2, seconds: 63.0, speedMph: null });
    expect(gauge.slowestSeconds).toBe(65.0);
    expect(gauge.selected).toEqual({ lap: 3, seconds: 65.0, flag: 'Green', deltaToFastest: 2 });
    // Bands always start at the fastest lap and end at the slowest, so the
    // needle always has a scale under it to explain its colour.
    expect(gauge.bands[0].tone).toBe('pace');
    expect(gauge.bands[0].from).toBe(63.0);
    expect(gauge.bands[0].to).toBeCloseTo(63.7, 6);
    expect(gauge.bands[2].tone).toBe('caution');
    expect(gauge.bands[2].from).toBeCloseTo(64.4, 6);
    expect(gauge.bands[2].to).toBe(65.0);
    // The dial keeps air at both ends instead of pegging the needle.
    expect(gauge.needle.min).toBeLessThan(63.0);
    expect(gauge.needle.max).toBeGreaterThan(65.0);
    expect(gauge.needle.fraction).toBe(1);
    expect(gauge.needle.tone).toBe('caution');
  });

  test('never quotes a lap beyond the cursor (spoiler guard)', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: 60.0, flag: 'Green' },
      ]),
      1
    );

    expect(gauge.fastest).toEqual({ lap: 1, seconds: 64.0, speedMph: null });
    expect(gauge.slowestSeconds).toBe(64.0);
    expect(gauge.bars).toHaveLength(1);
    expect(gauge.isFinished).toBe(false);
  });

  test('marks a yellow-flag lap as caution however quick it was', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.5, flag: 'Yellow' },
      ]),
      2
    );

    expect(gauge.needle.tone).toBe('caution');
  });

  test('leaves a mid-range green lap neutral rather than calling it off the pace', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 66.0, flag: 'Green' },
        { lap: 2, lapSeconds: 60.0, flag: 'Green' },
        { lap: 3, lapSeconds: 63.0, flag: 'Green' },
      ]),
      3
    );

    expect(gauge.needle.tone).toBe('neutral');
  });

  test('tallest bar is the fastest lap and the strip follows the flag', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.0, flag: 'Yellow' },
        { lap: 3, lapSeconds: 65.0, flag: 'Checker' },
      ]),
      3
    );

    expect(gauge.bars.map((bar) => bar.isFastest)).toEqual([false, true, false]);
    expect(gauge.bars.map((bar) => bar.flag)).toEqual(['Green', 'Yellow', 'Checker']);
    // Faster lap, taller bar: the strip is still readable as pace.
    expect(gauge.bars[1].percent).toBeGreaterThan(gauge.bars[0].percent);
    expect(gauge.bars[0].percent).toBeGreaterThan(gauge.bars[2].percent);
    expect(gauge.bars[2].percent).toBeLessThanOrEqual(100);
  });

  test('reads the green-flag average off the green laps alone', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 60.0, flag: 'Green' },
        { lap: 2, lapSeconds: 70.0, flag: 'Yellow' },
        { lap: 3, lapSeconds: 64.0, flag: 'Green' },
      ]),
      3
    );

    expect(gauge.greenLaps).toBe(2);
    expect(gauge.greenAverageSeconds).toBe(62);
    expect(gauge.averageSeconds).toBeCloseTo(64.6667, 3);
    expect(gauge.timedLaps).toBe(3);
  });

  test('keeps untimed laps out of the maths but visible in the cursor scale', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: null, flag: 'Yellow' },
        { lap: 3, lapSeconds: 65.0, flag: 'Green' },
      ], 3),
      3
    );

    expect(gauge.bars.map((bar) => bar.lap)).toEqual([1, 3]);
    expect(gauge.timedLaps).toBe(2);
    expect(gauge.runLaps).toBe(3);
    expect(gauge.cursorPercent).toBeCloseTo(83.333, 3);
  });

  test('a selected lap without a time parks the needle instead of guessing', () => {
    const gauge = buildPaceGauge(
      trend([
        { lap: 1, lapSeconds: 64.0, flag: 'Green' },
        { lap: 2, lapSeconds: null, flag: 'Yellow' },
      ], 2),
      2
    );

    expect(gauge.selected).toEqual({ lap: 2, seconds: null, flag: 'Yellow', deltaToFastest: null });
    expect(gauge.needle.value).toBeNull();
    expect(gauge.needle.tone).toBe('neutral');
  });

  test('the fastest lap is only "of the race" once the checkered lap is run', () => {
    const running = buildPaceGauge(trend([{ lap: 1, lapSeconds: 64.0 }], 90), 1);
    const finished = buildPaceGauge(trend([{ lap: 90, lapSeconds: 64.0 }], 90), 90);

    expect(running.isFinished).toBe(false);
    expect(finished.isFinished).toBe(true);
  });

  test('returns null when the broadcast has run no timed lap yet', () => {
    expect(buildPaceGauge(null, 1)).toBeNull();
    expect(buildPaceGauge(trend([], 0), 1)).toBeNull();
    expect(buildPaceGauge(trend([{ lap: 1, lapSeconds: null }], 1), 1)).toBeNull();
  });
});
