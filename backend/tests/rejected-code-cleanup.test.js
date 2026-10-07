import { jest } from '@jest/globals';
import {
  createRejectedCodeCleanup,
  purgeRejectedCodeSubmissions,
  readRejectedCodeCleanupConfig,
} from '../src/jobs/rejected-code-cleanup.js';

const NOW = new Date('2026-10-15T12:00:00Z');
const config = { enabled: true, retentionDays: 7, intervalMs: 3600000, batchSize: 2 };
const makePrisma = () => ({
  codeSubmission: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
});

afterEach(() => { jest.useRealTimers(); });

test('uses seven days and an hourly interval; rejects unsafe configuration', () => {
  expect(readRejectedCodeCleanupConfig({})).toEqual({ ...config, batchSize: 100 });
  for (const [name, value] of [
    ['REJECTED_CODE_RETENTION_DAYS', '0'],
    ['REJECTED_CODE_RETENTION_DAYS', '-1'],
    ['REJECTED_CODE_RETENTION_DAYS', 'NaN'],
    ['REJECTED_CODE_CLEANUP_INTERVAL_MS', '2147483648'],
    ['REJECTED_CODE_CLEANUP_BATCH_SIZE', '1.5'],
    ['REJECTED_CODE_CLEANUP_ENABLED', 'yes'],
  ]) expect(() => readRejectedCodeCleanupConfig({ [name]: value })).toThrow(name);
});

test('deletes bounded batches, repeating the age/status/verified guards on each delete', async () => {
  const prisma = makePrisma();
  prisma.codeSubmission.findMany
    .mockResolvedValueOnce([{ id: 'old-a' }, { id: 'old-b' }])
    .mockResolvedValueOnce([{ id: 'old-c' }]);
  prisma.codeSubmission.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
  const expectedGuard = {
    status: 'rejected', reviewedAt: { lte: new Date('2026-10-08T12:00:00Z') }, verifiedCode: { is: null },
  };
  expect(await purgeRejectedCodeSubmissions(prisma, { now: NOW, batchSize: 2 })).toEqual({
    deleted: 3, batches: 2, cutoff: expectedGuard.reviewedAt.lte,
  });
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledWith({
    where: expectedGuard, orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }], select: { id: true }, take: 2,
  });
  expect(prisma.codeSubmission.deleteMany).toHaveBeenNthCalledWith(1, {
    where: { ...expectedGuard, id: { in: ['old-a', 'old-b'] } },
  });
  expect(prisma.codeSubmission.deleteMany).toHaveBeenNthCalledWith(2, {
    where: { ...expectedGuard, id: { in: ['old-c'] } },
  });
});

test('an empty queue or an invalid clock never issues a deletion', async () => {
  const prisma = makePrisma();
  expect((await purgeRejectedCodeSubmissions(prisma, { now: NOW })).deleted).toBe(0);
  await expect(purgeRejectedCodeSubmissions(prisma, { now: 'invalid' })).rejects.toThrow('current time');
  await expect(purgeRejectedCodeSubmissions(prisma, { retentionDays: -1 })).rejects.toThrow('RETENTION_DAYS');
  expect(prisma.codeSubmission.deleteMany).not.toHaveBeenCalled();
});

test('limits each run to ten batches even when records keep arriving', async () => {
  const prisma = makePrisma();
  prisma.codeSubmission.findMany.mockResolvedValue([{ id: 'candidate' }]);
  prisma.codeSubmission.deleteMany.mockResolvedValue({ count: 1 });
  expect((await purgeRejectedCodeSubmissions(prisma, { now: NOW, batchSize: 1 })).deleted).toBe(10);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(10);
});

test('runs at startup and hourly, repeated starts schedule once, and stop cancels future runs', async () => {
  jest.useFakeTimers();
  const prisma = makePrisma();
  const job = createRejectedCodeCleanup({ prisma, config, now: () => NOW });
  job.start();
  job.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(2);
  await job.stop();
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(2);
});

test('slow runs share one worker; database failures are logged and retried next interval', async () => {
  jest.useFakeTimers();
  const prisma = makePrisma();
  let finish;
  prisma.codeSubmission.findMany.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const logger = { info: jest.fn(), error: jest.fn() };
  const job = createRejectedCodeCleanup({ prisma, config, logger, now: () => NOW });
  job.start();
  const first = job.run();
  expect(job.run()).toBe(first);
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(1);
  finish([]);
  await first;
  prisma.codeSubmission.findMany.mockRejectedValueOnce(new Error('Database unavailable'));
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('retry'), 'Database unavailable');
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(prisma.codeSubmission.findMany).toHaveBeenCalledTimes(3);
  await job.stop();
});

test('disabled cleanup never queries the database or installs a timer', async () => {
  jest.useFakeTimers();
  const prisma = makePrisma();
  const job = createRejectedCodeCleanup({ prisma, config: { ...config, enabled: false } });
  job.start();
  await job.run();
  await jest.advanceTimersByTimeAsync(config.intervalMs);
  expect(jest.getTimerCount()).toBe(0);
  expect(prisma.codeSubmission.findMany).not.toHaveBeenCalled();
  await job.stop();
});
