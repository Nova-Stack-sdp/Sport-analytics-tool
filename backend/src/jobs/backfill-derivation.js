/**
 * Backfill derivation for sessions synced before derivation was wired into
 * openf1-sync.js.
 *
 * Fixes the situation where a session has real events and an
 * accepted/partially_accepted submission, but empty driver_career_stats /
 * team_season_stats / head_to_head — because runDerivationForSession() was
 * never called for it. Safe to run any number of times: derivation is
 * idempotent (upserts), so re-running it just recomputes the same numbers.
 *
 * Usage:
 *   node src/jobs/backfill-derivation.js
 */
import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { runDerivationForSession } from '../derivation/index.js';

const { PrismaClient, SubmissionStatus } = pkg;

net.setDefaultAutoSelectFamily(false); // see src/lib/prisma.js for why

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      submissions: {
        some: {
          status: { in: [SubmissionStatus.accepted, SubmissionStatus.partially_accepted] },
        },
      },
    },
    select: { id: true, type: true, meeting: { select: { name: true, season: true } } },
  });

  console.log(`Found ${sessions.length} session(s) with accepted data. Running derivation...`);

  for (const session of sessions) {
    console.log(
      `Deriving stats for ${session.meeting.name} ${session.meeting.season} (${session.type}, ${session.id})...`
    );
    await runDerivationForSession(prisma, session.id);
  }

  console.log('Backfill complete.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());