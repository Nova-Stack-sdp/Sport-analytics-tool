/**
 * verify-reference — checks the statistics the platform derived against
 * known-correct published results (src/verification/reference-results.json).
 *
 * What is compared:
 *   - per session: every car's finishing position and points, as stored in
 *     driver_session_stats (what the Statistics page and /api/v1 serve);
 *   - per season: every driver's points and Grand Prix wins
 *     (driver_career_stats) and every team's points (team_season_stats).
 *
 * Read-only. Safe to run against the real database at any time.
 *
 * Usage (from backend/):
 *   node scripts/verify-reference.js
 *   node scripts/verify-reference.js --report ../docs/verification/reference-check.md
 *   node scripts/verify-reference.js --strict     # sessions that aren't ingested also fail
 *
 * Exit code 0 = every ingested reference matched, 1 = at least one mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import {
  compareSeason,
  compareSession,
  formatReport,
  overallStatus,
} from '../src/verification/compareReference.js';

const { PrismaClient } = pkg;
net.setDefaultAutoSelectFamily(false); // same dual-stack fix as src/lib/prisma.js

const here = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_FILE = path.join(here, '../src/verification/reference-results.json');

function parseArgs(argv) {
  const args = { strict: false, report: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--strict') args.strict = true;
    else if (argv[i] === '--report') args.report = argv[++i];
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  return args;
}

/** Derived results for one reference session, or { found: false }. */
async function loadSession(prisma, ref) {
  const candidates = await prisma.session.findMany({
    where: {
      type: ref.sessionType,
      meeting: { season: ref.season, name: { contains: ref.meeting, mode: 'insensitive' } },
    },
    include: {
      meeting: true,
      entries: { include: { driver: true, sessionStats: true } },
    },
  });

  const withResults = candidates
    .map((session) => ({
      session,
      rows: session.entries
        .filter((e) => e.sessionStats && (e.sessionStats.finalPosition != null || e.sessionStats.points != null))
        .map((e) => ({
          carNumber: e.driver.driverNumber,
          driverName: e.driver.name,
          finalPosition: e.sessionStats.finalPosition,
          points: e.sessionStats.points,
        })),
    }))
    .filter((c) => c.rows.length > 0);

  if (withResults.length === 0) return { found: false };
  if (withResults.length > 1) {
    console.warn(`Warning: ${withResults.length} sessions match ${ref.id}; checking the first (${withResults[0].session.id}).`);
  }
  return { found: true, sessionId: withResults[0].session.id, rows: withResults[0].rows };
}

async function loadSeason(prisma, season) {
  const [sessions, drivers, teams] = await Promise.all([
    prisma.session.findMany({
      where: {
        type: { in: ['Race', 'Sprint'] },
        meeting: { season },
        events: { some: { eventType: 'classification', supersededById: null } },
      },
      include: { meeting: true },
    }),
    prisma.driverCareerStats.findMany({ where: { season }, include: { driver: true } }),
    prisma.teamSeasonStats.findMany({ where: { season }, include: { team: true } }),
  ]);
  return {
    coveredSessions: sessions.map((s) => ({ meeting: s.meeting.name, sessionType: s.type })),
    drivers: drivers.map((d) => ({
      carNumber: d.driver.driverNumber, driverName: d.driver.name, points: d.points, wins: d.wins,
    })),
    teams: teams.map((t) => ({ name: t.team.name, points: t.points })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reference = JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8'));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  try {
    const results = [];
    for (const ref of reference.sessions) {
      results.push(compareSession(ref, await loadSession(prisma, ref)));
    }
    for (const ref of reference.seasons) {
      results.push(compareSeason(ref, reference.sessions, await loadSeason(prisma, ref.season)));
    }

    const report = formatReport(results, { strict: args.strict });
    console.log(report);
    if (args.report) {
      fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
      fs.writeFileSync(args.report, report);
      console.log(`Report written to ${args.report}`);
    }
    process.exitCode = overallStatus(results, { strict: args.strict }) === 'pass' ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
