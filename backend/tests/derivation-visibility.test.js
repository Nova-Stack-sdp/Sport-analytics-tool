import { jest } from '@jest/globals';
import { deriveSessionStats } from '../src/derivation/db.js';
import { rebuildSessionStats } from '../src/derivation/rebuild.js';

// Statistics may only be built from events of accepted datasets that an
// admin has not deleted. Both the per-session derivation and the bulk
// rebuild must ask the database for exactly that.
const VISIBLE_SOURCE = { status: { in: ['accepted', 'partially_accepted'] }, deletedAt: null };

function fakePrisma() {
  return {
    entry: { findMany: jest.fn().mockResolvedValue([{ id: 'entry-1' }]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    driverSessionStats: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops())),
  };
}

test('per-session derivation ignores events from deleted or unaccepted datasets', async () => {
  const prisma = fakePrisma();
  await deriveSessionStats(prisma, 'session-1');
  expect(prisma.event.findMany).toHaveBeenCalledWith({
    where: expect.objectContaining({ sourceSubmission: VISIBLE_SOURCE }),
  });
});

test('the bulk rebuild applies the same filter', async () => {
  const prisma = fakePrisma();
  await rebuildSessionStats(prisma, 'session-1').catch(() => {});
  expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({ sourceSubmission: VISIBLE_SOURCE });
});
