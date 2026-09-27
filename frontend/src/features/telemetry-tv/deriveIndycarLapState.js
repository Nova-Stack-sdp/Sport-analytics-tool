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
  const classificationByCar = new Map(
    (race.classification ?? []).map((entry) => [carKey(entry.CarNumber), entry])
  );
  const legend = race.lapChart?.legend ?? {};
  const lapPositions = positionsByLap[String(lap)] ?? {};
  const leaderboard = Object.entries(lapPositions)
    .map(([position, carNumber]) => {
      const entry = classificationByCar.get(carKey(carNumber)) ?? {};
      const chartEntry = legend[carKey(carNumber)] ?? {};
      const currentPosition = numberOrNull(position);
      const startPosition = numberOrNull(entry.PositionStart ?? chartEntry.startPos);

      return {
        carNumber: String(carNumber),
        driverName: entry.DriverName
          ?? [entry.FirstName, entry.LastName].filter(Boolean).join(' ')
          ?? displayDriverName(chartEntry.driver)
          ?? `Car ${carNumber}`,
        teamName: entry.TeamName ?? null,
        position: currentPosition,
        startPosition,
        gridDelta: startPosition != null && currentPosition != null
          ? startPosition - currentPosition
          : null,
        finishPosition: numberOrNull(entry.PositionFinish),
      };
    })
    .sort((first, second) => (first.position ?? Infinity) - (second.position ?? Infinity));

  const leaderLap = (race.leaderLaps ?? []).find((record) => Number(record.lap) === lap) ?? null;
  return { lap, totalLaps, leaderboard, leaderLap };
}