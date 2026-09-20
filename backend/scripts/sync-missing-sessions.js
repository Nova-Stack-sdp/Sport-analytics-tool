import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const progressFile = 'scripts/sync-progress.json';
const priorProgress = fs.existsSync(progressFile)
  ? JSON.parse(fs.readFileSync(progressFile, 'utf8'))
  : { succeeded: [] };

// Confirmed synced as of the DB check after the outage:
const alreadySynced = new Set([
  7779,7787,7953,9069,9070,9078,9086,9094,9102,9110,9117,9118,9126,9133,9140,
  9141,9149,9157,9165,9173,9181,9189,9197,9204,9205,9212,9213,9220,9221,
  9472,9480,9488,9496,9506,9507,9515,9523,9531,9539,9549,9550,9558,9566,9574,
  9582,9590,9598,9606,9616,9617,9625,9635,9636,9644,9654,9655,9662,9672,9673,
  9693,9928,9939,9947,9955,9963,9971,9979,9987,9998,10006,10014,10022,10033,
  11234,
  ...priorProgress.succeeded, // in case this script itself gets interrupted again
]);

const cancelled = new Set([11261, 11269]);

const allSessionKeys = [
  7953,7779,7787,9070,9078,9086,9094,9102,9110,9118,9126,9133,9141,9149,9157,9165,9173,9221,9213,9181,9205,9189,9197,
  9069,9117,9140,9220,9212,9204,
  9472,9480,9488,9496,9673,9507,9515,9523,9531,9539,9550,9558,9566,9574,9582,9590,9598,9606,9617,9625,9636,9644,9655,9662,
  9672,9506,9549,9616,9635,9654,
  9693,9998,10006,10014,10022,10033,9987,9979,9971,9963,9955,9947,9939,9928,9920,9912,9904,9896,9888,9877,9869,9858,9850,9839,
  9993,10028,9934,9883,9864,9845,
  11234,11245,11253,11261,11269,11280,11291,11299,11307,11315,11326,11334,11342,11353,11361,11369,11377,11731,11388,11396,11404,11412,11420,11428,11436,
  11240,11275,11286,11321,11348,11383,
];

const toSync = [...new Set(allSessionKeys)].filter(k => !alreadySynced.has(k) && !cancelled.has(k));

console.log(`To sync this run: ${toSync.length}\n`);

const succeeded = [...priorProgress.succeeded];
const failed = [];

function saveProgress() {
  fs.writeFileSync(progressFile, JSON.stringify({ succeeded, failed }, null, 2));
}

for (const [i, key] of toSync.entries()) {
  console.log(`[${i + 1}/${toSync.length}] Syncing session_key=${key}...`);
  try {
    execFileSync('node', ['src/jobs/openf1-sync.js', String(key)], { stdio: 'inherit' });
    succeeded.push(key);
    saveProgress(); // write after EVERY success, not just at the end
  } catch (err) {
    console.error(`FAILED session_key=${key}: ${err.message}`);
    failed.push(key);
    saveProgress();
  }
}

console.log('\n=== SYNC BATCH COMPLETE ===');
console.log(`Total succeeded so far: ${succeeded.length}`);
console.log(`Failed this run: ${failed.length}`);
if (failed.length > 0) console.log('Failed keys:', failed.join(','));
