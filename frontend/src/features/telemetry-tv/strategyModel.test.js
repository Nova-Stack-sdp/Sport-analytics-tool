import { buildStrategyModel } from './strategyModel';

// lapTrend-shaped records: lap, lapSeconds, flag. Only the fields the model
// reads are present.
function trend(...records) {
  return { records };
}

describe('buildStrategyModel', () => {
  test('reads the selected lap against the fastest lap so far', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 64.2, flag: 'Green' },
        { lap: 2, lapSeconds: 63.5, flag: 'Green' },
        { lap: 3, lapSeconds: 63.9, flag: 'Green' }
      ),
      lap: 3,
    });

    expect(model.fastest).toEqual({ lap: 2, seconds: 63.5 });
    expect(model.paceDelta).toEqual({ seconds: 0.4, isFastest: false });
  });

  test('flags the selected lap itself when it is the fastest so far', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 64.2, flag: 'Green' },
        { lap: 2, lapSeconds: 63.5, flag: 'Green' }
      ),
      lap: 2,
    });

    expect(model.paceDelta).toEqual({ seconds: 0, isFastest: true });
  });

  test('never quotes laps beyond the selected lap (spoiler guard)', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 64.2, flag: 'Green' },
        { lap: 2, lapSeconds: 60.0, flag: 'Green' }
      ),
      lap: 1,
    });

    expect(model.fastest).toEqual({ lap: 1, seconds: 64.2 });
    expect(model.paceDelta).toEqual({ seconds: 0, isFastest: true });
  });

  test('reads tyre degradation as late-run drift across the current green run', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 63.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.1, flag: 'Green' },
        { lap: 3, lapSeconds: 63.2, flag: 'Green' },
        { lap: 4, lapSeconds: 63.4, flag: 'Green' }
      ),
      lap: 4,
    });

    expect(model.tyre.status).toBe('degrading');
    expect(model.tyre.drift).toBeCloseTo(0.25, 3);
    expect(model.tyre.fromLap).toBe(1);
    expect(model.tyre.toLap).toBe(4);
  });

  test('reads a steady run as holding pace', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 63.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.05, flag: 'Green' },
        { lap: 3, lapSeconds: 63.1, flag: 'Green' },
        { lap: 4, lapSeconds: 63.0, flag: 'Green' }
      ),
      lap: 4,
    });

    expect(model.tyre.status).toBe('holding');
  });

  test('a caution resets the run: only green laps after it are compared', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 63.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.1, flag: 'Green' },
        { lap: 3, lapSeconds: 70.0, flag: 'Yellow' },
        { lap: 4, lapSeconds: 64.5, flag: 'Green' },
        { lap: 5, lapSeconds: 64.6, flag: 'Green' },
        { lap: 6, lapSeconds: 64.5, flag: 'Green' },
        { lap: 7, lapSeconds: 65.2, flag: 'Green' }
      ),
      lap: 7,
      cautions: [{ to: 3 }],
    });

    expect(model.tyre.fromLap).toBe(4);
    expect(model.tyre.toLap).toBe(7);
    expect(model.tyre.status).toBe('degrading');
  });

  test('fewer than four green laps in the run is not enough to call', () => {
    const model = buildStrategyModel({
      lapTrend: trend(
        { lap: 1, lapSeconds: 63.0, flag: 'Green' },
        { lap: 2, lapSeconds: 63.1, flag: 'Green' },
        { lap: 3, lapSeconds: 63.2, flag: 'Green' }
      ),
      lap: 3,
    });

    expect(model.tyre).toEqual({ status: 'insufficient', drift: null, fromLap: null, toLap: null });
  });

  test('measures the pit window from the most recent visible stop', () => {
    const model = buildStrategyModel({
      lapTrend: trend({ lap: 1, lapSeconds: 63.0, flag: 'Green' }),
      lap: 12,
      pitStops: [
        { raceLap: 4, driver: 'O’Ward', car: '5' },
        { raceLap: 9, driver: 'Herta', car: '26' },
      ],
    });

    expect(model.pit).toEqual({
      lapsSinceLastStop: 3,
      lastStopLap: 9,
      lastStopDriver: 'Herta',
      lastStopCar: '26',
      totalStops: 2,
    });
  });

  test('ignores stops after the selected lap and reports an opening stint with none', () => {
    const before = buildStrategyModel({
      lapTrend: trend({ lap: 1, lapSeconds: 63.0, flag: 'Green' }),
      lap: 2,
      pitStops: [{ raceLap: 4, driver: 'O’Ward', car: '5' }],
    });
    expect(before.pit).toEqual({
      lapsSinceLastStop: null,
      lastStopLap: null,
      lastStopDriver: null,
      lastStopCar: null,
      totalStops: 0,
    });

    const none = buildStrategyModel({ lapTrend: trend(), lap: 5 });
    expect(none.pit.lapsSinceLastStop).toBeNull();
    expect(none.paceDelta).toBeNull();
    expect(none.fastest).toBeNull();
  });
});
