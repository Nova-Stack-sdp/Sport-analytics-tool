/**
 * Retain rejected code for seven days after review, then delete it in
 * bounded batches. No work is scheduled merely by importing this module.
 */
const DAY_MS = 24 * 60 * 60_000;
const MAX_BATCHES = 10;

function positiveInteger(env, key, fallback, maximum) {
  const value = env[key] === undefined || env[key] === '' ? fallback : Number(env[key]);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function readRejectedCodeCleanupConfig(env = process.env) {
  const enabled = env.REJECTED_CODE_CLEANUP_ENABLED ?? 'true';
  if (!['true', 'false'].includes(enabled)) {
    throw new Error('REJECTED_CODE_CLEANUP_ENABLED must be true or false');
  }
  return {
    enabled: enabled === 'true',
    retentionDays: positiveInteger(env, 'REJECTED_CODE_RETENTION_DAYS', 7, 36500),
    intervalMs: positiveInteger(env, 'REJECTED_CODE_CLEANUP_INTERVAL_MS', 60 * 60_000, 2147483647),
    batchSize: positiveInteger(env, 'REJECTED_CODE_CLEANUP_BATCH_SIZE', 100, 500),
  };
}

export async function purgeRejectedCodeSubmissions(prisma, {
  retentionDays = 7,
  batchSize = 100,
  now = new Date(),
} = {}) {
  // Validate direct callers too; a bad retention value must never broaden
  // the deletion window by producing an invalid/omitted date filter.
  const checked = readRejectedCodeCleanupConfig({
    REJECTED_CODE_RETENTION_DAYS: retentionDays,
    REJECTED_CODE_CLEANUP_BATCH_SIZE: batchSize,
  });
  const currentTime = new Date(now).getTime();
  if (!Number.isFinite(currentTime)) throw new Error('Cleanup requires a valid current time');
  const cutoff = new Date(currentTime - checked.retentionDays * DAY_MS);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Cleanup requires a valid cutoff');

  const eligible = {
    status: 'rejected',
    reviewedAt: { lte: cutoff },
    verifiedCode: { is: null },
  };
  let deleted = 0;
  let batches = 0;

  for (; batches < MAX_BATCHES; batches += 1) {
    const candidates = await prisma.codeSubmission.findMany({
      where: eligible,
      orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: checked.batchSize,
    });
    if (candidates.length === 0) break;

    // Recheck status, age and the verified relation at deletion time. A
    // concurrent review or another backend's cleanup must not widen this.
    const result = await prisma.codeSubmission.deleteMany({
      where: { ...eligible, id: { in: candidates.map(({ id }) => id) } },
    });
    deleted += result.count;
  }
  return { deleted, batches, cutoff };
}

export function createRejectedCodeCleanup({
  prisma,
  config = readRejectedCodeCleanupConfig(),
  now = () => new Date(),
  logger = console,
}) {
  const checked = readRejectedCodeCleanupConfig({
    REJECTED_CODE_CLEANUP_ENABLED: String(config.enabled),
    REJECTED_CODE_RETENTION_DAYS: config.retentionDays,
    REJECTED_CODE_CLEANUP_INTERVAL_MS: config.intervalMs,
    REJECTED_CODE_CLEANUP_BATCH_SIZE: config.batchSize,
  });
  let timer = null;
  let running = null;

  function run() {
    if (!checked.enabled) return Promise.resolve({ deleted: 0, batches: 0 });
    if (running) return running;
    running = purgeRejectedCodeSubmissions(prisma, {
      retentionDays: checked.retentionDays, batchSize: checked.batchSize, now: now(),
    }).finally(() => { running = null; });
    return running;
  }

  function tick() {
    run().then(({ deleted }) => {
      if (deleted > 0) logger.info(`Rejected code cleanup deleted ${deleted} expired submission(s)`);
    }).catch((error) => {
      logger.error('Rejected code cleanup failed; will retry on the next interval:', error.message);
    });
  }

  return {
    run,
    start() {
      if (!checked.enabled || timer !== null) return;
      timer = setInterval(tick, checked.intervalMs);
      timer.unref?.();
      tick();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      return running ?? Promise.resolve();
    },
  };
}
