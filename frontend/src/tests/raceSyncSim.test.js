import {
  anyTweakActive,
  DEFAULT_TWEAK,
  fitRaceModel,
  pitCallAtLap,
  pitCallsAtLap,
  simDriverAtLap,
  simGapAtLap,
  simPositionAtLap,
  simulateRace,
  simSummaryAtLap,
  tweakIsNoop,
} from '../components/race-sync/raceSyncSim';

// A twelve-lap three-car race in the series' own column shape (one array per
// measure, indexed by lap - 1). Every stint is exactly linear — soft laps gain
// a tenth per lap of age, mediums two hundredths, hards three — so the fits
// recover their slopes to the thousandth and the re-pricing arithmetic can be
// asserted by hand. Stops carry a 22-second in-lap. Leclerc and Piastri run
// soft-medium strategies two hundredths apart on pace; Verstappen's hard
// middle stint drops him to the rear at the flag.
const linearStint = (base, perLap, count, { pitLoss = 0 } = {}) =>
  Array.from(
    { length: count },
    (_, i) => Math.round((base + perLap * i + (i === count - 1 ? pitLoss : 0)) * 1000) / 1000
  );

function leclerc(overrides = {}) {
  return {
    entryId: 'e1',
    driverName: 'Charles LECLERC',
    teamName: 'Ferrari',
    lapTimeSeconds: [
      ...linearStint(80.0, 0.1, 6, { pitLoss: 22 }), // soft, stop at the end of lap 6
      ...linearStint(81.0, 0.02, 6), // medium to the flag
    ],
    position: [2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1],
    compound: [...Array(6).fill('SOFT'), ...Array(6).fill('MEDIUM')],
    stintNumber: [...Array(6).fill(1), ...Array(6).fill(2)],
    ...overrides,
  };
}

function piastri(overrides = {}) {
  return {
    entryId: 'e2',
    driverName: 'Oscar PIASTRI',
    teamName: 'McLaren',
    lapTimeSeconds: [
      ...linearStint(80.02, 0.1, 6, { pitLoss: 22 }),
      ...linearStint(81.01, 0.02, 6),
    ],
    position: [3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2],
    compound: [...Array(6).fill('SOFT'), ...Array(6).fill('MEDIUM')],
    stintNumber: [...Array(6).fill(1), ...Array(6).fill(2)],
    ...overrides,
  };
}

function verstappen(overrides = {}) {
  return {
    entryId: 'e3',
    driverName: 'Max VERSTAPPEN',
    teamName: 'Red Bull Racing',
    lapTimeSeconds: [
      ...linearStint(79.8, 0.1, 5, { pitLoss: 22 }), // soft, stop at the end of lap 5
      ...linearStint(81.2, 0.03, 7), // hard to the flag
    ],
    position: [1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3],
    compound: [...Array(5).fill('SOFT'), ...Array(7).fill('HARD')],
    stintNumber: [...Array(5).fill(1), ...Array(7).fill(2)],
    ...overrides,
  };
}

const series = (drivers = [leclerc(), piastri(), verstappen()]) => ({
  totalLaps: 12,
  drivers,
});

// The summary names trade partners through the drivers' own identity fields.
const driversById = (sim) =>
  new Map([...sim.drivers.values()].map((driver) => [driver.entryId, driver]));

describe('the simulation model', () => {
  test('wear is the field\'s own per-compound slope, fitted from clean laps only', () => {
    const model = fitRaceModel(series().drivers, 12);
    // Medium and hard are exact: every lap sits on a line of the same slope.
    expect(model.degradation.medium).toBeCloseTo(0.02, 5);
    expect(model.degradation.hard).toBeCloseTo(0.03, 5);
    // Soft pools three drivers of different pace whose stints also have
    // different lengths, and pooled least squares answers that mix honestly:
    // the quicker cars' soft stints run one lap longer, which tilts the
    // fitted slope off the per-line 0.10 by leverage, not by error.
    expect(model.degradation.soft).toBeCloseTo(0.1116667, 5);
    // Fourteen soft laps vote — five, five and four; twelve medium; seven
    // hard. The three in-laps are pit loss, not wear, and stay out of the fit.
    expect(model.fitSamples).toEqual({ soft: 14, medium: 12, hard: 7 });
  });

  test('the pit loss is the median in-lap residual, about the 22s the fixture bakes in', () => {
    const model = fitRaceModel(series().drivers, 12);
    expect(model.stopSamples).toBe(2);
    expect(model.pitLoss).toBeCloseTo(22, 0);
  });

  test('a tweak with nothing in it is a no-op; one active tweak is easy to spot', () => {
    expect(tweakIsNoop(DEFAULT_TWEAK)).toBe(true);
    expect(tweakIsNoop(null)).toBe(true);
    expect(tweakIsNoop({ pitShift: -2 })).toBe(false);
    expect(tweakIsNoop({ paceDelta: 0.1 })).toBe(false);
    expect(anyTweakActive({})).toBe(false);
    expect(anyTweakActive({ e1: DEFAULT_TWEAK, e2: { pitShift: 1 } })).toBe(true);
  });
});

describe('a race re-run untouched', () => {
  test('no tweak re-prices nothing, exactly', () => {
    const sim = simulateRace(series());
    expect(sim.tweaked).toEqual([]);
    for (const entryId of ['e1', 'e2', 'e3']) {
      const driver = sim.drivers.get(entryId);
      expect(driver.simCumulative).toEqual(driver.baseCumulative);
      expect(driver.deltaVsBaseline.every((delta) => delta === 0)).toBe(true);
      expect(sim.simPositions.get(entryId)).toEqual(sim.basePositions.get(entryId));
    }
  });

  test('positions come from cumulative race time, and the order at the flag holds', () => {
    const sim = simulateRace(series());
    expect(simPositionAtLap(sim, 'e1', 12)).toBe(1);
    expect(simPositionAtLap(sim, 'e2', 12)).toBe(2);
    expect(simPositionAtLap(sim, 'e3', 12)).toBe(3);
    expect(simGapAtLap(sim, 'e1', 12)).toEqual({ sim: 0, base: 0 });
  });

  test('the sim is a pure function of the race and the tweaks — the seed changes nothing yet', () => {
    const tweaks = { e1: { pitShift: -2, paceDelta: 0 } };
    const first = simulateRace(series(), tweaks, 1);
    const second = simulateRace(series(), tweaks, 999);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test('a series with no race in it has no sim', () => {
    expect(simulateRace(null)).toBeNull();
    expect(simulateRace({ totalLaps: 0, drivers: [leclerc()] })).toBeNull();
  });
});

describe('moving a stop', () => {
  const moved = () => simulateRace(series(), { e1: { pitShift: -2, paceDelta: 0 } });

  test('the stop lands two laps earlier and everything before it is untouched', () => {
    const sim = moved();
    const driver = sim.drivers.get('e1');
    expect(driver.newStopLaps).toEqual([5]);
    expect(driver.simLapTimes.slice(0, 3)).toEqual(leclerc().lapTimeSeconds.slice(0, 3));
  });

  test('the pit loss relocates to the new in-lap and leaves the old one', () => {
    const sim = moved();
    const { pitLoss } = sim.model;
    const driver = sim.drivers.get('e1');
    // Lap 4 is the new in-lap: same soft tyre, same age — only the loss moves in.
    expect(driver.simLapTimes[3] - 80.3).toBeCloseTo(pitLoss, 5);
    // Lap 5 is now a medium lap: the driver's own soft→medium price (+0.75)
    // less the wear of running a lap younger on it.
    expect(driver.simLapTimes[4]).toBeCloseTo(80.42 + 0.75 - 0.08, 5);
    // Lap 6 keeps its logged lap, sheds the loss, and pays the same compound price.
    expect(driver.simLapTimes[5]).toBeCloseTo(102.5 + 0.67 - pitLoss, 5);
    // From lap 7 on the compound is real; the medium stint simply runs two
    // laps older than it did: +0.04 a lap.
    expect(driver.simLapTimes[6]).toBeCloseTo(81.04, 5);
    // Across the race the loss cancels — only compound and wear remain:
    // two soft laps re-priced onto mediums (+0.75 each, less the wear of
    // running a lap younger on them) and six medium laps run two laps older.
    const total = driver.simLapTimes.reduce(
      (sum, value, i) => sum + (value - leclerc().lapTimeSeconds[i]),
      0
    );
    expect(total).toBeCloseTo(1.58, 5);
    expect(driver.deltaVsBaseline[11]).toBeCloseTo(1.58, 5);
  });

  test('an over-eager stop costs real time and the position with it', () => {
    const sim = moved();
    const summary = simSummaryAtLap(sim, 'e1', driversById(sim), 12);
    expect(summary.raceDelta).toBeCloseTo(1.58, 5);
    expect(summary.currentSimPos).toBe(3);
    expect(summary.currentBasePos).toBe(1);
    // The divergence surfaces the moment the pit loss relocates: lap 4, when
    // the early stop is served, drops Leclerc behind Piastri.
    expect(summary.swing).toMatchObject({
      lap: 4,
      from: 2,
      to: 3,
      places: -1,
      tradedWith: 'e2',
      tradedName: 'Oscar PIASTRI',
      tradedTeam: 'McLaren',
    });
    expect(summary.nextStop).toBeNull();
    expect(summary.compoundKeys).toEqual(['soft', 'medium']);
  });

  test('mid-race, the briefing speaks only of the stop still to come', () => {
    const sim = moved();
    const summary = simSummaryAtLap(sim, 'e1', driversById(sim), 2);
    expect(summary.raceDelta).toBe(0);
    expect(summary.swing).toBeNull();
    expect(summary).toMatchObject({ nextStop: 5, nextStopDelta: -2 });
  });

  test('a shift past the race end clamps to real laps, never fantasy ones', () => {
    const late = simulateRace(series(), { e1: { pitShift: 99, paceDelta: 0 } });
    expect(late.drivers.get('e1').newStopLaps).toEqual([12]);

    // A three-stint car asked to stop ten laps earlier: the first stop clamps
    // to lap 2 and the second must still follow it, at lap 3.
    const threeStints = piastri({
      lapTimeSeconds: [
        ...linearStint(80.0, 0.1, 4, { pitLoss: 22 }),
        ...linearStint(81.0, 0.02, 4, { pitLoss: 22 }),
        ...linearStint(80.0, 0.1, 4),
      ],
      compound: [
        ...Array(4).fill('SOFT'),
        ...Array(4).fill('MEDIUM'),
        ...Array(4).fill('SOFT'),
      ],
      stintNumber: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    });
    const cramped = simulateRace(series([leclerc(), threeStints, verstappen()]), {
      e2: { pitShift: -10, paceDelta: 0 },
    });
    expect(cramped.drivers.get('e2').newStopLaps).toEqual([2, 3]);
  });
});

describe('the pace dial', () => {
  test('a harder push re-prices every timed lap and can win a position', () => {
    const sim = simulateRace(series(), { e2: { pitShift: 0, paceDelta: -0.05 } });
    const driver = sim.drivers.get('e2');
    expect(driver.simLapTimes[0]).toBeCloseTo(80.02 - 0.05, 5);
    expect(driver.simLapTimes[11]).toBeCloseTo(81.11 - 0.05, 5);

    const summary = simSummaryAtLap(sim, 'e2', driversById(sim), 12);
    expect(summary.raceDelta).toBeCloseTo(-0.6, 5);
    expect(summary.currentSimPos).toBe(1);
    expect(summary.swing).toMatchObject({
      from: 2,
      to: 1,
      places: 1,
      tradedWith: 'e1',
      tradedName: 'Charles LECLERC',
    });

    const gap = simGapAtLap(sim, 'e2', 12);
    expect(gap.sim).toBe(0);
    expect(gap.base).toBeCloseTo(0.18, 5);
  });
});

describe('the playhead projection', () => {
  test('nothing beyond the playhead exists; the schedule is whole-race knowledge', () => {
    const sim = simulateRace(series(), { e1: { pitShift: -2, paceDelta: 0 } });
    const driver = simDriverAtLap(sim, 'e1', 5);
    expect(driver.simLapTimes).toHaveLength(5);
    expect(driver.deltaVsBaseline).toHaveLength(5);
    expect(driver.newStopLaps).toEqual([5]);
    expect(simPositionAtLap(sim, 'e1', 0)).toBeNull();
    expect(simPositionAtLap(sim, 'e1', 99)).toBe(simPositionAtLap(sim, 'e1', 12));
    expect(simDriverAtLap(sim, 'e9', 5)).toBeNull();
  });
});

describe('a stoppage in the log', () => {
  const stopped = () =>
    simulateRace(
      series([
        leclerc(),
        piastri({
          lapTimeSeconds: piastri().lapTimeSeconds.map((value, i) =>
            i === 8 ? 1955.709 : value
          ),
        }),
        verstappen(),
      ])
    );

  test('a stoppage interval is never re-priced', () => {
    const sim = stopped();
    const driver = sim.drivers.get('e2');
    expect(driver.simLapTimes[8]).toBe(1955.709);
    expect(driver.simCumulative[8]).toBeUndefined();
  });

  test('a paused car holds no position on the stoppage lap and rejoins the order after it', () => {
    const sim = stopped();
    expect(simPositionAtLap(sim, 'e2', 9)).toBeNull();
    expect(simPositionAtLap(sim, 'e2', 10)).toBe(2);
  });
});

describe('the summary facts', () => {
  test('an untouched driver, an unknown driver, and a race not yet started have no story', () => {
    const sim = simulateRace(series(), { e1: { pitShift: -2, paceDelta: 0 } });
    expect(simSummaryAtLap(sim, 'e2', driversById(sim), 12)).toBeNull();
    expect(simSummaryAtLap(sim, 'e9', driversById(sim), 12)).toBeNull();
    expect(simSummaryAtLap(sim, 'e1', driversById(sim), 0)).toBeNull();
  });
});

describe('the pit calls', () => {
  // Leclerc really fitted his new set on lap 7 (in-lap 6). Two laps earlier
  // puts the new set on lap 5, so the in-lap is lap 4.
  const early = () => simulateRace(series(), { e1: { pitShift: -2, paceDelta: 0 } });

  test('the window opens three laps out and counts down without changing moment', () => {
    const sim = early();
    expect(pitCallAtLap(sim, 'e1', 1)).toMatchObject({ kind: 'window', tone: 'blue', lapsToGo: 3, stopLap: 5 });
    expect(pitCallAtLap(sim, 'e1', 3)).toMatchObject({ kind: 'window', tone: 'blue', lapsToGo: 1 });
  });

  test('the in-lap is the box call', () => {
    expect(pitCallAtLap(early(), 'e1', 4)).toMatchObject({ kind: 'box', tone: 'blue', stopLap: 5 });
  });

  test('an over-eager stop is called red once the car is back out, then the call clears', () => {
    const sim = early();
    const verdict = pitCallAtLap(sim, 'e1', 5);
    expect(verdict).toMatchObject({ kind: 'loss', tone: 'red', stopLap: 5 });
    expect(verdict.seconds).toBeGreaterThan(0);
    expect(pitCallAtLap(sim, 'e1', 6)).toMatchObject({ kind: 'loss' });
    expect(pitCallAtLap(sim, 'e1', 7)).toBeNull();
  });

  test('a stop that leaves the car ahead of its real race is called green', () => {
    // Piastri finds half a second a lap and keeps his real stop (new set on lap 7).
    const sim = simulateRace(series(), { e2: { pitShift: 0, paceDelta: -0.5 } });
    const verdict = pitCallAtLap(sim, 'e2', 7);
    expect(verdict).toMatchObject({ kind: 'gain', tone: 'green', stopLap: 7 });
    expect(verdict.places > 0 || verdict.seconds < 0).toBe(true);
  });

  test('an untouched driver and a race not yet started are never called', () => {
    const sim = early();
    expect(pitCallAtLap(sim, 'e2', 3)).toBeNull();
    expect(pitCallAtLap(sim, 'e1', 0)).toBeNull();
    expect(pitCallsAtLap(sim, 4)).toEqual([expect.objectContaining({ entryId: 'e1', kind: 'box' })]);
    expect(pitCallsAtLap(null, 4)).toEqual([]);
  });
});
