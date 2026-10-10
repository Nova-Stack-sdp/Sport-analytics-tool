import { jest } from '@jest/globals';

// Every site route that reads the event log must leave out events whose
// dataset an admin deleted. These tests pin the filter each route sends.
const HIDE_DELETED = { sourceSubmission: { deletedAt: null } };

const mockPrisma = {
  session: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  entry: { findMany: jest.fn(), findUnique: jest.fn() },
  event: { groupBy: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  submission: { count: jest.fn(), findMany: jest.fn() },
  meeting: { findFirst: jest.fn() },
  driverSessionStats: { count: jest.fn() },
  driverCareerStats: { findMany: jest.fn() },
  teamSeasonStats: { findMany: jest.fn() },
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;
let buildReplayContext;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
  ({ buildReplayContext } = await import('../src/routes/raceReplay.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.session.findMany.mockResolvedValue([]);
  mockPrisma.event.groupBy.mockResolvedValue([]);
  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.event.count.mockResolvedValue(0);
  mockPrisma.driverSessionStats.count.mockResolvedValue(0);
  mockPrisma.entry.findMany.mockResolvedValue([]);
});

test('fixture list: correction flags and replay readiness ignore deleted datasets', async () => {
  await request(createApp()).get('/api/fixtures');
  for (const [args] of mockPrisma.event.groupBy.mock.calls) {
    expect(args.where).toMatchObject(HIDE_DELETED);
  }
  expect(mockPrisma.event.groupBy).toHaveBeenCalledTimes(2);
});

test('fixture event log leaves out deleted datasets', async () => {
  mockPrisma.session.findUnique.mockResolvedValue(null);
  await request(createApp()).get('/api/fixtures/s1/events');
  expect(mockPrisma.event.findMany.mock.calls[0][0].where).toEqual({ sessionId: 's1', ...HIDE_DELETED });
});

test('race replay is built only from events of undeleted datasets', async () => {
  mockPrisma.session.findUnique.mockResolvedValue({ id: 's1', meeting: { circuit: {} } });
  await buildReplayContext('s1').catch(() => {});
  expect(mockPrisma.event.findMany.mock.calls[0][0].where).toEqual({ sessionId: 's1', ...HIDE_DELETED });
});

test('time travel (changelog and as-of) leaves out deleted datasets', async () => {
  mockPrisma.entry.findUnique.mockResolvedValue({ id: 'e1', driver: { name: 'D' }, team: { name: 'T' } });
  await request(createApp()).get('/api/timetravel/changelog?entryId=e1');
  await request(createApp()).get('/api/timetravel/asof?sessionId=s1&entryId=e1&date=2026-10-01');
  const wheres = mockPrisma.event.findMany.mock.calls.map(([args]) => args.where);
  expect(wheres).toEqual([
    { entryId: 'e1', eventType: 'classification', ...HIDE_DELETED },
    { sessionId: 's1', entryId: 'e1', ...HIDE_DELETED },
  ]);
});

test('overview: event counts and the review queue skip deleted datasets and test data', async () => {
  mockPrisma.session.count.mockResolvedValue(0);
  mockPrisma.submission.count.mockResolvedValue(0);
  mockPrisma.submission.findMany.mockResolvedValue([]);
  mockPrisma.meeting.findFirst.mockResolvedValue(null);
  mockPrisma.session.findFirst.mockResolvedValue({ id: 's1', meeting: { circuit: {} } });

  await request(createApp()).get('/api/overview');

  expect(mockPrisma.submission.count).toHaveBeenCalledWith({
    where: { status: 'pending', purpose: 'race_data', deletedAt: null },
  });
  expect(mockPrisma.submission.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  expect(mockPrisma.event.count.mock.calls[0][0].where).toMatchObject(HIDE_DELETED);
  expect(mockPrisma.event.findMany.mock.calls[0][0].where).toMatchObject({ sessionId: 's1', ...HIDE_DELETED });
});
