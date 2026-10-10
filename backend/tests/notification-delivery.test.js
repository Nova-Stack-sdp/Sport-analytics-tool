import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const db = {
  follow: { findMany: jest.fn() },
  driver: { findMany: jest.fn() },
  team: { findMany: jest.fn() },
  session: { findMany: jest.fn() },
  notification: { createMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: db }));
jest.unstable_mockModule('../src/middleware/requireAuth.js', () => ({
  requireAuth: (req, res, next) => { req.user = { uid: 'firebase-user' }; next(); },
  requireVerifiedEmail: (req, res, next) => next(),
  requireAdmin: (req, res, next) => res.status(403).json({ error: 'Admin only' }),
}));
const { newsEventKey, canonicalNotificationUrl, notifyDriverFans, notifyTeamFans, createNotificationOnce } =
  await import('../src/services/notificationService.js');
const { processNewsNotifications } = await import('../src/routes/news.js');
const { processRaceReminders } = await import('../src/services/raceReminderService.js');
const { notificationsRouter } = await import('../src/routes/notifications.js');
const app = express().use(express.json()).use('/api/notifications', notificationsRouter);

beforeEach(() => {
  jest.resetAllMocks();
  db.notification.createMany.mockResolvedValue({ count: 1 });
  db.driver.findMany.mockResolvedValue([{ id: 'driver', name: 'Lewis Hamilton' }]);
  db.team.findMany.mockResolvedValue([{ id: 'team', name: 'Ferrari' }]);
  db.follow.findMany.mockResolvedValue([]);
});

test('news identity survives changed headlines, tracking links and URL fragments', () => {
  expect(newsEventKey('Old title', 'https://news.test/story/?utm_source=rss#top'))
    .toBe(newsEventKey('New title', 'https://news.test/story?fbclid=abc'));
  expect(newsEventKey('Same', 'https://news.test/story?id=1'))
    .not.toBe(newsEventKey('Same', 'https://news.test/story?id=2'));
  expect(newsEventKey('  Race   RESULTS ', null)).toBe(newsEventKey('Race results', null));
  expect(canonicalNotificationUrl('javascript:alert(1)')).toBeNull();
});

test('one article creates one row per user with a type based on their matched follows', async () => {
  db.follow.findMany.mockResolvedValue([
    { userId: 'both', driverId: 'driver' }, { userId: 'both', teamId: 'team' },
    { userId: 'team-only', teamId: 'team' }, { userId: 'driver-only', driverId: 'driver' },
  ]);
  await processNewsNotifications([{ title: 'Hamilton wins for Ferrari', url: 'https://news.test/win' }]);
  const { data, skipDuplicates } = db.notification.createMany.mock.calls[0][0];
  expect(skipDuplicates).toBe(true);
  expect(data).toHaveLength(3);
  expect(data[0]).toMatchObject({ userId: 'both', title: 'Driver & team news', type: 'driver_news' });
  expect(data[1]).toMatchObject({ userId: 'team-only', title: 'Team news', type: 'team_update' });
  expect(data[2]).toMatchObject({ userId: 'driver-only', type: 'driver_news' });
  expect(new Set(data.map(row => row.eventKey)).size).toBe(1);
});

test('first names alone do not trigger unrelated driver notifications', async () => {
  await processNewsNotifications([{ title: 'Lewis from another sport wins', url: 'https://news.test/other' }]);
  expect(db.follow.findMany).not.toHaveBeenCalled();
  expect(db.notification.createMany).not.toHaveBeenCalled();
});

test('driver and team helpers use follows and share event identity', async () => {
  db.follow.findMany.mockResolvedValue([{ userId: 'fan' }, { userId: 'fan' }]);
  await notifyDriverFans('driver', 'A win', 'The story', 'https://news.test/win');
  await notifyTeamFans('team', 'A win', 'The story', 'https://news.test/win?utm_source=rss');
  expect(db.follow.findMany.mock.calls.map(([args]) => args.where)).toEqual([{ driverId: 'driver' }, { teamId: 'team' }]);
  const first = db.notification.createMany.mock.calls[0][0];
  const second = db.notification.createMany.mock.calls[1][0];
  expect(first.data).toHaveLength(1);
  expect(first.data[0].eventKey).toBe(second.data[0].eventKey);
  expect(second.data[0].type).toBe('team_update');
  expect(first.skipDuplicates).toBe(true);
});

test('race reminders have stable event identity despite grid changes and overlapping follows', async () => {
  const race = {
    id: 'race-1', startTime: '2026-10-09T12:00:00Z', meeting: { name: 'Test GP' },
    entries: [{ driver: { id: 'driver', name: 'Lewis Hamilton' }, team: { id: 'team', name: 'Ferrari' }, events: [] }],
  };
  db.session.findMany.mockResolvedValue([race]);
  db.follow.findMany.mockResolvedValue([{ userId: 'fan', driverId: 'driver' }, { userId: 'fan', teamId: 'team' }]);
  await processRaceReminders();
  race.entries[0].events = [{ payload: { position: 2 } }];
  await processRaceReminders();
  const first = db.notification.createMany.mock.calls[0][0].data;
  const second = db.notification.createMany.mock.calls[1][0].data;
  expect(first).toHaveLength(1);
  expect(first[0].eventKey).toBe('race_reminder:race-1');
  expect(first[0].eventKey).toBe(second[0].eventKey);
  expect(first[0].message).not.toBe(second[0].message);
  expect(first[0].message.match(/Lewis Hamilton/g)).toHaveLength(1);
  expect(second[0].message).toContain('P2');
  expect(second[0].message).toContain('UTC');
});

test('a repeated personal notification returns the existing read row', async () => {
  const existing = { id: 'saved', userId: 'firebase-user', message: 'Hello', isRead: true };
  db.notification.create.mockRejectedValue({ code: 'P2002' });
  db.notification.findFirst.mockResolvedValue(existing);
  const response = await request(app).post('/api/notifications').send({
    userId: 'someone-else', title: 'Birthday', message: 'Hello', type: 'driver_news', eventKey: 'birthday:2026',
  });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(existing);
  expect(db.notification.create.mock.calls[0][0].data).toMatchObject({
    userId: 'firebase-user', type: 'driver_news', eventKey: expect.stringMatching(/^client:/),
  });
  expect(db.notification.findFirst.mock.calls[0][0].where.userId).toBe('firebase-user');
});

test('genuine database errors are not treated as duplicates', async () => {
  db.notification.create.mockRejectedValue(new Error('offline'));
  await expect(createNotificationOnce({ userId: 'fan', message: 'Hello' })).rejects.toThrow('offline');
  expect(db.notification.findFirst).not.toHaveBeenCalled();
});

test.each([{ message: '' }, { message: 'hi', type: 'unknown' }, { message: 'hi', eventKey: 42 }])(
  'invalid notification payload is rejected: %p', async body => {
    const response = await request(app).post('/api/notifications').send(body);
    expect(response.status).toBe(400);
    expect(db.notification.create).not.toHaveBeenCalled();
  }
);

test('ordinary users cannot broadcast notifications through the test endpoint', async () => {
  const response = await request(app).post('/api/notifications/trigger-test').send({ driverId: 'driver' });
  expect(response.status).toBe(403);
  expect(db.follow.findMany).not.toHaveBeenCalled();
});
