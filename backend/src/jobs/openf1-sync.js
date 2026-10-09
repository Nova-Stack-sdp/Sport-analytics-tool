/**
 * OpenF1 sync job
 *
 * Pulls all data for one completed session from the OpenF1 API and writes it
 * through the same pipeline a manual upload would use: one Submission per
 * sync run, validated events, inserted as a batch.
 *
 * Usage:
 *   node src/jobs/openf1-sync.js <session_key>
 *
 * Find a session_key via, e.g.:
 *   https://api.openf1.org/v1/sessions?year=2023&session_name=Race&country_name=Bahrain
 *
 * The work itself lives in src/ingestion/openf1/ (syncOpenF1Session): the
 * same pipeline RaceSync runs in-process when a user adds a race. This file
 * is the command-line wrapper — its own database connection, the derivation
 * run inline, and the run printed as it goes. Known OpenF1 limitations are
 * listed in src/ingestion/openf1/mapEvents.js.
 *
 * RE-RUNNING IS SAFE: every run is compared against what's already stored
 * (see src/ingestion/planIngestion.js). Events already stored unchanged are
 * skipped, new ones are inserted, and changed ones are stored as corrections
 * that supersede the old version — so syncing a session twice never
 * double-counts. Each run's counts are saved on its Submission (`summary`).
 */

import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { runDerivationForSession } from '../derivation/index.js';
import { createOpenF1Client } from '../ingestion/openf1/client.js';
import { syncOpenF1Session } from '../ingestion/openf1/syncSession.js';

const { PrismaClient } = pkg;

// Same Node dual-stack connection fix as src/lib/prisma.js — see that file
// for the full explanation. This job connects to Postgres independently
// (it's a standalone script, not run through the Express app), so it needs
// the fix applied here too.
net.setDefaultAutoSelectFamily(false);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const sessionKeyArg = process.argv[2];
if (!sessionKeyArg) {
  console.error('Usage: node src/jobs/openf1-sync.js <session_key>');
  process.exit(1);
}

console.log(`Syncing session_key=${sessionKeyArg}...`);
syncOpenF1Session(sessionKeyArg, {
  prisma,
  client: createOpenF1Client(),
  runDerivation: runDerivationForSession,
  onProgress: ({ stage, state, ms, detail }) => {
    if (state === 'done') console.log(`  ${stage.padEnd(10)} ${String(ms).padStart(6)} ms  ${detail ?? ''}`);
  },
})
  .then((result) => {
    const { summary, submission, rejections } = result;
    if (rejections.length > 0) {
      console.warn(`${rejections.length} record(s) rejected:`);
      for (const r of rejections.slice(0, 50)) console.warn(`  [${r.eventType}] ${r.reason}`);
      if (rejections.length > 50) console.warn(`  ...and ${rejections.length - 50} more (all saved on the submission)`);
    }
    console.log(
      `Submission ${submission.id} — status: ${submission.status}. `
      + `Inserted ${summary.inserted}, corrected ${summary.corrected}, `
      + `already stored ${summary.unchanged}, rejected ${summary.rejected}.`
    );
    if (!result.changed) {
      console.log('Nothing new for this session — derived statistics are already up to date.');
    }
    console.log(`Done in ${result.readyMs} ms.`);
  })
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
