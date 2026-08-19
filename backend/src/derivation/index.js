import {
  deriveSessionStats,
  deriveDriverCareerStats,
  deriveTeamSeasonStats,
  deriveHeadToHead,
} from "./db.js";

/**
 * Run the full derivation cascade for a session: call this after a
 * submission touching that session moves to accepted or
 * partially_accepted — whether the submission came from the OpenF1 sync
 * job or a manual upload, it's the same call.
 *
 * Also call this again after a correcting event is accepted for a session
 * that was already derived — recomputation is idempotent, so re-running it
 * is exactly how a correction propagates through to the projections.
 */
export async function runDerivationForSession(prisma, sessionId) {
  const entries = await deriveSessionStats(prisma, sessionId);
  if (entries.length === 0) return;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { meeting: true },
  });

  // Points/wins/podiums/head-to-head only make sense for sessions that hand
  // out a result (race, sprint) — a quali or practice session still gets its
  // per-entry driver_session_stats above, but doesn't feed the aggregates.
  if (session.type !== "Race" && session.type !== "Sprint") return;

  const season = session.meeting.season;
  const driverIds = [...new Set(entries.map((e) => e.driverId))];
  const teamIds = [...new Set(entries.map((e) => e.teamId))];

  for (const driverId of driverIds) {
    await deriveDriverCareerStats(prisma, driverId, season);
  }
  for (const teamId of teamIds) {
    await deriveTeamSeasonStats(prisma, teamId, season);
  }

  // Head-to-head: teammates only, for now — the pair that shares a garage
  // is the comparison people actually want first. Extending to arbitrary
  // driver pairs later just means calling deriveHeadToHead with a
  // differently-sourced list of pairs; the function itself doesn't care.
  const driversByTeam = new Map();
  for (const e of entries) {
    if (!driversByTeam.has(e.teamId)) driversByTeam.set(e.teamId, []);
    driversByTeam.get(e.teamId).push(e.driverId);
  }
  for (const drivers of driversByTeam.values()) {
    for (let i = 0; i < drivers.length; i++) {
      for (let j = i + 1; j < drivers.length; j++) {
        const [a, b] = [drivers[i], drivers[j]].sort();
        await deriveHeadToHead(prisma, a, b);
      }
    }
  }
}
