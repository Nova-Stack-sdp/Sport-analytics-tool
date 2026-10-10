// What the narrator can say about a race from its lap data: every moment as a
// typed candidate (so the narrator can weigh it — see narrator.js) carrying a
// HEADLINE (what happened) and CONTEXT (why it matters). The context is read
// only from facts the race report carries — the lap chart, the grid, the
// leader runs, the caution windows, the pit list, the leader's gap — never
// inferred causes.
//
//   overtake     where the mover came from, what it means since the start,
//                where the passed car drops to, and whether it was a restart
//   lead change  who it was taken from and how long they had led, which lead
//                change of the race it is, the new leader's grid slot, the gap
//   pit stop     the position it was made from, which stop it is, green or
//                caution (a caution stop is the cheap one), where the car
//                rejoined
//   crash        where the cars were running, and the caution it brought out
//   start/finish the polesitter and the field; the winner's grid slot, laps
//                led, and the race's lead changes and cautions

function carKey(value) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

function displayName(name) {
  if (typeof name === 'string' && name.includes(',')) {
    const [lastName, firstName] = name.split(',').map((part) => part.trim());
    return firstName && lastName ? `${firstName} ${lastName}` : name;
  }
  return name;
}

const ordinal = (n) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${tail}`;
};
const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth'];
const nth = (n) => ORDINAL_WORDS[n - 1] ?? ordinal(n);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Everything one race's commentary reads, indexed once.
function raceIndex(race) {
  const classificationByCar = new Map(
    (race.classification ?? []).map((entry) => [carKey(entry.CarNumber), entry])
  );
  const legend = race.lapChart?.legend ?? {};
  const name = (car) => {
    const key = carKey(car);
    const entry = classificationByCar.get(key);
    const full = entry?.DriverName || [entry?.FirstName, entry?.LastName].filter(Boolean).join(' ');
    return displayName(full || legend[key]?.driver) || `Car ${key}`;
  };
  const positionsAt = (lap) =>
    new Map(
      Object.entries(race.lapChart?.positions?.[lap] ?? {}).map(([position, car]) => [carKey(car), Number(position)])
    );
  const gridOf = (car) => {
    const key = carKey(car);
    const start = Number(classificationByCar.get(key)?.PositionStart ?? legend[key]?.startPos);
    return Number.isFinite(start) && start > 0 ? start : null;
  };
  const carByName = (driver) => {
    const wanted = String(driver ?? '').toLowerCase();
    for (const key of classificationByCar.keys()) {
      const full = name(key).toLowerCase();
      if (full === wanted || full.split(' ').at(-1) === wanted.split(' ').at(-1)) return key;
    }
    return null;
  };
  const cautions = (race.cautions ?? []).map((c) => ({ from: Number(c.from), to: Number(c.to) }));
  const cautionAt = (lap) => cautions.find((c) => lap >= c.from && lap <= c.to) ?? null;
  const leaderLapAt = (lap) => (race.leaderLaps ?? []).find((record) => Number(record.lap) === lap) ?? null;
  return { name, positionsAt, gridOf, carByName, cautions, cautionAt, leaderLapAt };
}

// "1.234" from "00:01.2340"-style gap strings.
function gapSeconds(diff) {
  const match = String(diff ?? '').match(/(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 60 + Number(match[2]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

const joinContext = (parts) => parts.filter(Boolean).join(' · ') || null;

function overtakeMoments(race, index, lap) {
  const now = index.positionsAt(lap);
  const before = index.positionsAt(lap - 1);
  const moments = [];
  now.forEach((position, car) => {
    const was = before.get(car);
    if (was == null) return;
    now.forEach((otherPosition, other) => {
      if (car === other || position >= otherPosition) return;
      const otherWas = before.get(other);
      if (otherWas == null || was <= otherWas) return;
      moments.push({ car, passed: other, position, was, passedNow: otherPosition });
    });
  });
  return moments;
}

function overtakeContext(index, lap, { car, was, passed, passedNow, position }) {
  const grid = index.gridOf(car);
  const caution = index.cautions.find((c) => c.to === lap - 1);
  const parts = [
    caution ? 'on the restart' : null,
    was !== position ? `up from P${was} last lap` : null,
    grid != null && grid > position ? `${plural(grid - position, 'place')} gained since starting P${grid}` : null,
    `${index.name(passed)} drops to P${passedNow}`,
  ];
  return joinContext(parts);
}

function leadChangeContext(race, index, lap, { car, passed }) {
  const runs = (race.leaders ?? []).filter((run) => Number(run.from) <= lap);
  const previous = [...runs].reverse().find((run) => Number(run.from) < lap && carKey(run.car) === carKey(passed));
  const changes = runs.filter((run) => Number(run.from) > 1 && Number(run.from) <= lap).length;
  const grid = index.gridOf(car);
  const gap = gapSeconds(index.leaderLapAt(lap)?.diff);
  return joinContext([
    previous ? `${index.name(passed)} had led since lap ${previous.from}` : null,
    changes > 0 ? `${nth(changes)} lead change of the race` : null,
    grid != null ? `${index.name(car).split(' ').at(-1)} started P${grid}` : null,
    gap != null ? `leads by ${gap.toFixed(1)}s` : null,
  ]);
}

function pitContext(race, index, lap, car) {
  const stopsSoFar = (race.pitStops ?? [])
    .filter((entry) => carKey(entry.car) === carKey(car))
    .flatMap((entry) => entry.stops ?? [entry])
    .filter((stop) => Number(stop.raceLap ?? stop.lap) <= lap).length;
  // The lap chart closes the stop lap with the car back on track: that is
  // where it rejoined. (A lap later it may already have moved again.)
  const after = index.positionsAt(lap).get(carKey(car));
  return joinContext([
    stopsSoFar > 0 ? `${nth(stopsSoFar)} stop` : null,
    index.cautionAt(lap) ? 'under caution — the cheap stop' : 'under green',
    after != null ? `rejoins P${after}` : null,
  ]);
}

// How far back the lap commentary looks: older moments have gone stale on
// the narrator's clock anyway (see narrator.js), so they aren't built.
const LOOKBACK_LAPS = 4;

/**
 * The narrator's candidates for a race without video-stamped events, for the
 * last few laps up to the cursor. Times are LAPS (`at` is the lap it
 * happened on); each carries `text` (the headline) and `context`.
 */
export function lapNarrationCandidates(race, lapState) {
  if (!race || !lapState?.lap) return [];
  const lap = lapState.lap;
  const index = raceIndex(race);
  const candidates = [];
  const add = (type, at, text, extra = {}) =>
    candidates.push({ id: `${type}:${at}:${text}`, type, at, text, confidence: 'high', context: null, ...extra });

  // The start: the polesitter and the field.
  const grid = index.positionsAt(1);
  const leaderAtOne = [...grid.entries()].find(([, position]) => position === 1)?.[0];
  add('green_flag', 1, 'Race start: Lap 1.', {
    drivers: leaderAtOne ? [index.name(leaderAtOne)] : [],
    context: joinContext([
      leaderAtOne ? `${index.name(leaderAtOne)} leads the field away` : null,
      grid.size > 0 ? `${grid.size} cars running` : null,
    ]),
  });

  for (let at = Math.max(2, lap - LOOKBACK_LAPS); at <= lap; at += 1) {
    const running = index.positionsAt(at - 1);

    (race.events ?? [])
      .filter(
        (event) =>
          String(event.type ?? event.eventType).toLowerCase() === 'crash' &&
          Number(event.lap ?? event.lapNumber ?? event.raceLap) === at
      )
      .forEach((event) => {
        const drivers = Array.isArray(event.drivers) ? event.drivers : [];
        const shown = drivers.slice(0, 3).join(', ');
        const more = Math.max(0, drivers.length - 3);
        const where = drivers
          .map((driver) => {
            const car = index.carByName(driver);
            const position = car ? running.get(car) : null;
            return position != null ? `${driver} was running P${position}` : null;
          })
          .filter(Boolean)
          .slice(0, 2);
        const caution = index.cautions.find((c) => c.from === at || c.from === at + 1);
        add('crash', at, `Crash on lap ${at}: ${shown ? `${shown}${more ? ` and ${more} more` : ''}` : 'Multiple cars'}.`, {
          drivers,
          context: joinContext([
            ...where,
            caution
              ? `brings out the ${nth(index.cautions.indexOf(caution) + 1)} caution (laps ${caution.from}–${caution.to})`
              : null,
          ]),
        });
      });

    overtakeMoments(race, index, at).forEach((moment) => {
      const mover = index.name(moment.car);
      const passed = index.name(moment.passed);
      if (moment.position === 1) {
        add('lead_change', at, `Lead change: ${mover} takes the lead from ${passed}.`, {
          drivers: [mover, passed],
          position: 1,
          context: leadChangeContext(race, index, at, moment),
        });
      } else {
        add('overtake', at, `Overtake: ${mover} moves ahead of ${passed} for P${moment.position}.`, {
          drivers: [mover, passed],
          position: moment.position,
          context: overtakeContext(index, at, moment),
        });
      }
    });

    (race.pitStops ?? []).forEach((entry) => {
      (entry.stops ?? [entry])
        .filter((stop) => Number(stop.raceLap ?? stop.lap) === at)
        .forEach((stop) => {
          const car = entry.car ?? stop.car;
          const driver = entry.driver ?? index.name(car);
          const from = running.get(carKey(car));
          add('pit_stop', at, `Pit stop: ${driver} stops on lap ${at}.`, {
            drivers: [driver],
            context: joinContext([from != null ? `from P${from}` : null, pitContext(race, index, at, car)]),
          });
        });
    });
  }

  if (lapState.isFinished) {
    const winner = (race.classification ?? []).find((entry) => Number(entry.PositionFinish) === 1);
    const winnerCar = winner ? carKey(winner.CarNumber) : null;
    const lapsLed = (race.leaders ?? [])
      .filter((run) => winnerCar && carKey(run.car) === winnerCar)
      .reduce((sum, run) => sum + Number(run.laps ?? Number(run.to) - Number(run.from) + 1), 0);
    const changes = (race.leaders ?? []).filter((run) => Number(run.from) > 1).length;
    const start = winnerCar ? index.gridOf(winnerCar) : null;
    add('finish', lap, `Race finished${winner?.DriverName ? `: ${displayName(winner.DriverName)} wins` : ''}.`, {
      drivers: winner?.DriverName ? [displayName(winner.DriverName)] : [],
      context: joinContext([
        start != null ? `from P${start} on the grid` : null,
        lapsLed > 0 ? `led ${plural(lapsLed, 'lap')}` : null,
        `${plural(changes, 'lead change')}`,
        `${plural(index.cautions.length, 'caution')}`,
      ]),
    });
  }
  return candidates;
}

/**
 * Context for a curated broadcast event: where the race stood on its lap —
 * the lap of the race, who led, and whether a caution was out. The event's
 * own text already says what happened; this says when.
 */
export function raceStateContext(race, lap) {
  if (!race || !Number.isFinite(Number(lap)) || Number(lap) < 1) return null;
  const index = raceIndex(race);
  const total = Number(race.session?.totalLaps);
  const leader = [...index.positionsAt(Number(lap)).entries()].find(([, p]) => p === 1)?.[0];
  return joinContext([
    Number.isFinite(total) && total > 0 ? `Lap ${lap} of ${total}` : `Lap ${lap}`,
    leader ? `${index.name(leader)} leads` : null,
    index.cautionAt(Number(lap)) ? 'caution out' : null,
  ]);
}
