// The Simulation & Strategy Engine's model — the race the user re-runs after
// moving their team's decisions, computed against the real race as ground
// truth. Pure and synchronous like raceSyncReadings beside it, so a whole
// simulated race can be checked without rendering it.
//
// The model is a DELTA model, deliberately: the real lap times are the pace of
// record, and a tweak only changes what a strategy decision actually changes —
// which tyre each lap runs on and how old it is, and which laps carry the pit
// loss. Everything a driver really did (traffic, an overtake, a lock-up) is
// left in their log; the sim re-prices the decisions around it. That keeps the
// math honest and small: no invented telemetry, just wear and pit loss fitted
// from the field's own laps and re-applied.
//
// Two rules carried over from raceSyncReadings: a lap the log doesn't carry
// stays a gap (a stoppage interval is never re-timed, never smoothed), and
// nothing is invented. The sim is computed over the WHOLE race once, then
// projected to the playhead by the caller — a stop moved on lap 8 changes lap
// 40, so only a whole-race sim can answer lap 20 truthfully.

import {
  LAP_TIME_CEILING_SECONDS,
  pitStops,
  stintSegments,
} from './raceSyncReadings';

// A lap is only re-priced if a car could have driven it — the same stoppage
// rule as every reading (see raceSyncReadings.isLapTime).
const isTimed = (seconds) =>
  Number.isFinite(seconds) && seconds <= LAP_TIME_CEILING_SECONDS;

// The tweak one driver carries. Pit timing and pace are the first pillar
// (speed & pit-stop tweaks); compound choice and engine mode join later, so
// the shape stays open. pitShift moves EVERY stop by the same laps (negative =
// earlier); stopShifts moves each stop on its own, index for index with the
// real stops, on top of pitShift — so a two-stopper's first stop can come
// earlier while the second holds. stintCompounds swaps the tyre a stint runs
// on, index for index with the real stints (null = as raced). paceDelta is
// seconds added to every timed lap (positive = eased off).
export const DEFAULT_TWEAK = { pitShift: 0, paceDelta: 0, stopShifts: [], stintCompounds: [] };

export const tweakIsNoop = (tweak) =>
  !tweak ||
  ((tweak.pitShift ?? 0) === 0 &&
    (tweak.paceDelta ?? 0) === 0 &&
    (tweak.stopShifts ?? []).every((shift) => !shift) &&
    (tweak.stintCompounds ?? []).every((compound) => !compound));

// The compounds a stint can be swapped onto: every compound the field ran
// this race that the wear fit could price (a fresh pace and enough laps).
// A compound nobody ran has no numbers behind it, so it is never offered —
// the sim prices what the race measured, never what it imagines.
const MIN_COMPOUND_SAMPLES = 5;
const COMPOUND_ORDER = ['soft', 'medium', 'hard', 'intermediate', 'wet'];
const DRY_COMPOUNDS = new Set(['soft', 'medium', 'hard']);

// The dry-race rule: a car that finishes a dry race must have run at least
// two different dry compounds. True when the real race kept the rule and the
// swapped schedule breaks it — the sim still runs it, but says so.
export function breaksCompoundRule(baseCompounds, newCompounds) {
  const dry = (list) =>
    new Set((list ?? []).map((c) => String(c ?? '').toLowerCase()).filter((c) => DRY_COMPOUNDS.has(c)));
  return dry(baseCompounds).size >= 2 && dry(newCompounds).size < 2;
}

export function compoundChoices(model) {
  return Object.keys(model?.freshPace ?? {})
    .filter(
      (key) =>
        key &&
        Number.isFinite(model.freshPace[key]) &&
        (model.fitSamples?.[key] ?? 0) >= MIN_COMPOUND_SAMPLES
    )
    .sort((a, b) => COMPOUND_ORDER.indexOf(a) - COMPOUND_ORDER.indexOf(b));
}

// The compound sequence after a swap. A swap
// onto the compound the stint really ran is no swap, and a compound the model
// can't price is ignored rather than guessed at.
function swappedCompounds(compounds, tweak, model) {
  const priced = new Set(compoundChoices(model));
  return compounds.map((compound, index) => {
    const wanted = String(tweak?.stintCompounds?.[index] ?? '').toLowerCase();
    if (!wanted || wanted === String(compound ?? '').toLowerCase() || !priced.has(wanted)) {
      return compound;
    }
    return wanted.toUpperCase();
  });
}

export const anyTweakActive = (tweaks) =>
  Object.values(tweaks ?? {}).some((tweak) => !tweakIsNoop(tweak));

// ---------------------------------------------------------------------------
// Fitting — wear per compound, each driver's pace, and the pit loss
// ---------------------------------------------------------------------------

// A lap only teaches the model about tyres if it is a lap of racing on them.
// Left out: the race's first lap (a standing start, seconds off any tyre
// curve), a stint's in-lap and out-lap (they carry the pit lane), and any lap
// slower than 107% of its stint's median — the regulations' own yardstick,
// here catching safety-car, VSC and traffic-wrecked laps that would otherwise
// drag a straight line through them.
const CLEAN_LAP_LIMIT = 1.07;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Every stint of every driver, as the clean (age, time) points it contributes.
function cleanStints(drivers, totalLaps) {
  const stints = [];
  for (const driver of drivers ?? []) {
    const times = driver?.lapTimeSeconds ?? [];
    const segments = stintSegments(driver, totalLaps);
    segments.forEach((segment, index) => {
      const firstLap = index > 0 ? segment.fromLap + 1 : Math.max(segment.fromLap, 2);
      const lastLap = index < segments.length - 1 ? segment.toLap - 1 : segment.toLap;
      const candidates = [];
      for (let lap = firstLap; lap <= lastLap; lap += 1) {
        const seconds = times[lap - 1];
        if (isTimed(seconds)) candidates.push({ x: lap - segment.fromLap + 1, y: seconds });
      }
      const typical = median(candidates.map((point) => point.y));
      stints.push({
        entryId: driver.entryId,
        compound: String(segment.compound ?? '').toLowerCase(),
        points: candidates.filter((point) => point.y <= typical * CLEAN_LAP_LIMIT),
      });
    });
  }
  return stints;
}

// Wear per compound by the WITHIN-STINT estimator: each stint is centred on
// its own mean age and time before the slope is taken, so only how a car
// slowed as ITS tyres aged votes — never how quick one car is against
// another. A plain line through the pooled laps can't tell those apart: a
// quicker car running a longer stint tilts it (the test fixture's three soft
// stints, each exactly 0.100 s/lap, pool to 0.112). This is the fixed-effects
// slope of panel regression; with a single stint it is ordinary least squares.
function withinStintSlope(stints) {
  let sxx = 0;
  let sxy = 0;
  for (const { points } of stints) {
    if (points.length < 2) continue;
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    for (const p of points) {
      sxx += (p.x - meanX) * (p.x - meanX);
      sxy += (p.x - meanX) * (p.y - meanY);
    }
  }
  return sxx > 0 ? sxy / sxx : 0; // no spread in age, no slope to claim
}

// Fit the race model from the field's own laps:
//   degradation[c]      wear on compound c, s per lap of age (within-stint);
//   freshPace[c]        the field's mean lap at age 0 on c, wear taken out;
//   driverPace[id][c]   the same for one driver — the base every re-priced
//                       lap is built on, so a driver keeps their own speed;
//   pitInLoss/pitOutLoss  the pit lane's cost on the in-lap and the out-lap:
//                       the median of each lap's time beyond the driver's
//                       own tyre curve. Where the pit box sits against the
//                       timing line decides how the loss splits between the
//                       two laps, so both are measured and both relocate.
export function fitRaceModel(drivers, totalLaps) {
  const stints = cleanStints(drivers, totalLaps);
  const compounds = [...new Set(stints.map((stint) => stint.compound))];

  const degradation = {};
  const freshPace = {};
  const fitSamples = {};
  for (const compound of compounds) {
    const onCompound = stints.filter((stint) => stint.compound === compound);
    const points = onCompound.flatMap((stint) => stint.points);
    const slope = withinStintSlope(onCompound);
    degradation[compound] = slope;
    freshPace[compound] =
      points.length > 0
        ? points.reduce((sum, p) => sum + (p.y - slope * p.x), 0) / points.length
        : null;
    fitSamples[compound] = points.length;
  }

  const tallies = new Map(); // `${entryId}|${compound}` -> { sum, n }
  for (const stint of stints) {
    for (const p of stint.points) {
      const key = `${stint.entryId}|${stint.compound}`;
      const tally = tallies.get(key) ?? { entryId: stint.entryId, compound: stint.compound, sum: 0, n: 0 };
      tally.sum += p.y - degradation[stint.compound] * p.x;
      tally.n += 1;
      tallies.set(key, tally);
    }
  }
  const cells = [...tallies.values()].map(({ entryId, compound, sum, n }) => ({
    entryId,
    compound,
    pace: sum / n,
    n,
  }));
  const driverPace = {};
  for (const { entryId, compound, pace } of cells) {
    driverPace[entryId] = { ...driverPace[entryId], [compound]: pace };
  }

  const model = { degradation, freshPace, driverPace, fitSamples, ...additivePace(cells) };

  // The pit lane: each stop's in-lap and out-lap against the driver's own
  // curve — the old tyre at its age, the new one at age 1 (so a cold out-lap
  // counts as part of what a stop costs).
  const inResiduals = [];
  const outResiduals = [];
  for (const driver of drivers ?? []) {
    const times = driver?.lapTimeSeconds ?? [];
    const curve = tyreCurveFor(model, driver.entryId);
    const segments = stintSegments(driver, totalLaps);
    segments.slice(1).forEach((segment, index) => {
      const previous = segments[index];
      const inLap = segment.fromLap - 1;
      const inExpected = curve(
        String(previous.compound ?? '').toLowerCase(),
        inLap - previous.fromLap + 1
      );
      if (isTimed(times[inLap - 1]) && inExpected != null) {
        inResiduals.push(times[inLap - 1] - inExpected);
      }
      const outExpected = curve(String(segment.compound ?? '').toLowerCase(), 1);
      if (isTimed(times[segment.fromLap - 1]) && outExpected != null) {
        outResiduals.push(times[segment.fromLap - 1] - outExpected);
      }
    });
  }
  model.pitInLoss = median(inResiduals) ?? 0;
  model.pitOutLoss = median(outResiduals) ?? 0;
  model.pitLoss = model.pitInLoss + model.pitOutLoss;
  model.stopSamples = inResiduals.length;
  return model;
}

// The pace a driver WOULD have on a compound they never ran. Every measured
// (driver, compound) pace is read as driver speed + compound speed, and the
// two are fitted together by weighted least squares over the whole field
// (backfitting: alternately re-solve each side holding the other — the
// two-way fixed-effects fit, which converges for any connected field). A
// driver who ran softs and mediums, compared with drivers who ran mediums and
// hards, is then priced on hards through the cars that link them; when lap
// times really are additive this recovers the unseen pace exactly, where a
// simple field average would carry in whoever happened to run that tyre.
function additivePace(cells) {
  const driverBase = {};
  const compoundOffset = {};
  for (const cell of cells) {
    driverBase[cell.entryId] = 0;
    compoundOffset[cell.compound] = 0;
  }
  const solve = (side, other, keyOf, otherKeyOf) => {
    const sums = {};
    for (const cell of cells) {
      const key = keyOf(cell);
      const entry = (sums[key] ??= { sum: 0, n: 0 });
      entry.sum += cell.n * (cell.pace - other[otherKeyOf(cell)]);
      entry.n += cell.n;
    }
    let change = 0;
    for (const [key, { sum, n }] of Object.entries(sums)) {
      const value = sum / n;
      change = Math.max(change, Math.abs(value - side[key]));
      side[key] = value;
    }
    return change;
  };
  for (let round = 0; round < 500; round += 1) {
    const moved = Math.max(
      solve(driverBase, compoundOffset, (c) => c.entryId, (c) => c.compound),
      solve(compoundOffset, driverBase, (c) => c.compound, (c) => c.entryId)
    );
    if (moved < 1e-10) break;
  }
  return { driverBase, compoundOffset };
}

// One driver's tyre curve: their expected lap on compound `key` at tyre age
// `age`, or null when nothing measured can say. Their own measured pace on
// that compound when they ran it; otherwise the additive fit's driver speed
// plus compound speed.
function tyreCurveFor(model, entryId) {
  const own = model.driverPace?.[entryId] ?? {};
  return (key, age) => {
    const base = Number.isFinite(own[key])
      ? own[key]
      : Number.isFinite(model.driverBase?.[entryId]) && Number.isFinite(model.compoundOffset?.[key])
        ? model.driverBase[entryId] + model.compoundOffset[key]
        : null;
    return base == null ? null : base + (model.degradation[key] ?? 0) * age;
  };
}

// ---------------------------------------------------------------------------
// Re-timing one driver
// ---------------------------------------------------------------------------

// Where a driver's stops land under a tweak: each real stop moves by the
// shared pitShift plus its own stopShifts entry. Stops keep their order and
// every stint keeps at least one lap: the first stop can't come before lap 2,
// each stop follows the one before it, and the last can't pass the final lap.
// When the clamp binds, a stop simply moves less than asked — the ACTUAL laps
// are returned so the UI shows what really happened, never the requested
// fantasy. (A stop is the first lap on the new set, as in the readings.)
function shiftedStopLaps(baseStopLaps, tweak, totalLaps) {
  const pitShift = tweak?.pitShift ?? 0;
  const stopShifts = tweak?.stopShifts ?? [];
  // Forward: each stop after the one before it (and never before lap 2).
  const result = [];
  let previous = 1;
  baseStopLaps.forEach((base, index) => {
    const wanted = base + pitShift + (stopShifts[index] ?? 0);
    const lap = Math.max(wanted, previous + 1, 2);
    result.push(lap);
    previous = lap;
  });
  // Backward: nothing past the final lap, and each stop still before the next.
  let next = totalLaps + 1;
  for (let index = result.length - 1; index >= 0; index -= 1) {
    result[index] = Math.max(Math.min(result[index], next - 1), 2);
    next = result[index];
  }
  return result;
}

// The laps one stop can move between while the others hold where they are:
// one lap after the stop before it (lap 2 for the first) up to one lap before
// the stop after it (the final lap for the last). The console uses it to stop
// a lever at the edge instead of letting a shift pile up past what moved.
export function stopLapBounds(stopLaps, index, totalLaps) {
  const before = index > 0 ? stopLaps[index - 1] : 1;
  const after = index < stopLaps.length - 1 ? stopLaps[index + 1] : totalLaps + 1;
  return { min: Math.max(before + 1, 2), max: after - 1 };
}

// Stint map for a lap schedule: lap -> { stintIndex, age, compound, isInLap,
// isOutLap }. A stop is the first lap on the new set, so that lap is the
// out-lap and the lap before it the in-lap. Built the same way for the real
// schedule and the simulated one, so the two can be differenced lap by lap.
function stintMapFor(compounds, stopLaps, totalLaps) {
  const map = new Map();
  const boundaries = [...stopLaps, totalLaps + 1];
  let from = 1;
  for (let stintIndex = 0; stintIndex < boundaries.length; stintIndex += 1) {
    const to = boundaries[stintIndex] - 1;
    const compound = compounds[Math.min(stintIndex, compounds.length - 1)] ?? null;
    for (let lap = from; lap <= Math.min(to, totalLaps); lap += 1) {
      map.set(lap, {
        stintIndex,
        age: lap - from + 1,
        compound,
        isOutLap: stintIndex > 0 && lap === from,
        isInLap: stintIndex < boundaries.length - 1 && lap === to,
      });
    }
    from = to + 1;
  }
  return map;
}

// The price of one lap under the new schedule. Untimed laps (stoppages) pass
// through untouched — a red-flag interval is the clock's number, not the
// car's, and is never re-priced. A timed lap keeps everything the log says
// and swaps only what the strategy decided:
//   tyre — the driver's own curve on the tyre the lap now runs, at the age it
//          now has, less their curve on the tyre it really ran at its real
//          age. One formula for every case: a stop moved (same compound,
//          other age), a lap that changes stint (other compound AND other
//          age — both wear curves and the compounds' pace gap), a swapped
//          stint. When no curve can price a compound, a lap that keeps its
//          compound still pays the age difference; anything else pays nothing.
//   pit  — the in-lap and out-lap losses leave the real stop's laps and
//          arrive on the new ones;
//   pace — the flat per-lap dial, the driver's speed pillar.
function reTimedLap(driver, baseMap, newMap, model, curve, tweak, lap) {
  const logged = driver.lapTimeSeconds?.[lap - 1];
  if (!isTimed(logged)) return logged;

  const base = baseMap.get(lap);
  const next = newMap.get(lap);
  const baseKey = String(base?.compound ?? '').toLowerCase();
  const nextKey = String(next?.compound ?? '').toLowerCase();
  const was = curve(baseKey, base?.age ?? 0);
  const now = curve(nextKey, next?.age ?? 0);
  const tyre =
    was != null && now != null
      ? now - was
      : baseKey === nextKey
        ? (model.degradation[nextKey] ?? 0) * ((next?.age ?? 0) - (base?.age ?? 0))
        : 0;

  const flag = (entry, key) => (entry?.[key] ? 1 : 0);
  const pit =
    model.pitInLoss * (flag(next, 'isInLap') - flag(base, 'isInLap')) +
    model.pitOutLoss * (flag(next, 'isOutLap') - flag(base, 'isOutLap'));

  return logged + tyre + pit + (tweak.paceDelta ?? 0);
}

// One driver's simulated race. Returns per-lap arrays (index lap-1) plus the
// stop schedule, or null when the driver has no laps to speak of.
function simulateDriver(driver, model, tweak, totalLaps) {
  const segments = stintSegments(driver, totalLaps);
  if (segments.length === 0) return null;

  const times = driver.lapTimeSeconds ?? [];
  const compounds = segments.map((segment) => segment.compound);
  const baseStopLaps = pitStops(driver, totalLaps).map((stop) => stop.lap);
  const baseMap = stintMapFor(compounds, baseStopLaps, totalLaps);
  const curve = tyreCurveFor(model, driver.entryId);

  const stopLaps = tweakIsNoop(tweak)
    ? baseStopLaps
    : shiftedStopLaps(baseStopLaps, tweak, totalLaps);
  const newCompounds = swappedCompounds(compounds, tweak, model);
  const newMap = stintMapFor(newCompounds, stopLaps, totalLaps);

  const simLapTimes = [];
  const simCumulative = [];
  const baseCumulative = [];
  let simTotal = 0;
  let baseTotal = 0;
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const sim = reTimedLap(driver, baseMap, newMap, model, curve, tweak, lap);
    const logged = times[lap - 1];
    simLapTimes.push(sim);
    // Only laps a car could have driven enter race time — a stoppage interval
    // is the clock's number and leaves a gap in the cumulative, exactly as it
    // does in the readings.
    if (isTimed(sim)) {
      simTotal += sim;
      simCumulative[lap - 1] = simTotal;
    }
    if (isTimed(logged)) {
      baseTotal += logged;
      baseCumulative[lap - 1] = baseTotal;
    }
  }

  const deltaVsBaseline = simCumulative.map((sim, i) =>
    Number.isFinite(sim) && Number.isFinite(baseCumulative[i]) ? sim - baseCumulative[i] : undefined
  );

  return {
    entryId: driver.entryId,
    driverName: driver.driverName,
    teamName: driver.teamName,
    tweaked: !tweakIsNoop(tweak),
    compounds,
    newCompounds,
    paceDeltaApplied: tweak.paceDelta ?? 0,
    simLapTimes,
    simCumulative,
    baseCumulative,
    deltaVsBaseline,
    baseStopLaps,
    newStopLaps: stopLaps,
  };
}

// ---------------------------------------------------------------------------
// The field — re-ranking everyone on race time
// ---------------------------------------------------------------------------

// Each driver's race clock per lap, for ranking and gaps. A car's clock runs
// on its own timed laps. A lap it ran but the log can't time (a stoppage
// interval, a hole in the feed) advances its clock by the field's median
// timed lap that lap — neutral, so the car neither gains nor loses there,
// where simply skipping the lap would hand it a lap's worth of time over
// everyone who was timed. On that lap itself it holds no position (the clock
// entry is left empty); from the next timed lap it rejoins where it was.
// When nobody was timed on a lap (a red flag for the whole field), every
// clock stands still alike. After a car's last timed lap its clock stops: a
// retired car leaves the order.
function raceClocks(lapsById, totalLaps) {
  const fieldMedian = [];
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const timed = [];
    for (const laps of lapsById.values()) {
      if (isTimed(laps[lap - 1])) timed.push(laps[lap - 1]);
    }
    fieldMedian.push(median(timed) ?? 0);
  }

  const clocks = new Map();
  for (const [id, laps] of lapsById) {
    const clock = new Array(totalLaps).fill(undefined);
    let lastTimed = 0;
    for (let lap = 1; lap <= totalLaps; lap += 1) if (isTimed(laps[lap - 1])) lastTimed = lap;
    let total = 0;
    for (let lap = 1; lap <= lastTimed; lap += 1) {
      if (isTimed(laps[lap - 1])) {
        total += laps[lap - 1];
        clock[lap - 1] = total;
      } else {
        total += fieldMedian[lap - 1];
      }
    }
    clocks.set(id, clock);
  }
  return clocks;
}

// Positions from race clocks: at each lap, the drivers with a clock entry,
// ordered by it. This is the honest running order — a car that stops earlier
// is genuinely ahead on the road — and it is how the sim field is rebuilt.
function rankByClock(clocks, totalLaps) {
  const positions = new Map(); // entryId -> [position per lap]
  const order = []; // entryId per lap, leader first
  for (const id of clocks.keys()) positions.set(id, new Array(totalLaps).fill(undefined));

  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const running = [];
    for (const [id, clock] of clocks) {
      const value = clock[lap - 1];
      if (Number.isFinite(value)) running.push({ id, value });
    }
    running.sort((a, b) => a.value - b.value);
    order.push(running.map((entry) => entry.id));
    running.forEach((entry, index) => {
      positions.get(entry.id)[lap - 1] = index + 1;
    });
  }
  return { positions, order };
}

// Gap to the leader's clock, per lap — the trace a gap chart draws.
function gapToLeader(clocks, order, totalLaps) {
  const gaps = new Map();
  for (const id of clocks.keys()) gaps.set(id, new Array(totalLaps).fill(undefined));
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const leaders = order[lap - 1];
    if (!leaders || leaders.length === 0) continue;
    const leaderClock = clocks.get(leaders[0])[lap - 1];
    for (const id of leaders) {
      gaps.get(id)[lap - 1] = clocks.get(id)[lap - 1] - leaderClock;
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// simulateRace — the whole simulated race, one call
// ---------------------------------------------------------------------------

// Run the sim for a session. `series` is the race-replay lap series (the same
// payload the readings use), `tweaks` is { entryId -> tweak } (see DEFAULT_TWEAK).
// `seed` is reserved for the reliability pillar — the pit/pace math is fully
// deterministic, and the signature stays a pure function of (series, tweaks,
// seed) so chance plugs in without a rewrite.
export function simulateRace(series, tweaks = {}, seed = 1) {
  void seed;
  const drivers = series?.drivers ?? [];
  const totalLaps = series?.totalLaps ?? 0;
  if (!drivers.length || !totalLaps) return null;

  const model = fitRaceModel(drivers, totalLaps);
  const byId = new Map();

  for (const driver of drivers) {
    const tweak = tweaks[driver.entryId] ?? DEFAULT_TWEAK;
    const result = simulateDriver(driver, model, tweak, totalLaps);
    if (result) byId.set(driver.entryId, result);
  }

  // The real race's clocks come straight from the logs; the sim's differ
  // only where a tweak re-priced a lap.
  const baseLaps = new Map();
  const simLaps = new Map();
  for (const driver of drivers) {
    const result = byId.get(driver.entryId);
    if (!result) continue;
    baseLaps.set(driver.entryId, driver.lapTimeSeconds ?? []);
    simLaps.set(driver.entryId, result.simLapTimes);
  }
  const baseClocks = raceClocks(baseLaps, totalLaps);
  const simClocks = raceClocks(simLaps, totalLaps);
  const baseRank = rankByClock(baseClocks, totalLaps);
  const simRank = rankByClock(simClocks, totalLaps);

  return {
    totalLaps,
    model,
    tweaked: drivers.filter((d) => !tweakIsNoop(tweaks[d.entryId])).map((d) => d.entryId),
    drivers: byId,
    basePositions: baseRank.positions,
    simPositions: simRank.positions,
    baseGapToLeader: gapToLeader(baseClocks, baseRank.order, totalLaps),
    simGapToLeader: gapToLeader(simClocks, simRank.order, totalLaps),
  };
}

// ---------------------------------------------------------------------------
// Projecting to the playhead — the only thing the UI ever renders
// ---------------------------------------------------------------------------

// One driver's sim, cut at the playhead exactly like a reading: arrays sliced
// to `uptoLap`, nothing beyond. Returns null for a driver the sim doesn't know.
export function simDriverAtLap(sim, entryId, uptoLap) {
  const driver = sim?.drivers?.get(entryId);
  if (!driver) return null;
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim.totalLaps));
  const slice = (array) => (Array.isArray(array) ? array.slice(0, cut) : array);
  return {
    ...driver,
    simLapTimes: slice(driver.simLapTimes),
    simCumulative: slice(driver.simCumulative),
    baseCumulative: slice(driver.baseCumulative),
    deltaVsBaseline: slice(driver.deltaVsBaseline),
  };
}

// Sim position for the stage: where the sim put this driver at the playhead.
export function simPositionAtLap(sim, entryId, uptoLap) {
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim?.totalLaps ?? 0));
  if (cut < 1) return null;
  return sim?.simPositions?.get(entryId)?.[cut - 1] ?? null;
}

// Gap to the sim leader at the playhead, and the baseline figure beside it —
// the two endpoints a broadcast line quotes.
export function simGapAtLap(sim, entryId, uptoLap) {
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim?.totalLaps ?? 0));
  if (cut < 1) return { sim: null, base: null };
  return {
    sim: sim?.simGapToLeader?.get(entryId)?.[cut - 1] ?? null,
    base: sim?.baseGapToLeader?.get(entryId)?.[cut - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// The broadcast summary — the cause-and-effect line the panels quote
// ---------------------------------------------------------------------------

// Where the position actually changed: the first lap (up to the playhead)
// where the sim and baseline positions of a tweaked driver diverge, and who
// gained from it. Names the driver traded with — the car holding the sim
// position that the baseline gave this driver.
function positionSwing(sim, entryId, uptoLap) {
  const simPos = sim?.simPositions?.get(entryId);
  const basePos = sim?.basePositions?.get(entryId);
  if (!simPos || !basePos) return null;
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim.totalLaps));
  for (let lap = 1; lap <= cut; lap += 1) {
    const s = simPos[lap - 1];
    const b = basePos[lap - 1];
    if (s == null || b == null || s === b) continue;
    // Who holds, in the sim, the place the driver really took? Walk the sim
    // order backwards from the position to a name.
    const holder = holderOfPosition(sim, b, lap);
    return {
      lap,
      from: b,
      to: s,
      places: b - s, // positive = gained vs the real race
      tradedWith: holder && holder !== entryId ? holder : null,
    };
  }
  return null;
}

// The entry holding `position` in the sim at `lap` (for naming the trade).
function holderOfPosition(sim, position, lap) {
  if (position == null) return null;
  for (const [id, positions] of sim.simPositions) {
    if (positions[lap - 1] === position) return id;
  }
  return null;
}

// The facts a broadcast line is built from, for one tweaked driver at the
// playhead. Structured (not a sentence) so the UI can paint numbers bold and
// drivers in team colours. Every figure is a real sim output.
export function simSummaryAtLap(sim, entryId, driversById, uptoLap) {
  const driver = simDriverAtLap(sim, entryId, uptoLap);
  if (!sim || !driver || !driver.tweaked) return null;
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim.totalLaps));
  if (cut < 1) return null;

  const lastDelta = [...driver.deltaVsBaseline].reverse().find((value) => Number.isFinite(value));
  const swing = positionSwing(sim, entryId, uptoLap);
  const traded = swing?.tradedWith ? driversById?.get(swing.tradedWith) ?? null : null;

  const simPos = sim.simPositions.get(entryId)?.[cut - 1] ?? null;
  const basePos = sim.basePositions.get(entryId)?.[cut - 1] ?? null;
  const nextStop = driver.newStopLaps.find((lap) => lap >= cut) ?? null;
  const baseNextStop = driver.baseStopLaps[driver.newStopLaps.indexOf(nextStop)] ?? null;

  return {
    entryId,
    driverName: driver.driverName,
    teamName: driver.teamName,
    raceDelta: Number.isFinite(lastDelta) ? lastDelta : null, // + = lost time
    currentSimPos: simPos,
    currentBasePos: basePos,
    swing: swing ? { ...swing, tradedName: traded?.driverName ?? null, tradedTeam: traded?.teamName ?? null } : null,
    nextStop,
    nextStopDelta: nextStop != null && baseNextStop != null ? nextStop - baseNextStop : null,
    // The cause half of the broadcast line quotes these: the first stop's
    // ACTUAL movement (clamped by the race — the sentence reports what
    // happened, never what was asked for) and the pace dial as applied.
    firstStopDelta:
      driver.newStopLaps.length > 0 && driver.baseStopLaps.length > 0
        ? driver.newStopLaps[0] - driver.baseStopLaps[0]
        : null,
    // Every stop's actual movement, index for index — a two-stopper may have
    // moved only its second stop.
    stopDeltas: driver.newStopLaps.map((lap, i) => lap - (driver.baseStopLaps[i] ?? lap)),
    // The stints whose tyre was swapped: { stint (1-based), from, to }.
    compoundSwaps: (driver.newCompounds ?? [])
      .map((to, i) => ({ stint: i + 1, from: driver.compounds[i], to }))
      .filter((swap) => String(swap.from ?? '').toLowerCase() !== String(swap.to ?? '').toLowerCase()),
    breaksCompoundRule: breaksCompoundRule(driver.compounds, driver.newCompounds),
    paceDelta: driver.paceDeltaApplied ?? 0,
    compoundKeys: [...new Set([...compoundNames(driver)])],
  };
}

function compoundNames(driver) {
  return (driver?.compounds ?? [])
    .map((name) => String(name ?? '').toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Pit calls — the moments the broadcast flashes, as the pit wall would call them
// ---------------------------------------------------------------------------

// How many laps before the in-lap the window counts as open.
export const PIT_WINDOW_LAPS = 3;
// How many laps from the out-lap the stop's verdict stays on screen.
const VERDICT_LAPS = 2;

// The pit-wall moment one tweaked driver is in at the playhead, or null when
// nothing is being called. A stop lap is the first lap on the new set (the
// readings' convention), so the in-lap — where the car dives into the pit
// lane — is the lap before it. In order:
//   window  (blue)  the in-lap is 1..PIT_WINDOW_LAPS laps away
//   box     (blue)  this is the in-lap: "box, box"
//   gain    (green) out-lap and after: the sim car is ahead of the real one
//   loss    (red)   out-lap and after: the sim car is behind the real one
// The verdict compares the sim with the real race at the playhead — places
// first, and when the order is unchanged, the time against the real race.
// A verdict that moved nothing calls nothing: no colour without a reason.
export function pitCallAtLap(sim, entryId, uptoLap) {
  const driver = sim?.drivers?.get(entryId);
  if (!driver || !driver.tweaked) return null;
  const cut = Math.max(0, Math.min(Math.floor(uptoLap) || 0, sim.totalLaps));
  if (cut < 1) return null;

  for (const stopLap of driver.newStopLaps) {
    const inLap = stopLap - 1;
    const lapsToGo = inLap - cut;
    if (lapsToGo === 0) return { entryId, kind: 'box', tone: 'blue', stopLap };
    if (lapsToGo > 0 && lapsToGo <= PIT_WINDOW_LAPS) {
      return { entryId, kind: 'window', tone: 'blue', stopLap, lapsToGo };
    }
    if (cut >= stopLap && cut < stopLap + VERDICT_LAPS) {
      const simPos = sim.simPositions.get(entryId)?.[cut - 1] ?? null;
      const basePos = sim.basePositions.get(entryId)?.[cut - 1] ?? null;
      const places = simPos != null && basePos != null ? basePos - simPos : 0;
      const seconds = driver.deltaVsBaseline[cut - 1];
      const gained = places > 0 || (places === 0 && Number.isFinite(seconds) && seconds < 0);
      const lost = places < 0 || (places === 0 && Number.isFinite(seconds) && seconds > 0);
      if (!gained && !lost) return null;
      return {
        entryId,
        kind: gained ? 'gain' : 'loss',
        tone: gained ? 'green' : 'red',
        stopLap,
        position: simPos,
        places,
        seconds: Number.isFinite(seconds) ? seconds : null,
      };
    }
  }
  return null;
}

// Every live pit call at the playhead, one per tweaked driver at most.
export function pitCallsAtLap(sim, uptoLap) {
  return (sim?.tweaked ?? [])
    .map((entryId) => pitCallAtLap(sim, entryId, uptoLap))
    .filter(Boolean);
}
