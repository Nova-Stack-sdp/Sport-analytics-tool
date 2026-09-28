/**
 * Recompute every derived table from the event log.
 *
 * Use after changing a derivation rule (e.g. sprint points in season
 * totals) or to fill in sessions that were synced before derivation ran
 * automatically. Safe to run any number of times: the tables are pure
 * projections of the live events, so a rerun produces the same numbers.
 *
 * Works in bulk (see src/derivation/rebuild.js) rather than replaying
 * runDerivationForSession() per session, which took 8+ hours against Neon
 * for ~100 sessions. This takes about a minute.
 *
 * Usage (from backend/):
 *   node src/jobs/backfill-derivation.js                   # everything
 *   node src/jobs/backfill-derivation.js --aggregates-only # season/career/head-to-head only
 */
import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { rebuildAggregates, rebuildSessionStats } from '../derivation/rebuild.js';

const { PrismaClient, SubmissionStatus } = pkg;

net.setDefaultAutoSelectFamily(false); // see src/lib/prisma.js for why

const CONCURRENCY = 5; // sessions rebuilt at once (the connection pool holds 10)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const aggregatesOnly = process.argv.includes('--aggregates-only');
  const started = Date.now();
  const seconds = () => ((Date.now() - started) / 1000).toFixed(1);

  const sessions = await prisma.session.findMany({
    where: {
      submissions: {
        some: {
          status: { in: [SubmissionStatus.accepted, SubmissionStatus.partially_accepted] },
        },
      },
    },
    select: { id: true, type: true, meeting: { select: { name: true, season: true } } },
    orderBy: { startTime: 'asc' },
  });
  console.log(`Found ${sessions.length} session(s) with accepted data.`);

  if (!aggregatesOnly) {
    let next = 0;
    let done = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < sessions.length) {
        const session = sessions[next++];
        const rows = await rebuildSessionStats(prisma, session.id);
        done += 1;
        console.log(
          `[${done}/${sessions.length}] ${session.meeting.name} ${session.meeting.season} ${session.type}: ${rows} driver row(s)`
        );
      }
    }));
    console.log(`Session stats rebuilt (${seconds()} s).`);
  }

  const counts = await rebuildAggregates(prisma, sessions.map((s) => s.id));
  console.log(
    `Aggregates rebuilt: ${counts.careerStats} driver-season, ${counts.teamStats} team-season, ` +
    `${counts.headToHead} head-to-head row(s) (${seconds()} s).`
  );
  console.log('Backfill complete.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
