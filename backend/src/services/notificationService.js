import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';

export const NOTIFICATION_TYPES = ['race_reminder', 'driver_news', 'team_update', 'system_alert'];

// Ignore tracking parameters, but retain query parameters that identify an article.
export function canonicalNotificationUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return null;
  }
}

export function notificationEventKey(source, identity) {
  return `${source}:${createHash('sha256').update(identity).digest('hex')}`;
}

export function newsEventKey(title, linkUrl) {
  return notificationEventKey('news', canonicalNotificationUrl(linkUrl)
    || title.trim().replace(/\s+/g, ' ').toLowerCase());
}

// Unique indexes arbitrate concurrent workers, including across server instances.
export async function createNotificationsOnce(data, db = prisma) {
  if (!data.length) return { count: 0 };
  return db.notification.createMany({ data, skipDuplicates: true });
}

export async function createNotificationOnce(data, db = prisma) {
  try {
    return await db.notification.create({ data });
  } catch (error) {
    if (error?.code !== 'P2002') throw error;
    const existing = await db.notification.findFirst({
      where: {
        userId: data.userId,
        OR: [{ message: data.message }, ...(data.eventKey ? [{ eventKey: data.eventKey }] : [])],
      },
    });
    if (!existing) throw error;
    return existing; // A retry must not mark a previously read notification unread.
  }
}

async function notifyFans(where, type, title, message, linkUrl) {
  const fans = await prisma.follow.findMany({ where, select: { userId: true } });
  const eventKey = newsEventKey(title || message, linkUrl);
  return createNotificationsOnce([...new Set(fans.map(fan => fan.userId))].map(userId => ({
    userId, type, title, message, eventKey,
    linkUrl: canonicalNotificationUrl(linkUrl),
  })));
}

export const notifyDriverFans = (driverId, title, message, linkUrl = null) =>
  notifyFans({ driverId }, 'driver_news', title, message, linkUrl);

export const notifyTeamFans = (teamId, title, message, linkUrl = null) =>
  notifyFans({ teamId }, 'team_update', title, message, linkUrl);

// Tells a developer that an admin approved or rejected their code. Called
// inside the review transaction (db = tx), so a failed notification rolls
// the review back and a review never happens without its notification. The
// recipient always comes from the stored submission, never from the request.
export async function notifyCodeSubmissionReviewed(submission, status, db = prisma) {
  return createNotificationOnce({
    userId: submission.submitterId,
    type: 'system_alert',
    title: `Code submission ${status}`,
    message: `Your code submission "${submission.title}" (${submission.id}) has been ${status}.`,
    isRead: false,
  }, db);
}
