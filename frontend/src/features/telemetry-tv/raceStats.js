// Turns the race-level numbers the API already serves into two models the
// page renders as a broadcast-style overview band and a lead-battle chart:
// buildRaceOverview (winner, pole, fastest lap, pace, distance and action
// numbers) and buildLeadBattle (who led which laps, with caution windows).
// Pure functions only — unit-testable without a browser. Every field falls
// back to null so the cards can omit tiles the payload does not support
// rather than inventing numbers.

import { carKey } from './raceAnalytics.js';

// Guard null/undefined/blank BEFORE coercion: Number(null) is 0, not NaN,
// which would turn missing laps into a bogus lap 0.
function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Official name shape is "LastName, FirstName" in stretches and mixed
// elsewhere; display reads "FirstName LastName" either way.
export function driverDisplayName(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!trimmed.includes(',')) return trimmed;
  const [lastName, firstName] = trimmed.split(',').map((part) => part.trim());
  return firstName && lastName ? `${firstName} ${lastName}` : trimmed;
}

export function buildRaceOverview(race) {
  const summary = race?.eventSummary && typeof race.eventSummary === 'object' ? race.eventSummary : {};
  const stats = race?.stats && typeof race.stats === 'object' ? race.stats : {};
  const passes = stats.passes ?? summary.passes ?? null;
  const bestLap = stats.bestLap ?? summary.bestLap ?? null;

  const winnerRow = Array.isArray(race?.podium)
    ? race.podium.find((entry) => Number(entry?.pos) === 1)
    : null;

  return {
    winner: winnerRow
      ? {
        driver: driverDisplayName(winnerRow.driver) ?? winnerRow.driver ?? null,
        car: carKey(winnerRow.car),
        team: winnerRow.team ?? null,
        started: numberOrNull(winnerRow.started),
      }
      : null,
    pole: race?.pole
      ? { driver: driverDisplayName(race.pole.driver) ?? race.pole.driver ?? null, car: carKey(race.pole.car) }
      : null,
    fastestLap: bestLap && numberOrNull(bestLap.sec) != null
      ? {
        seconds: numberOrNull(bestLap.sec),
        lap: numberOrNull(bestLap.lap),
        driver: driverDisplayName(bestLap.driver) ?? bestLap.driver ?? null,
        speedMph: numberOrNull(bestLap.mph),
      }
      : null,
    averageSpeedMph: numberOrNull(summary.avgSpeed) ?? numberOrNull(stats.avgSpeedMph),
    raceTime: typeof summary.raceTime === 'string' && summary.raceTime.trim() !== ''
      ? summary.raceTime.trim()
      : null,
    leadChanges: numberOrNull(stats.leadChangesOfficial) ?? numberOrNull(summary.leadChanges),
    leaderCount: numberOrNull(stats.leadDriversOfficial) ?? numberOrNull(summary.leadDrivers),
    cautions: {
      count: numberOrNull(stats.cautionCount) ?? numberOrNull(summary.cautions),
      laps: numberOrNull(stats.cautionLaps) ?? numberOrNull(summary.cautionLaps),
    },
    greenLaps: numberOrNull(stats.greenLaps) ?? numberOrNull(summary.greenLaps),
    passes: passes && typeof passes === 'object'
      ? { total: numberOrNull(passes.total), position: numberOrNull(passes.position) }
      : null,
    mostLapsLed: stats.mostLapsLed && typeof stats.mostLapsLed === 'object'
      ? {
        driver: driverDisplayName(stats.mostLapsLed.driver) ?? stats.mostLapsLed.driver ?? null,
        car: carKey(stats.mostLapsLed.car),
        laps: numberOrNull(stats.mostLapsLed.laps),
      }
      : null,
    totalLaps: numberOrNull(summary.totalLaps) ?? numberOrNull(race?.session?.totalLaps),
  };
}

// Stretches of consecutive laps each car led, in lap order, with caution
// windows for shading and a per-driver laps-led tally sorted high to low.
// Null when the payload carries no lead stretches at all.
export function buildLeadBattle(race) {
  const stretches = (Array.isArray(race?.leaders) ? race.leaders : [])
    .map((entry) => ({
      car: carKey(entry?.car),
      driver: driverDisplayName(entry?.driver) ?? entry?.driver ?? null,
      fromLap: numberOrNull(entry?.from),
      toLap: numberOrNull(entry?.to),
      laps: numberOrNull(entry?.laps),
    }))
    .filter((stretch) => (
      stretch.fromLap != null
      && stretch.toLap != null
      && stretch.toLap >= stretch.fromLap
    ))
    .sort((first, second) => first.fromLap - second.fromLap);

  if (stretches.length === 0) return null;

  const totalLaps = Math.max(...stretches.map((stretch) => stretch.toLap));

  const cautions = (Array.isArray(race?.cautions) ? race.cautions : [])
    .map((caution) => ({
      fromLap: numberOrNull(caution?.from),
      toLap: numberOrNull(caution?.to),
    }))
    .filter((caution) => (
      caution.fromLap != null
      && caution.toLap != null
      && caution.toLap >= caution.fromLap
    ))
    .sort((first, second) => first.fromLap - second.fromLap);

  const led = new Map();
  for (const stretch of stretches) {
    const key = stretch.car ?? stretch.driver ?? 'unknown';
    const current = led.get(key) ?? { car: stretch.car, driver: stretch.driver, laps: 0 };
    current.laps += stretch.laps ?? (stretch.toLap - stretch.fromLap + 1);
    led.set(key, current);
  }
  const lapsLed = [...led.values()]
    .map((entry) => ({ ...entry, laps: entry.laps }))
    .sort((first, second) => second.laps - first.laps);
  const leaderKey = lapsLed[0] ? (lapsLed[0].car ?? lapsLed[0].driver) : null;

  return {
    stretches: stretches.map((stretch) => ({
      ...stretch,
      isLeader: leaderKey != null && (stretch.car ?? stretch.driver) === leaderKey,
    })),
    cautions,
    totalLaps,
    lapsLed,
    leaderCar: lapsLed[0]?.car ?? null,
    leaderLaps: lapsLed[0]?.laps ?? null,
  };
}
