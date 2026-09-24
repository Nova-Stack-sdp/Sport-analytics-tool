/**
 * inspect-sessions — read-only report of every Session (fixture) in Neon,
 * with a per-event-type breakdown, so we can tell which ones actually have
 * enough synced data to drive a decoupled Race Replay.
 *
 * Read-only: no writes, no upserts, safe to run against the real database
 * as many times as you like.
 *
 * Usage:
 *   node backend/scripts/inspect-sessions.js
 *
 * Requires DATABASE_URL to be set (same as the rest of the backend — picked
 * up from backend/.env via dotenv, same as openf1-sync.js).
 */

import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const { PrismaClient } = pkg;

// Same dual-stack connection fix used elsewhere in this backend (see
// src/lib/prisma.js and src/jobs/openf1-sync.js) — needed here too since
// this is a standalone script with its own PrismaClient, not the one the
// Express app wires up.
net.setDefaultAutoSelectFamily(false);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// What Race Replay actually needs to reconstruct a leaderboard over time:
//   - lap_completed  -> lap-by-lap progression (the replay's clock)
//   - position_change -> who's in what order, over time
//   - classification -> a real final result to end the replay on
// Everything else (pit_stop, tyre_stint, flag_event, grid_position,
// weather) enriches the replay but isn't required to make it watchable.
const REQUIRED_FOR_REPLAY = ['lap_completed', 'position_change', 'classification'];

async function main() {
  const sessions = await prisma.session.findMany({
    orderBy: { startTime: 'desc' },
    include: { meeting: { include: { circuit: true } } },
  });

  if (sessions.length === 0) {
    console.log('No sessions found in the database at all.');
    return;
  }

  const rows = [];
  for (const session of sessions) {
    const grouped = await prisma.event.groupBy({
      by: ['eventType'],
      where: { sessionId: session.id },
      _count: { _all: true },
    });
    const countByType = Object.fromEntries(grouped.map((g) => [g.eventType, g._count._all]));
    const totalEvents = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const missingRequired = REQUIRED_FOR_REPLAY.filter((type) => !countByType[type]);

    rows.push({
      sessionId: session.id,
      meeting: session.meeting.name,
      circuit: session.meeting.circuit.name,
      season: session.meeting.season,
      type: session.type,
      status: session.status,
      startTime: session.startTime.toISOString().slice(0, 10),
      totalEvents,
      laps: countByType.lap_completed ?? 0,
      posChanges: countByType.position_change ?? 0,
      pitStops: countByType.pit_stop ?? 0,
      tyreStints: countByType.tyre_stint ?? 0,
      flags: countByType.flag_event ?? 0,
      classification: countByType.classification ?? 0,
      gridPos: countByType.grid_position ?? 0,
      replayReady: missingRequired.length === 0 ? 'YES' : `no (missing: ${missingRequired.join(', ')})`,
    });
  }

  console.log(`\n${rows.length} session(s) found in the database:\n`);
  console.table(rows);

  const ready = rows.filter((r) => r.replayReady === 'YES');
  console.log(`\n${ready.length} of ${rows.length} session(s) look replay-ready (have laps, position changes, and a classification).`);
  if (ready.length > 0) {
    console.log('Replay-ready session IDs:');
    for (const r of ready) {
      console.log(`  ${r.sessionId}  —  ${r.meeting} (${r.season}) · ${r.type} · ${r.circuit}`);
    }
  }

  const circuits = [...new Map(rows.map((r) => [r.circuit, r])).keys()];
  console.log(`\nDistinct circuits represented: ${circuits.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('inspect-sessions failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
