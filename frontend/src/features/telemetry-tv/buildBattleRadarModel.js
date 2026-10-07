function modelSpeed(entry) {
  if (!Number.isFinite(entry.currentSpeedMph)) return null;
  return {
    value: entry.currentSpeedMph,
    confidence: Number.isFinite(entry.speedConfidenceMph) ? entry.speedConfidenceMph : null,
    isAnchor: /herta/i.test(entry.driverName ?? ''),
  };
}

function gapToAhead(entry, ahead) {
  if (!entry || !ahead) return { value: null, estimated: false };
  if (Number.isFinite(entry.gapToAhead)) {
    return { value: entry.gapToAhead, estimated: false };
  }
  if (Number.isFinite(entry.currentSpeedMph) && Number.isFinite(ahead.currentSpeedMph)) {
    return {
      value: Math.max(0, (ahead.currentSpeedMph - entry.currentSpeedMph) / 12),
      estimated: true,
    };
  }
  return { value: null, estimated: false };
}

function makeCommentary(entries) {
  const closestBattle = entries
    .filter((entry) => entry.position > 1 && entry.gapToAhead != null && entry.gapToAhead > 0)
    .sort((first, second) => first.gapToAhead - second.gapToAhead)[0];
  const messages = [];

  if (closestBattle) {
    const gapLabel = `${closestBattle.gapIsEstimated ? 'about ' : ''}${closestBattle.gapToAhead.toFixed(1)}s`;
    let message = `Battle focus: ${closestBattle.driverName} (P${closestBattle.position}) trails ${closestBattle.aheadDriverName} (P${closestBattle.position - 1}) by ${gapLabel}.`;
    const aheadSpeed = closestBattle.aheadModelSpeed;
    const driverSpeed = closestBattle.modelSpeed;
    const aheadConfidence = aheadSpeed?.isAnchor ? 0 : aheadSpeed?.confidence;
    const driverConfidence = driverSpeed?.isAnchor ? 0 : driverSpeed?.confidence;
    if (aheadSpeed && driverSpeed && aheadConfidence != null && driverConfidence != null) {
      const speedDifference = Math.abs(aheadSpeed.value - driverSpeed.value);
      if (speedDifference <= aheadConfidence + driverConfidence) {
        message += ' Speed bands overlap; no clear pace edge.';
      } else {
        message += ` Derived speed edge: ${speedDifference.toFixed(1)} mph.`;
      }
    }
    messages.push({ description: message });
  } else {
    const secondPlace = entries.find((entry) => entry.position === 2);
    const leader = entries.find((entry) => entry.position === 1);
    if (secondPlace && leader) {
      messages.push({
        description: `Battle focus: ${secondPlace.driverName} (P2) is closest to leader ${leader.driverName}; no timed gap is available.`,
      });
    }
  }

  const biggestMove = entries
    .filter((entry) => Number.isFinite(entry.lapDelta) && entry.lapDelta !== 0)
    .sort((first, second) => Math.abs(second.lapDelta) - Math.abs(first.lapDelta))[0];
  if (biggestMove) {
    const places = Math.abs(biggestMove.lapDelta);
    messages.push({
      description: `${biggestMove.driverName} ${biggestMove.lapDelta > 0 ? 'gained' : 'lost'} ${places} place${places === 1 ? '' : 's'} in the latest chart interval.`,
    });
  }

  return messages;
}

export function buildBattleRadarModel(leaderboard = []) {
  const entries = Array.isArray(leaderboard) ? leaderboard : [];
  const driversByPosition = new Map(entries.map((entry) => [entry.position, entry]));
  const radarEntries = entries.map((entry) => {
    const ahead = entry.position > 1 ? driversByPosition.get(entry.position - 1) : null;
    const gap = gapToAhead(entry, ahead);
    return {
      ...entry,
      aheadDriverName: ahead?.driverName ?? null,
      aheadLastLapTime: ahead?.lastLapTime ?? null,
      gapToAhead: gap.value,
      gapIsEstimated: gap.estimated,
      modelSpeed: modelSpeed(entry),
      aheadModelSpeed: ahead ? modelSpeed(ahead) : null,
    };
  });

  const totalDrivers = radarEntries.length;
  const entriesAtPositions = (positions) => positions
    .map((position) => radarEntries.find((entry) => entry.position === position))
    .filter(Boolean);
  const midpoint = Math.floor(totalDrivers / 2);
  const columns = totalDrivers === 0 ? [] : [
    { label: 'Lead battle', accent: 'accent', entries: entriesAtPositions([1, 2, 3]) },
    { label: 'Midfield pressure', accent: 'amber', entries: entriesAtPositions([midpoint, midpoint + 1, midpoint + 2]) },
    { label: 'Strategy', accent: 'red', entries: entriesAtPositions([totalDrivers, totalDrivers - 1, totalDrivers - 2]) },
  ];

  return {
    entries: radarEntries,
    columns,
    commentary: makeCommentary(radarEntries),
  };
}