import { buildMomentumModel } from './momentumModel';

// lapTrend-shaped input: only the fields the model reads are present.
function trend(records) {
  return {
    records: records.map(([lap, gap]) => ({ lap, gapToLeaderSec: gap })),
    totalLaps: records.length ? records[records.length - 1][0] : 0,
  };
}

describe('buildMomentumModel', () => {
  test('reads a growing margin as the leader pulling away', () => {
    const model = buildMomentumModel(trend([[1, 1.0], [2, 1.8]]), 2);

    expect(model.current).toEqual({ lap: 2, gap: 1.8, previousGap: 1.0, delta: 0.8 });
    expect(model.direction).toBe('pulling');
    expect(model.tone).toBe('pace');
    expect(model.label).toBe('Pulling away');
    expect(model.readout).toBe('+0.8s');
    expect(model.fraction).toBeGreaterThan(0);
  });

  test('reads a shrinking margin as pressure on the leader', () => {
    const model = buildMomentumModel(trend([[1, 2.0], [2, 1.2]]), 2);

    expect(model.direction).toBe('pressure');
    expect(model.tone).toBe('caution');
    expect(model.readout).toBe('-0.8s');
    expect(model.fraction).toBeLessThan(0);
  });

  test('treats a sub-threshold wobble as holding steady, not a move', () => {
    const model = buildMomentumModel(trend([[1, 1.00], [2, 1.02]]), 2);

    expect(model.direction).toBe('holding');
    expect(model.tone).toBe('neutral');
    expect(model.readout).toBe('+0.0s');
  });

  test('scales against the widest swing already shown, with a floor', () => {
    const quiet = buildMomentumModel(trend([[1, 1.0], [2, 1.1]]), 2);
    const wild = buildMomentumModel(trend([[1, 1.0], [2, 2.0]]), 2);

    // A quiet race must not amplify a 0.1 s wobble into a full-scale swing.
    expect(quiet.span).toBe(0.25);
    expect(quiet.fraction).toBeLessThan(0.5);
    // A race that has swung two seconds puts the same reading nearer the peg.
    expect(wild.span).toBeCloseTo(1.0, 6);
    expect(wild.fraction).toBeCloseTo(1.0, 6);
  });

  test('never fabricates a step across a lap with no published margin', () => {
    const model = buildMomentumModel(trend([[1, 1.0], [2, null], [3, 3.5]]), 3);

    expect(model.samples).toHaveLength(0);
    expect(model.current).toEqual({ lap: 3, gap: 3.5, previousGap: null, delta: null });
    expect(model.readout).toBe('--');
    expect(model.fraction).toBe(0);
  });

  test('laps beyond the cursor never enter the dial (spoiler guard)', () => {
    const model = buildMomentumModel(trend([[1, 1.0], [2, 1.4], [3, 3.0]]), 2);

    expect(model.samples.map((sample) => sample.lap)).toEqual([2]);
    expect(model.span).toBe(0.4);
    expect(model.peakLap).toBe(2);
    expect(model.readout).toBe('+0.4s');
  });

  test('carries the readout detail in broadcast language', () => {
    const model = buildMomentumModel(trend([[1, 1.0], [2, 1.8]]), 2);

    expect(model.detail).toBe('Margin 1.8s · grew 0.80s on lap 2');
  });

  test('returns null when no lap has published a margin yet', () => {
    expect(buildMomentumModel(null, 1)).toBeNull();
    expect(buildMomentumModel(trend([]), 1)).toBeNull();
    expect(buildMomentumModel(trend([[1, null]]), 1)).toBeNull();
  });
});
