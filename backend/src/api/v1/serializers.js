/**
 * Response shapes for the public v1 API.
 *
 * Kept separate from the database rows on purpose: the API contract is what
 * consumers depend on, so it's written out here once instead of leaking
 * whatever the schema happens to look like. Identifiers are the database
 * UUIDs, which never change once issued — a fixture, event, driver or team
 * id held from last season still resolves.
 */

const iso = (value) => (value ? new Date(value).toISOString() : null);

export function fixture(session) {
  const { meeting } = session;
  return {
    id: session.id,
    season: meeting?.season ?? null,
    meeting: meeting ? { id: meeting.id, name: meeting.name } : null,
    circuit: meeting?.circuit
      ? { id: meeting.circuit.id, name: meeting.circuit.name, country: meeting.circuit.country }
      : null,
    sessionType: session.type,
    status: session.status,
    startTime: iso(session.startTime),
    endTime: iso(session.endTime),
    externalIds: { openf1SessionKey: session.openf1Key ?? null },
  };
}

export function driver(d) {
  return d ? { id: d.id, number: d.driverNumber, name: d.name } : null;
}

export function team(t) {
  return t ? { id: t.id, name: t.name, season: t.season } : null;
}

export function event(e) {
  return {
    id: e.id,
    fixtureId: e.sessionId,
    type: e.eventType,
    lap: e.lapNumber,
    occurredAt: iso(e.occurredAt),
    driver: driver(e.entry?.driver),
    team: team(e.entry?.team),
    payload: e.payload,
    submissionId: e.sourceSubmissionId,
    // null while the event is current; the id of its replacement once a
    // correction has superseded it.
    supersededBy: e.supersededById ?? null,
    ingestedAt: iso(e.ingestedAt),
  };
}

export function driverSessionStat(row) {
  return {
    fixtureId: row.entry.sessionId,
    driver: driver(row.entry.driver),
    team: team(row.entry.team),
    finalPosition: row.finalPosition,
    points: row.points,
    positionsGained: row.positionsGained,
    fastestLapMs: row.fastestLapMs,
    avgLapMs: row.avgLapMs,
    totalPitTimeMs: row.totalPitTimeMs,
  };
}

export function driverSeasonStat(row) {
  return {
    season: row.season,
    driver: driver(row.driver),
    points: row.points,
    wins: row.wins,
    podiums: row.podiums,
    dnfCount: row.dnfCount,
  };
}

export function teamSeasonStat(row) {
  return {
    season: row.season,
    team: team(row.team),
    points: row.points,
    wins: row.wins,
    reliabilityRate: row.reliabilityRate,
  };
}

export function submission(s, eventCount) {
  return {
    id: s.id,
    source: s.source,
    status: s.status,
    submittedAt: iso(s.submittedAt),
    submitterId: s.submitterId ?? null,
    reviewedBy: s.reviewedBy ?? null,
    reviewedAt: iso(s.reviewedAt),
    eventCount,
  };
}

/**
 * Which events each derived statistic for one driver in one fixture was
 * computed from — the same selection computeSessionStatsForEntry
 * (src/derivation/pure.js) makes, so the trail points at exactly the events
 * that produced the published figure.
 *
 * @param {Array} events - live events for one entry
 * @returns {object} stat name -> array of event ids
 */
export function sessionStatSources(events) {
  const laps = events.filter((e) => e.eventType === 'lap_completed');
  const timedLaps = laps.filter(
    (e) => !e.payload?.is_pit_out_lap && typeof e.payload?.lap_time_ms === 'number'
  );
  const fastest = timedLaps.reduce(
    (best, e) => (!best || e.payload.lap_time_ms < best.payload.lap_time_ms ? e : best),
    null
  );
  const pits = events.filter((e) => e.eventType === 'pit_stop');
  const classification = events.find((e) => e.eventType === 'classification');
  const grid = events.find((e) => e.eventType === 'grid_position');

  return {
    fastestLapMs: fastest ? [fastest.id] : [],
    avgLapMs: timedLaps.map((e) => e.id),
    totalPitTimeMs: pits.map((e) => e.id),
    finalPosition: classification ? [classification.id] : [],
    points: classification ? [classification.id] : [],
    positionsGained: grid && classification ? [grid.id, classification.id] : [],
  };
}
