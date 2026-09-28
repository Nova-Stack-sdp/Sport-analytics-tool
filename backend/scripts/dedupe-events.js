/**
 * dedupe-events — one-off repair for sessions whose events were inserted
 * more than once (every OpenF1 re-sync used to insert the whole session
 * again; inspect-sessions.js shows it as e.g. 44 classification events for
 * a 22-car race).
 *
 * What it does, per session (see src/ingestion/planDuplicateCleanup.js):
 *   - keeps everything the FIRST sync of the session stored, untouched —
 *     including separate records that share a timestamp;
 *   - deletes events a later sync re-inserted unchanged;
 *   - where a later sync brought a changed value, keeps both and marks the
 *     older one as superseded by the newer (recorded as a correction);
 *   - then re-runs the derivation for every session it changed, so the
 *     statistics stop counting the duplicates.
 *
 * SAFE BY DEFAULT: without --apply it only prints what it would do.
 *
 * Usage (from backend/, with DATABASE_URL set as for the rest of the backend):
 *   node scripts/dedupe-events.js                      # dry run, every session
 *   node scripts/dedupe-events.js --apply              # repair every session
 *   node scripts/dedupe-events.js --session <id> [--apply]
 *
 * Run it once after deploying the idempotent sync. Running it again is
 * harmless — a clean session has nothing to change.
 */

import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { planDuplicateCleanup } from '../src/ingestion/planDuplicateCleanup.js';
import { runDerivationForSession } from '../src/derivation/index.js';

const { PrismaClient } = pkg;

// Same dual-stack connection fix as src/lib/prisma.js.
net.setDefaultAutoSelectFamily(false);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sessionArgIndex = args.indexOf('--session');
const onlySessionId = sessionArgIndex >= 0 ? args[sessionArgIndex + 1] : null;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DELETE_BATCH = 1000;

async function main() {
  const sessions = await prisma.session.findMany({
    where: onlySessionId ? { id: onlySessionId } : undefined,
    include: { meeting: true },
    orderBy: { startTime: 'desc' },
  });
  if (sessions.length === 0) {
    console.log(onlySessionId ? `No session with id ${onlySessionId}.` : 'No sessions found.');
    return;
  }

  console.log(apply ? 'APPLYING repairs.\n' : 'DRY RUN — nothing will be changed. Add --apply to repair.\n');

  const rows = [];
  const changedSessionIds = [];

  for (const session of sessions) {
    const events = await prisma.event.findMany({
      where: { sessionId: session.id },
      select: {
        id: true, eventType: true, entryId: true, lapNumber: true, occurredAt: true,
        payload: true, ingestedAt: true, supersededById: true, sourceSubmissionId: true,
      },
    });
    const plan = planDuplicateCleanup(events);
    if (plan.deleteIds.length === 0 && plan.supersede.length === 0 && plan.skipped.length === 0) continue;

    rows.push({
      session: `${session.meeting.name} ${session.meeting.season} · ${session.type}`,
      sessionId: session.id,
      events: events.length,
      duplicateGroups: plan.duplicateGroups,
      toDelete: plan.deleteIds.length,
      toMarkCorrected: plan.supersede.length,
      skipped: plan.skipped.length,
    });

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < plan.deleteIds.length; i += DELETE_BATCH) {
        await tx.event.deleteMany({ where: { id: { in: plan.deleteIds.slice(i, i + DELETE_BATCH) } } });
      }
      for (const { id, supersededById } of plan.supersede) {
        await tx.event.update({ where: { id }, data: { supersededById } });
      }
    }, { maxWait: 15000, timeout: 120000 });
    changedSessionIds.push(session.id);
  }

  if (rows.length === 0) {
    console.log('No duplicate events found — nothing to do.');
    return;
  }
  console.table(rows);

  const totalDelete = rows.reduce((n, r) => n + r.toDelete, 0);
  const totalCorrected = rows.reduce((n, r) => n + r.toMarkCorrected, 0);
  const totalSkipped = rows.reduce((n, r) => n + r.skipped, 0);
  console.log(
    `\n${rows.length} session(s) affected: ${totalDelete} duplicate event(s) ${apply ? 'deleted' : 'to delete'}, `
    + `${totalCorrected} ${apply ? 'marked' : 'to mark'} as corrected, ${totalSkipped} skipped.`
  );
  if (totalSkipped > 0) {
    console.log('Skipped events are already the target of a correction — check those sessions by hand.');
  }

  if (!apply) {
    console.log('\nRe-run with --apply to make these changes.');
    return;
  }

  console.log(`\nRe-running derivation for ${changedSessionIds.length} session(s)...`);
  for (const sessionId of changedSessionIds) {
    await runDerivationForSession(prisma, sessionId);
  }
  console.log('Done. Run node scripts/inspect-sessions.js to confirm the counts.');
}

main()
  .catch((err) => {
    console.error('dedupe-events failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
