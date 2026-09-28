function carKey(value) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayDriverName(value) {
  if (typeof value !== 'string' || !value.includes(',')) return value ?? null;
  const [lastName, firstName] = value.split(',').map((part) => part.trim());
  return firstName && lastName ? `${firstName} ${lastName}` : value;
}

export function deriveIndycarLapState(race, requestedLap = 1) {
  if (!race) return { lap: 0, totalLaps: 0, leaderboard: [], leaderLap: null };

  const positionsByLap = race.lapChart?.positions ?? {};
  const totalLaps = numberOrNull(race.session?.totalLaps)
    ?? Math.max(0, ...Object.keys(positionsByLap).map(Number));
  const lap = Math.max(1, Math.min(totalLaps || 1, Math.floor(numberOrNull(requestedLap) ?? 1)));
  const isFinished = totalLaps > 0 && lap >= totalLaps;
  const classificationByCar = new Map(
    (race.classification ?? []).map((entry) => [carKey(entry.CarNumber), entry])
  );
  const legend = race.lapChart?.legend ?? {};
  const leaderLap = (race.leaderLaps ?? []).find((record) => Number(record.lap) === lap) ?? null;
  const positionsByCarAndLap = new Map();
  const lastSeenByCar = new Map();

  Object.entries(positionsByLap).forEach(([lapKey, positions]) => {
    const recordedLap = Number(lapKey);
    if (!Number.isInteger(recordedLap) || recordedLap < 1 || recordedLap > lap) return;

    const positionsByCar = new Map(
      Object.entries(positions ?? {})
        .map(([position, carNumber]) => [carKey(carNumber), numberOrNull(position)])
    );
    positionsByCarAndLap.set(recordedLap, positionsByCar);

    positionsByCar.forEach((position, carNumber) => {
      const previous = lastSeenByCar.get(carNumber);
      if (!previous || recordedLap > previous.lastLap) {
        lastSeenByCar.set(carNumber, { lastLap: recordedLap, position });
      }
    });
  });

  const leaderboard = [...lastSeenByCar.entries()]
    .map(([carNumber, lastSeen]) => {
      const entry = classificationByCar.get(carNumber) ?? {};
      const chartEntry = legend[carNumber] ?? {};
      const currentPosition = lastSeen.position;
      const startPosition = numberOrNull(entry.PositionStart ?? chartEntry.startPos);
      const previousPosition = positionsByCarAndLap.get(lastSeen.lastLap - 1)?.get(carNumber);

      return {
        carNumber,
        driverName: entry.DriverName
          ?? [entry.FirstName, entry.LastName].filter(Boolean).join(' ')
          ?? displayDriverName(chartEntry.driver)
          ?? `Car ${carNumber}`,
        teamName: entry.TeamName ?? null,
        position: currentPosition,
        lastLap: lastSeen.lastLap,
        currentSpeedMph: lastSeen.lastLap === lap
          && leaderLap
          && carKey(leaderLap.car) === carNumber
          ? numberOrNull(leaderLap.speed)
          : null,
        startPosition,
        lapDelta: previousPosition == null || currentPosition == null
          ? null
          : previousPosition - currentPosition,
        gridDelta: startPosition != null && currentPosition != null
          ? startPosition - currentPosition
          : null,
        finishPosition: numberOrNull(entry.PositionFinish),
      };
    })
    .sort((first, second) => (
      (second.lastLap - first.lastLap)
      || (first.position ?? Infinity) - (second.position ?? Infinity)
    ));

  const visibleLeaderRuns = (race.leaders ?? [])
    .filter((run) => Number(run.from) <= lap)
    .map((run) => {
      const to = Math.min(Number(run.to), lap);
      return { ...run, to, laps: Math.max(0, to - Number(run.from) + 1) };
    });
  const visibleCautions = (race.cautions ?? [])
    .filter((caution) => Number(caution.from) <= lap)
    .map((caution) => {
      const to = Math.min(Number(caution.to), lap);
      return { ...caution, to, laps: Math.max(0, to - Number(caution.from) + 1) };
    });
  const previousLeader = visibleLeaderRuns.filter((run) => Number(run.from) < lap).at(-1);
  const currentLeaderRun = visibleLeaderRuns.at(-1);
  const visiblePitStops = (race.pitStops ?? []).map((entry) => ({
    ...entry,
    stops: (entry.stops ?? []).filter((stop) => Number(stop.raceLap ?? stop.lap) <= lap),
  }));

  return {
    lap,
    totalLaps,
    isFinished,
    leaderboard,
    leaderLap,
    visibleLeaderRuns,
    visibleCautions,
    visiblePitStops,
    raceSoFar: {
      leadChanges: Math.max(0, visibleLeaderRuns.length - 1),
      cautionLaps: visibleCautions.reduce((total, caution) => total + caution.laps, 0),
      leaderChangedThisLap: Boolean(
        lap > 1
        && currentLeaderRun
        && Number(currentLeaderRun.from) === lap
        && previousLeader
        && carKey(currentLeaderRun.car) !== carKey(previousLeader.car)
      ),
    },
  };
}