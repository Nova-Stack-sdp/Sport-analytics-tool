// The Simulation & Strategy Engine's model — the race the user re-runs after
// moving their team's decisions, computed against the real race as ground
// truth. Pure and synchronous like raceSyncReadings beside it, so a whole
// simulated race can be checked without rendering it.
//
// The model is a DELTA model, deliberately: the real lap times are the pace of
// record, and a tweak only changes the two things a strategy decision actually
// changes — how old the tyres are on each lap, and which lap carries the pit
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
// earlier while the second holds. paceDelta is seconds added to every timed
// lap (positive = eased off).
export const DEFAULT_TWEAK = { pitShift: 0, paceDelta: 0, stopShifts: [] };

export const tweakIsNoop = (tweak) =>
  !tweak ||
  ((tweak.pitShift ?? 0) === 0 &&
    (tweak.paceDelta ?? 0) === 0 &&
    (tweak.stopShifts ?? []).every((shift) => !shift));

export const anyTweakActive = (tweaks) =>
  Object.values(tweaks ?? {}).some((tweak) => !tweakIsNoop(tweak));

// ---------------------------------------------------------------------------
// Fitting — wear per compound and the pit-lane loss, from the field's own laps
// ---------------------------------------------------------------------------

// Least squares: slope and intercept of y on x. Nothing fancier is warranted —
// the relationship being fitted is "a lap of tyre age costs roughly a constant
// tenth or two", which over a stint is genuinely close to linear.
function leastSquares(points) {
  const n = points.length;
  if (n < 2) return null;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let distinctX = new Set();
  for (const p of points) {
    sxx += (p.x - meanX) * (p.x - meanX);
    sxy += (p.x - meanX) * (p.y - meanY);
    distinctX.add(p.x);
  }
  if (sxx === 0 || distinctX.size < 2) return null; // no slope without spread
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

// Tyre age of one lap inside its stint: the first lap a set is on is age 1.
// Calendar laps, so a stoppage interval still ages the tyre (the stint ran on)
// even though it never re-prices it. Same shape as stintMapFor's entries, so
// the baseline and re-scheduled maps can be differenced lap by lap.
function stintAges(segments) {
  const ageByLap = new Map();
  segments.forEach((segment, stintIndex) => {
    const compound = segment.compound ?? null;
    for (let lap = segment.fromLap; lap <= segment.toLap; lap += 1) {
      ageByLap.set(lap, { stintIndex, age: lap - segment.fromLap + 1, compound });
    }
  });
  return ageByLap;
}

// Fit the field-wide model: per-compound wear (s per lap of age) and the
// pit-lane loss (s). Every timed lap of every driver on a compound votes on
// that compound's (slope, intercept); the sim uses only the SLOPE, applied as
// a delta on each driver's own logged pace, so field-average wear never
// overwrites a driver's real speed. The intercept is field-average fresh pace,
// used once: to predict a stop's in-lap and cut the pit loss out of it as the
// residual the tyres can't explain.
//
// A stint's last lap is its in-lap when a stop follows, and an in-lap is not
// a tyre-wear data point — its time carries the pit loss itself. Including it
// would let the fit explain pit time as wear and understate the loss, so the
// wear fit stops one lap short of every stint that ends in a stop (the loss
// is gathered from those same laps below, once, as the median residual).
export function fitRaceModel(drivers, totalLaps) {
  const pointsByCompound = new Map(); // compound -> [{x: age, y: time}]
  const stops = []; // { inLapTime, predicted } for the pit-loss median

  for (const driver of drivers ?? []) {
    const times = driver?.lapTimeSeconds ?? [];
    const segments = stintSegments(driver, totalLaps);

    segments.forEach((segment, index) => {
      const key = String(segment.compound ?? '').toLowerCase();
      if (!pointsByCompound.has(key)) pointsByCompound.set(key, []);
      const endsInStop = index < segments.length - 1;
      const lastWearLap = endsInStop ? segment.toLap - 1 : segment.toLap;
      for (let lap = segment.fromLap; lap <= lastWearLap; lap += 1) {
        const seconds = times[lap - 1];
        if (isTimed(seconds)) {
          pointsByCompound.get(key).push({ x: lap - segment.fromLap + 1, y: seconds });
        }
      }
    });

    // Pit loss: the in-lap is the last lap of the stint being left. Its logged
    // time minus the model's prediction at that age on that compound is the
    // time spent beyond driving the lap — the pit lane. (The out-lap is the
    // first lap of the NEW stint and reads as a normal cold lap, so it is not
    // double-counted here.)
    segments.slice(1).forEach((segment, index) => {
      const inLap = segment.fromLap - 1;
      const seconds = times[inLap - 1];
      const oldCompound = String(segments[index].compound ?? '').toLowerCase();
      if (!isTimed(seconds)) return;
      stops.push({ inLapTime: seconds, compound: oldCompound, age: inLap - segments[index].fromLap + 1 });
    });
  }

  const degradation = {};
  const freshPace = {};
  const fitSamples = {};
  for (const [compound, points] of pointsByCompound) {
    const fit = leastSquares(points);
    degradation[compound] = fit ? fit.slope : 0;
    freshPace[compound] = fit ? fit.intercept : null;
    fitSamples[compound] = points.length;
  }

  const residuals = stops
    .filter((stop) => freshPace[stop.compound] != null)
    .map((stop) => stop.inLapTime - (freshPace[stop.compound] + degradation[stop.compound] * stop.age))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const middle = Math.floor(residuals.length / 2);
  const pitLoss =
    residuals.length === 0
      ? 0
      : residuals.length % 2 === 1
        ? residuals[middle]
        : (residuals[middle - 1] + residuals[middle]) / 2;

  return { degradation, freshPace, pitLoss, fitSamples, stopSamples: residuals.length };
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

// Stint map for a lap schedule: lap -> { stintIndex, age, compound }. The
// compound SEQUENCE is preserved — moving a stop changes stint lengths, not
// what tyres the team fitted.
function stintMapFor(compounds, stopLaps, totalLaps) {
  const map = new Map();
  const boundaries = [...stopLaps, totalLaps + 1];
  let from = 1;
  for (let stintIndex = 0; stintIndex < boundaries.length; stintIndex += 1) {
    const to = boundaries[stintIndex] - 1;
    const compound = compounds[Math.min(stintIndex, compounds.length - 1)] ?? null;
    for (let lap = from; lap <= Math.min(to, totalLaps); lap += 1) {
      map.set(lap, { stintIndex, age: lap - from + 1, compound });
    }
    from = to + 1;
  }
  return map;
}

// The per-lap price of moving a stop. Untimed laps (stoppages) pass through
// untouched — a red-flag interval is the clock's number, not the car's, and is
// never re-priced. Timed laps take:
//   compound — when a stop moves, the laps between the old and new in-lap
//           change compound in the sim (a logged soft lap is now run on the
//           mediums the team fitted). The price is the driver's OWN clean-lap
//           average difference between the two compounds — never the field's,
//           which would overwrite the driver's real pace. Laps whose compound
//           is unchanged (including every in-lap: you pit on the old compound)
//           pay nothing here;
//   wear  — wearRate(compound) x (new age - old age): fresh tyres where the
//           stop came early, older rubber where a longer stint now runs;
//   pit   — the pit loss relocates to the new in-lap and leaves the old one;
//   pace  — the flat per-lap dial, the driver's speed pillar.
// A compound with no clean laps logged prices at wear only.
function reTimedLap(driver, baseMap, newMap, model, offsets, tweak, lap) {
  const logged = driver.lapTimeSeconds?.[lap - 1];
  if (!isTimed(logged)) return logged;

  const base = baseMap.get(lap);
  const next = newMap.get(lap);
  const baseKey = String(base?.compound ?? '').toLowerCase();
  const nextKey = String(next?.compound ?? '').toLowerCase();
  const compound =
    baseKey && nextKey && baseKey !== nextKey
      ? (offsets.get(nextKey) ?? 0) - (offsets.get(baseKey) ?? 0)
      : 0;
  const wear =
    (model.degradation[nextKey] ?? 0) *
    ((next?.age ?? 0) - (base?.age ?? 0));

  const wasInLap = base && base.isInLap;
  const isInLap = next && next.isInLap;
  const pit = model.pitLoss * ((isInLap ? 1 : 0) - (wasInLap ? 1 : 0));

  return logged + compound + wear + pit + (tweak.paceDelta ?? 0);
}

// The driver's own pace on each compound: the mean of their clean laps on it
// (in-laps out — they carry the pit loss, not pace). Mirrors the wear fit's
// in-lap rule; a stint too short to have a clean lap simply doesn't vote.
function compoundOffsets(driver, segments) {
  const times = driver?.lapTimeSeconds ?? [];
  const sums = new Map();
  const counts = new Map();
  segments.forEach((segment, index) => {
    const endsInStop = index < segments.length - 1;
    const lastLap = endsInStop ? segment.toLap - 1 : segment.toLap;
    const key = String(segment.compound ?? '').toLowerCase();
    for (let lap = segment.fromLap; lap <= lastLap; lap += 1) {
      const seconds = times[lap - 1];
      if (isTimed(seconds)) {
        sums.set(key, (sums.get(key) ?? 0) + seconds);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  });
  const offsets = new Map();
  for (const key of sums.keys()) offsets.set(key, sums.get(key) / counts.get(key));
  return offsets;
}

// One driver's simulated race. Returns per-lap arrays (index lap-1) plus the
// stop schedule, or null when the driver has no laps to speak of.
function simulateDriver(driver, model, tweak, totalLaps) {
  const segments = stintSegments(driver, totalLaps);
  if (segments.length === 0) return null;

  const times = driver.lapTimeSeconds ?? [];
  const compounds = segments.map((segment) => segment.compound);
  const baseStopLaps = pitStops(driver, totalLaps).map((stop) => stop.lap);
  const baseMap = stintAgesWithInLaps(segments, totalLaps);
  const offsets = compoundOffsets(driver, segments);

  const stopLaps = tweakIsNoop(tweak)
    ? baseStopLaps
    : shiftedStopLaps(baseStopLaps, tweak, totalLaps);
  const newMap = stintMapFor(compounds, stopLaps, totalLaps);
  markInLaps(newMap, stopLaps);

  const simLapTimes = [];
  const simCumulative = [];
  const baseCumulative = [];
  let simTotal = 0;
  let baseTotal = 0;
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const sim = reTimedLap(driver, baseMap, newMap, model, offsets, tweak, lap);
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
    paceDeltaApplied: tweak.paceDelta ?? 0,
    simLapTimes,
    simCumulative,
    baseCumulative,
    deltaVsBaseline,
    baseStopLaps,
    newStopLaps: stopLaps,
  };
}

// The in-lap is the last lap of the stint being left — where the pit loss
// lives. stintAges gives age per lap; this tags each lap that is an in-lap.
function stintAgesWithInLaps(segments, totalLaps) {
  const map = stintAges(segments);
  for (const segment of segments.slice(1)) {
    const inLap = segment.fromLap - 1;
    if (map.has(inLap)) map.set(inLap, { ...map.get(inLap), isInLap: true });
  }
  return map;
}

function markInLaps(map, stopLaps) {
  for (const stop of stopLaps) {
    const inLap = stop - 1;
    if (map.has(inLap)) map.set(inLap, { ...map.get(inLap), isInLap: true });
  }
}

// ---------------------------------------------------------------------------
// The field — re-ranking everyone on cumulative race time
// ---------------------------------------------------------------------------

// Positions from cumulative time: at each lap, the drivers who have run it,
// ordered by their race time. This is the honest running order — a car that
// stops earlier is genuinely ahead on the road — and it is how the sim field
// is rebuilt. Only laps a driver has actually run earn a position.
function rankByCumulative(cumulatives, totalLaps) {
  const positions = new Map(); // entryId -> [position per lap]
  const order = []; // entryId per lap, leader first
  for (const id of cumulatives.keys()) positions.set(id, new Array(totalLaps).fill(undefined));

  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const running = [];
    for (const [id, cumulative] of cumulatives) {
      const value = cumulative[lap - 1];
      if (Number.isFinite(value)) running.push({ id, value });
    }
    running.sort((a, b) => a.value - b.value);
    order.push(running.map((entry) => entry.id));
    running.forEach((entry, index) => positions.get(entry.id)[lap - 1] = index + 1);
  }
  return { positions, order };
}

// Gap to the leader's cumulative time, per lap — the trace a gap chart draws.
function gapToLeader(cumulatives, order, totalLaps) {
  const gaps = new Map();
  for (const id of cumulatives.keys()) gaps.set(id, new Array(totalLaps).fill(undefined));
  for (let lap = 1; lap <= totalLaps; lap += 1) {
    const leaders = order[lap - 1];
    if (!leaders || leaders.length === 0) continue;
    const leaderCumulative = cumulatives.get(leaders[0])[lap - 1];
    for (const id of leaders) {
      gaps.get(id)[lap - 1] = cumulatives.get(id)[lap - 1] - leaderCumulative;
    }
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// simulateRace — the whole simulated race, one call
// ---------------------------------------------------------------------------

// Run the sim for a session. `series` is the race-replay lap series (the same
// payload the readings use), `tweaks` is { entryId -> { pitShift, paceDelta } }.
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

  // Baseline cumulative comes straight from the logs for everyone; the sim
  // cumulative differs only where a tweak re-priced a lap.
  const baseCumulatives = new Map();
  const simCumulatives = new Map();
  for (const driver of drivers) {
    const result = byId.get(driver.entryId);
    if (!result) continue;
    baseCumulatives.set(driver.entryId, result.baseCumulative);
    simCumulatives.set(driver.entryId, result.simCumulative);
  }

  const baseRank = rankByCumulative(baseCumulatives, totalLaps);
  const simRank = rankByCumulative(simCumulatives, totalLaps);

  return {
    totalLaps,
    model,
    tweaked: drivers.filter((d) => !tweakIsNoop(tweaks[d.entryId])).map((d) => d.entryId),
    drivers: byId,
    basePositions: baseRank.positions,
    simPositions: simRank.positions,
    baseGapToLeader: gapToLeader(baseCumulatives, baseRank.order, totalLaps),
    simGapToLeader: gapToLeader(simCumulatives, simRank.order, totalLaps),
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
