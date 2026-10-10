import {
  anyTweakActive,
  breaksCompoundRule,
  compoundChoices,
  DEFAULT_TWEAK,
  fitRaceModel,
  pitCallAtLap,
  pitCallsAtLap,
  simDriverAtLap,
  simGapAtLap,
  simPositionAtLap,
  simulateRace,
  simSummaryAtLap,
  stopLapBounds,
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
    // different lengths. The within-stint fit reads each stint against its own
    // mean, so the per-line 0.10 comes back exactly — a single line through
    // the pooled laps would tilt to 0.112 on the quicker cars' longer stints.
    expect(model.degradation.soft).toBeCloseTo(0.1, 9);
    // Lap 1 (a standing start), every in-lap and every out-lap stay out of the
    // fit: soft keeps laps 2-5, 2-5 and 2-4; medium laps 8-12 twice; hard 7-12.
    expect(model.fitSamples).toEqual({ soft: 11, medium: 10, hard: 6 });
  });

  test('the pit loss is the 22s the fixture bakes into each in-lap, and nothing on the out-lap', () => {
    const model = fitRaceModel(series().drivers, 12);
    // Three cars, one stop each, and every in-lap timed.
    expect(model.stopSamples).toBe(3);
    expect(model.pitInLoss).toBeCloseTo(22, 9);
    expect(model.pitOutLoss).toBeCloseTo(0, 9);
    expect(model.pitLoss).toBeCloseTo(22, 9);
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
    const driver = sim.drivers.get('e1');
    // The fixture is exact — soft laps are 79.9 + 0.1 x age for Leclerc,
    // mediums 80.98 + 0.02 x age — so every re-priced lap has a true value.
    // Lap 4 is the new in-lap: same soft tyre, same age — only the loss moves in.
    expect(driver.simLapTimes[3]).toBeCloseTo(80.3 + 22, 9);
    // Lap 5 is the new out-lap, on a fresh medium: 80.98 + 0.02.
    expect(driver.simLapTimes[4]).toBeCloseTo(81.0, 9);
    // Lap 6 sheds the old in-lap's loss and runs the medium at age 2.
    expect(driver.simLapTimes[5]).toBeCloseTo(81.02, 9);
    // From lap 7 the medium stint simply runs two laps older: +0.04 a lap.
    expect(driver.simLapTimes[6]).toBeCloseTo(81.04, 9);
    expect(driver.simLapTimes[11]).toBeCloseTo(81.14, 9);
    // Across the race the loss cancels; what remains is eight medium laps at
    // ages 1-8 and four softs, against six and six: +1.36s.
    const total = driver.simLapTimes.reduce(
      (sum, value, i) => sum + (value - leclerc().lapTimeSeconds[i]),
      0
    );
    expect(total).toBeCloseTo(1.36, 9);
    expect(driver.deltaVsBaseline[11]).toBeCloseTo(1.36, 9);
  });

  test('an over-eager stop costs real time and the position with it', () => {
    const sim = moved();
    const summary = simSummaryAtLap(sim, 'e1', driversById(sim), 12);
    expect(summary.raceDelta).toBeCloseTo(1.36, 9);
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
    // The swing is the FIRST lap the orders part: on lap 1 Piastri's 79.97
    // already beats Leclerc's 80.00, P3 to P2 (Verstappen leads them both).
    expect(summary.swing).toMatchObject({
      lap: 1,
      from: 3,
      to: 2,
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

describe('moving one stop on its own', () => {
  // A two-stopper: new sets on laps 5 and 9.
  const twoStopper = () =>
    piastri({
      lapTimeSeconds: [
        ...linearStint(80.0, 0.1, 4, { pitLoss: 22 }),
        ...linearStint(81.0, 0.02, 4, { pitLoss: 22 }),
        ...linearStint(80.0, 0.1, 4),
      ],
      compound: [...Array(4).fill('SOFT'), ...Array(4).fill('MEDIUM'), ...Array(4).fill('SOFT')],
      stintNumber: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    });
  const race = (tweak) =>
    simulateRace(series([leclerc(), twoStopper(), verstappen()]), { e2: tweak });

  test('the second stop moves while the first holds', () => {
    const sim = race({ stopShifts: [0, 2] });
    const driver = sim.drivers.get('e2');
    expect(driver.baseStopLaps).toEqual([5, 9]);
    expect(driver.newStopLaps).toEqual([5, 11]);
    // Nothing before the second stint's old in-lap is re-priced.
    expect(driver.simLapTimes.slice(0, 7)).toEqual(twoStopper().lapTimeSeconds.slice(0, 7));
    expect(simSummaryAtLap(sim, 'e2', driversById(sim), 12).stopDeltas).toEqual([0, 2]);
  });

  test('per-stop shifts ride on top of the shared shift', () => {
    expect(race({ pitShift: -1, stopShifts: [0, 2] }).drivers.get('e2').newStopLaps).toEqual([4, 10]);
  });

  test('a stop never passes its neighbours or the flag', () => {
    expect(race({ stopShifts: [0, 99] }).drivers.get('e2').newStopLaps).toEqual([5, 12]);
    expect(race({ stopShifts: [0, -99] }).drivers.get('e2').newStopLaps).toEqual([5, 6]);
  });

  test('the bounds a lever stops at: after the stop before, before the stop after', () => {
    expect(stopLapBounds([5, 9], 0, 12)).toEqual({ min: 2, max: 8 });
    expect(stopLapBounds([5, 9], 1, 12)).toEqual({ min: 6, max: 12 });
    expect(stopLapBounds([7], 0, 12)).toEqual({ min: 2, max: 12 });
  });

  test('shifts that are all zero are no tweak at all', () => {
    expect(tweakIsNoop({ pitShift: 0, paceDelta: 0, stopShifts: [0, 0] })).toBe(true);
    expect(tweakIsNoop({ stopShifts: [0, 1] })).toBe(false);
    expect(race({ stopShifts: [0, 0] }).tweaked).toEqual([]);
  });
});

describe("swapping a stint's tyre", () => {
  // Leclerc ran soft (laps 1-6) then medium (laps 7-12).
  const swapped = (stintCompounds) => simulateRace(series(), { e1: { stintCompounds } });

  test('only compounds the field ran, with enough laps to fit, are on offer', () => {
    const { model } = simulateRace(series());
    expect(compoundChoices(model)).toEqual(['soft', 'medium', 'hard']);
    expect(compoundChoices(null)).toEqual([]);
  });

  test("a stint swapped onto hards trades Leclerc's own medium curve for his predicted hard one", () => {
    const sim = swapped([null, 'hard']);
    const { driverPace, driverBase, compoundOffset, degradation } = sim.model;
    const driver = sim.drivers.get('e1');
    const logged = leclerc().lapTimeSeconds;
    expect(driver.newCompounds).toEqual(['SOFT', 'HARD']);
    // The soft stint is untouched.
    expect(driver.simLapTimes.slice(0, 6)).toEqual(logged.slice(0, 6));
    // Leclerc never ran the hard: his pace on it is his driver speed plus
    // the hard's compound speed, linked through Verstappen's soft and hard.
    const hard = driverBase.e1 + compoundOffset.hard;
    expect(hard).toBeCloseTo(81.37, 1);
    for (let age = 1; age <= 6; age += 1) {
      const expected =
        logged[5 + age] +
        (hard + degradation.hard * age) -
        (driverPace.e1.medium + degradation.medium * age);
      expect(driver.simLapTimes[5 + age]).toBeCloseTo(expected, 9);
    }
  });

  test('a swap onto the tyre really run, or onto one nobody ran, changes nothing', () => {
    const logged = leclerc().lapTimeSeconds;
    for (const choice of ['medium', 'wet']) {
      const driver = swapped([null, choice]).drivers.get('e1');
      expect(driver.newCompounds).toEqual(['SOFT', 'MEDIUM']);
      expect(driver.simLapTimes).toEqual(logged);
    }
  });

  test('swaps and stop moves combine: the swapped tyre runs from the moved stop', () => {
    const driver = simulateRace(series(), {
      e1: { stopShifts: [-2], stintCompounds: [null, 'hard'] },
    }).drivers.get('e1');
    expect(driver.newStopLaps).toEqual([5]);
    expect(driver.newCompounds).toEqual(['SOFT', 'HARD']);
  });

  test('the summary names the swap, and flags a dry race left on one compound', () => {
    const sim = swapped([null, 'soft']);
    const summary = simSummaryAtLap(sim, 'e1', driversById(sim), 12);
    expect(summary.compoundSwaps).toEqual([{ stint: 2, from: 'MEDIUM', to: 'SOFT' }]);
    expect(summary.breaksCompoundRule).toBe(true);
    expect(breaksCompoundRule(['SOFT', 'MEDIUM'], ['SOFT', 'HARD'])).toBe(false);
    // A race really run on one compound (or in the wet) isn't held to the rule.
    expect(breaksCompoundRule(['INTERMEDIATE', 'WET'], ['INTERMEDIATE', 'INTERMEDIATE'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ground truth: races generated from known parameters
// ---------------------------------------------------------------------------
//
// Every lap below is pace(driver) + offset(compound) + wear(compound) x age,
// plus the pit loss on an in-lap and an out-lap. A strategy changed in the sim
// can then be checked against the race that strategy would really have made:
// generate it from the same parameters and compare lap for lap. The model is
// optimal for this data exactly when it recovers that race.
const TRUTH = {
  compounds: {
    soft: { offset: 0, wear: 0.1 },
    medium: { offset: 0.6, wear: 0.05 },
    hard: { offset: 1.0, wear: 0.02 },
  },
  pitIn: 4,
  pitOut: 18,
};
const PACE = { A: 80.0, B: 80.3, C: 80.6, D: 79.9 };

function truthDriver(id, stints, { extra = {} } = {}) {
  const lapTimeSeconds = [];
  const compound = [];
  const stintNumber = [];
  stints.forEach(([name, laps], index) => {
    const { offset, wear } = TRUTH.compounds[name];
    for (let age = 1; age <= laps; age += 1) {
      let seconds = PACE[id] + offset + wear * age;
      if (index < stints.length - 1 && age === laps) seconds += TRUTH.pitIn;
      if (index > 0 && age === 1) seconds += TRUTH.pitOut;
      seconds += extra[lapTimeSeconds.length + 1] ?? 0;
      lapTimeSeconds.push(seconds);
      compound.push(name.toUpperCase());
      stintNumber.push(index + 1);
    }
  });
  return {
    entryId: id,
    driverName: `Driver ${id}`,
    teamName: `Team ${id}`,
    lapTimeSeconds,
    compound,
    stintNumber,
  };
}

// Running order by race time — what the positions of a generated race are.
function truthPositions(drivers) {
  const positions = new Map(drivers.map((d) => [d.entryId, []]));
  const totals = new Map(drivers.map((d) => [d.entryId, 0]));
  for (let lap = 1; lap <= drivers[0].lapTimeSeconds.length; lap += 1) {
    for (const d of drivers) totals.set(d.entryId, totals.get(d.entryId) + d.lapTimeSeconds[lap - 1]);
    [...totals.entries()]
      .sort((a, b) => a[1] - b[1])
      .forEach(([id], index) => positions.get(id).push(index + 1));
  }
  return positions;
}

function truthRace(stintsById, options = {}) {
  const drivers = Object.entries(stintsById).map(([id, stints]) =>
    truthDriver(id, stints, { extra: options.extra?.[id] })
  );
  const positions = truthPositions(drivers);
  return {
    totalLaps: drivers[0].lapTimeSeconds.length,
    drivers: drivers.map((d) => ({ ...d, position: positions.get(d.entryId) })),
  };
}

// The real race: four strategies over twenty laps. C is a two-stopper, D
// never runs the hard and B never runs the soft — the field is still linked
// through the cars that share compounds.
const REAL = {
  A: [['soft', 8], ['hard', 12]],
  B: [['medium', 10], ['hard', 10]],
  C: [['soft', 6], ['medium', 7], ['soft', 7]],
  D: [['medium', 12], ['soft', 8]],
};

function expectSameRace(sim, truth) {
  for (const driver of truth.drivers) {
    const simulated = sim.drivers.get(driver.entryId).simLapTimes;
    driver.lapTimeSeconds.forEach((seconds, i) => expect(simulated[i]).toBeCloseTo(seconds, 6));
    expect(sim.simPositions.get(driver.entryId)).toEqual(driver.position);
  }
}

describe('the fit recovers the parameters a race was generated from', () => {
  const { model } = simulateRace(truthRace(REAL));

  test("wear per compound, exactly, whatever each car's pace and stint length", () => {
    for (const [name, { wear }] of Object.entries(TRUTH.compounds)) {
      expect(model.degradation[name]).toBeCloseTo(wear, 9);
    }
  });

  test('the pit loss, split exactly between the in-lap and the out-lap', () => {
    expect(model.pitInLoss).toBeCloseTo(TRUTH.pitIn, 9);
    expect(model.pitOutLoss).toBeCloseTo(TRUTH.pitOut, 9);
    expect(model.pitLoss).toBeCloseTo(TRUTH.pitIn + TRUTH.pitOut, 9);
    expect(model.stopSamples).toBe(5);
  });

  test("a driver's pace on a tyre they never ran, through the cars that link them", () => {
    // D never ran the hard, B never ran the soft: driver + compound speed
    // predicts both exactly.
    expect(model.driverBase.D + model.compoundOffset.hard).toBeCloseTo(
      PACE.D + TRUTH.compounds.hard.offset,
      6
    );
    expect(model.driverBase.B + model.compoundOffset.soft).toBeCloseTo(
      PACE.B + TRUTH.compounds.soft.offset,
      6
    );
  });

  test('a standing start and a safety-car lap teach the model nothing', () => {
    // Lap 1 six seconds slow for everyone, and a 30% safety-car lap mid-stint.
    const extra = { A: { 1: 6, 15: 25 }, B: { 1: 6 }, C: { 1: 6 }, D: { 1: 6 } };
    const noisy = simulateRace(truthRace(REAL, { extra })).model;
    for (const [name, { wear }] of Object.entries(TRUTH.compounds)) {
      expect(noisy.degradation[name]).toBeCloseTo(wear, 9);
    }
    expect(noisy.pitInLoss).toBeCloseTo(TRUTH.pitIn, 9);
    expect(noisy.pitOutLoss).toBeCloseTo(TRUTH.pitOut, 9);
  });
});

describe('a changed strategy re-runs to the race it would really have been', () => {
  test('an earlier stop', () => {
    const sim = simulateRace(truthRace(REAL), { A: { stopShifts: [-3] } });
    expectSameRace(sim, truthRace({ ...REAL, A: [['soft', 5], ['hard', 15]] }));
  });

  test('a later stop', () => {
    const sim = simulateRace(truthRace(REAL), { B: { stopShifts: [4] } });
    expectSameRace(sim, truthRace({ ...REAL, B: [['medium', 14], ['hard', 6]] }));
  });

  test('one stop of a two-stopper moved while the other holds', () => {
    const sim = simulateRace(truthRace(REAL), { C: { stopShifts: [0, 2] } });
    expectSameRace(sim, truthRace({ ...REAL, C: [['soft', 6], ['medium', 9], ['soft', 5]] }));
  });

  test('a stint swapped onto a tyre the driver ran elsewhere in the race', () => {
    const sim = simulateRace(truthRace(REAL), { C: { stintCompounds: [null, 'soft'] } });
    expectSameRace(sim, truthRace({ ...REAL, C: [['soft', 6], ['soft', 7], ['soft', 7]] }));
  });

  test('a stint swapped onto a tyre the driver never ran', () => {
    const sim = simulateRace(truthRace(REAL), { D: { stintCompounds: ['hard', null] } });
    expectSameRace(sim, truthRace({ ...REAL, D: [['hard', 12], ['soft', 8]] }));
  });

  test('a moved stop and a swapped tyre together, on two cars at once', () => {
    const sim = simulateRace(truthRace(REAL), {
      B: { stopShifts: [3], stintCompounds: [null, 'soft'] },
      A: { stopShifts: [-2] },
    });
    expectSameRace(
      sim,
      truthRace({ ...REAL, A: [['soft', 6], ['hard', 14]], B: [['medium', 13], ['soft', 7]] })
    );
  });

  test('the pace dial moves every lap by exactly what it says', () => {
    const real = truthRace(REAL);
    const sim = simulateRace(real, { D: { paceDelta: -0.2 } });
    real.drivers
      .find((d) => d.entryId === 'D')
      .lapTimeSeconds.forEach((seconds, i) =>
        expect(sim.drivers.get('D').simLapTimes[i]).toBeCloseTo(seconds - 0.2, 9)
      );
  });
});

describe('the running order', () => {
  test('a retired car leaves the order after its last lap', () => {
    const real = truthRace(REAL);
    const retired = real.drivers.map((d) =>
      d.entryId === 'D'
        ? { ...d, lapTimeSeconds: d.lapTimeSeconds.map((s, i) => (i < 10 ? s : null)) }
        : d
    );
    const sim = simulateRace({ ...real, drivers: retired });
    expect(simPositionAtLap(sim, 'D', 10)).not.toBeNull();
    expect(simPositionAtLap(sim, 'D', 11)).toBeNull();
    const at11 = ['A', 'B', 'C'].map((id) => simPositionAtLap(sim, id, 11)).sort();
    expect(at11).toEqual([1, 2, 3]);
  });

  test('a red flag for the whole field freezes every clock alike', () => {
    const real = truthRace(REAL);
    const flagged = real.drivers.map((d) => ({
      ...d,
      lapTimeSeconds: d.lapTimeSeconds.map((s, i) => (i === 9 ? 2400 : s)),
    }));
    const sim = simulateRace({ ...real, drivers: flagged });
    // Nobody is timed on lap 10, so nobody holds a place on it, and every
    // clock stands still alike: lap 11's order is the race without lap 10.
    const without10 = real.drivers
      .map((d) => ({
        id: d.entryId,
        time: d.lapTimeSeconds.slice(0, 11).reduce((sum, s, i) => (i === 9 ? sum : sum + s), 0),
      }))
      .sort((a, b) => a.time - b.time)
      .map((entry) => entry.id);
    for (const d of real.drivers) {
      expect(simPositionAtLap(sim, d.entryId, 10)).toBeNull();
      expect(simPositionAtLap(sim, d.entryId, 11)).toBe(without10.indexOf(d.entryId) + 1);
    }
  });
});
