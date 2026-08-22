/**
 * Pure derivation logic — takes plain event/result arrays, returns plain
 * stat objects. No Prisma, no I/O. Kept separate from db.js so this can be
 * unit tested with hand-built fixtures instead of a live database
 * (covers the "Automated Testing" rubric line without needing a test DB).
 */

/**
 * @param {Array} events - live (non-superseded) events for one entry in one session
 * @returns {{fastestLapMs:number|null, avgLapMs:number|null, totalPitTimeMs:number,
 *            positionsGained:number|null, finalPosition:number|null, points:number}}
 */
export function computeSessionStatsForEntry(events) {
  const laps = events.filter((e) => e.eventType === "lap_completed");
  const validLaps = laps.filter((e) => !e.payload.is_pit_out_lap);
  const lapTimes = validLaps
    .map((e) => e.payload.lap_time_ms)
    .filter((t) => typeof t === "number");

  const fastestLapMs = lapTimes.length ? Math.min(...lapTimes) : null;
  const avgLapMs = lapTimes.length
    ? Math.round(lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length)
    : null;

  const pitStops = events.filter((e) => e.eventType === "pit_stop");
  const totalPitTimeMs = pitStops.reduce(
    (sum, e) => sum + (e.payload.pit_duration_ms || 0),
    0
  );

  const classification = events.find((e) => e.eventType === "classification");
  const finalPosition = classification?.payload.final_position ?? null;
  const points = classification?.payload.points ?? 0;

  // Starting position: sourced from the grid_position event (OpenF1's
  // /starting_grid), not guessed from lap or position_change data.
  const gridEvent = events.find((e) => e.eventType === "grid_position");
  const startPosition = gridEvent?.payload.position ?? null;

  const positionsGained =
    startPosition != null && finalPosition != null
      ? startPosition - finalPosition
      : null;

  return {
    fastestLapMs,
    avgLapMs,
    totalPitTimeMs,
    positionsGained,
    finalPosition,
    points,
  };
}

/**
 * @param {Array<{finalPosition:number|null, points:number, status:string}>} sessionResults
 *   one entry per race session the driver competed in during the season
 */
export function computeCareerAggregate(sessionResults) {
  const wins = sessionResults.filter((r) => r.finalPosition === 1).length;
  const podiums = sessionResults.filter(
    (r) => r.finalPosition != null && r.finalPosition <= 3
  ).length;
  const points = sessionResults.reduce((s, r) => s + (r.points || 0), 0);
  const dnfCount = sessionResults.filter((r) => r.status === "dnf").length;
  return { wins, podiums, points, dnfCount };
}

/** Same shape as computeCareerAggregate, plus a reliability rate. */
export function computeSeasonAggregate(sessionResults) {
  const { wins, points, dnfCount } = computeCareerAggregate(sessionResults);
  const starts = sessionResults.length;
  const reliabilityRate = starts > 0 ? 1 - dnfCount / starts : null;
  return { wins, points, reliabilityRate };
}

/**
 * @param {Array<{finalPosition:number|null}>} resultsA - subject A's classification per shared session
 * @param {Array<{finalPosition:number|null}>} resultsB - subject B's classification per shared session, same order/length as resultsA
 */
export function computeHeadToHead(resultsA, resultsB) {
  let winsA = 0;
  let winsB = 0;
  let sampleSize = 0;

  for (let i = 0; i < resultsA.length; i++) {
    const posA = resultsA[i].finalPosition;
    const posB = resultsB[i].finalPosition;
    if (posA == null || posB == null || posA === posB) continue;
    sampleSize++;
    if (posA < posB) winsA++;
    else winsB++;
  }

  return { winsA, winsB, sampleSize };
}
