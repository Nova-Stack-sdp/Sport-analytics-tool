function carKey(value) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '');
}

function getDriverName(carNumber, race, driversByCar) {
  const key = carKey(carNumber);
  const classification = driversByCar.get(key);
  const name = classification?.DriverName
    ?? [classification?.FirstName, classification?.LastName].filter(Boolean).join(' ')
    ?? race.lapChart?.legend?.[key]?.driver;
  if (typeof name === 'string' && name.includes(',')) {
    const [lastName, firstName] = name.split(',').map((part) => part.trim());
    return firstName && lastName ? `${firstName} ${lastName}` : name;
  }
  return name ?? `Car ${key}`;
}

function positionsByCar(positionMap) {
  return new Map(Object.entries(positionMap ?? {}).map(([position, car]) => [carKey(car), Number(position)]));
}

function findOvertakes(race, lap, driversByCar) {
  const currentPositions = positionsByCar(race.lapChart?.positions?.[lap]);
  const previousPositions = positionsByCar(race.lapChart?.positions?.[lap - 1]);
  const overtakes = [];

  currentPositions.forEach((currentPosition, carNumber) => {
    const previousPosition = previousPositions.get(carNumber);
    if (previousPosition == null) return;

    currentPositions.forEach((otherCurrentPosition, otherCarNumber) => {
      if (carNumber === otherCarNumber || currentPosition >= otherCurrentPosition) return;
      const otherPreviousPosition = previousPositions.get(otherCarNumber);
      if (otherPreviousPosition == null || previousPosition <= otherPreviousPosition) return;
      overtakes.push({
        driverName: getDriverName(carNumber, race, driversByCar),
        passedDriverName: getDriverName(otherCarNumber, race, driversByCar),
        position: currentPosition,
      });
    });
  });

  return overtakes;
}

function findPitStops(race, lap, driversByCar) {
  return (race.pitStops ?? []).flatMap((entry) => {
    const stops = Array.isArray(entry.stops) ? entry.stops : [entry];
    return stops
      .filter((stop) => Number(stop.raceLap ?? stop.lap) === lap)
      .map((stop) => entry.driver ?? getDriverName(entry.car ?? stop.car, race, driversByCar));
  });
}

function findCrashes(race, lap) {
  return (race.events ?? [])
    .filter((event) => String(event.type ?? event.eventType).toLowerCase() === 'crash'
      && Number(event.lap ?? event.lapNumber ?? event.raceLap) === lap)
    .map((event) => {
      const drivers = Array.isArray(event.drivers) ? event.drivers : [];
      const names = drivers.slice(0, 3).join(', ');
      const otherCount = Math.max(0, drivers.length - 3);
      const participants = names
        ? `${names}${otherCount ? ` and ${otherCount} more` : ''}`
        : 'Multiple cars';
      return `Crash on lap ${lap}: ${participants}.`;
    });
}

export function buildMasterboardCommentary(race, lapState) {
  if (!race || !lapState?.lap) return [];
  if (lapState.lap === 1) return [{ description: 'Race start: Lap 1.' }];

  const lap = lapState.lap;
  const driversByCar = new Map((race.classification ?? []).map((entry) => [carKey(entry.CarNumber), entry]));
  const messages = [
    ...findCrashes(race, lap),
    ...findOvertakes(race, lap, driversByCar).map((overtake) => (
      `Overtake: ${overtake.driverName} moves ahead of ${overtake.passedDriverName} for P${overtake.position}.`
    )),
    ...findPitStops(race, lap, driversByCar).map((driverName) => `Pit stop: ${driverName} stops on lap ${lap}.`),
  ];

  if (lapState.isFinished) {
    const winner = (race.classification ?? []).find((entry) => Number(entry.PositionFinish) === 1);
    messages.push(`Race finished${winner?.DriverName ? `: ${winner.DriverName} wins` : ''}.`);
  }

  return (messages.length ? messages : [`Lap ${lap}.`]).map((description) => ({ description }));
}