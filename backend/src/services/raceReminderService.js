import { prisma } from '../lib/prisma.js';
import { createNotificationsOnce } from './notificationService.js';

export const processRaceReminders = async () => {
  try {
    const now = new Date();
    const upcomingWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Next 2 hours

    // 1. Find upcoming races
    const upcomingRaces = await prisma.session.findMany({
      where: {
        type: 'Race',
        status: 'scheduled',
        startTime: {
          gte: now,
          lte: upcomingWindow
        }
      },
      include: {
        meeting: true,
        entries: {
          include: {
            driver: true,
            team: true,
            events: {
              where: { eventType: 'grid_position' },
              orderBy: { occurredAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    if (upcomingRaces.length === 0) return 0;

    let notificationsCreated = 0;

    // 2. Process each race
    for (const race of upcomingRaces) {
      const raceName = race.meeting?.name || 'Grand Prix';
      const timeString = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'UTC',
      }).format(new Date(race.startTime));
      const follows = await prisma.follow.findMany({
        where: { OR: [
          { driverId: { in: race.entries.map(entry => entry.driver.id) } },
          { teamId: { in: [...new Set(race.entries.map(entry => entry.team.id))] } },
        ] },
        select: { userId: true, driverId: true, teamId: true },
      });
      const userNotifications = new Map();
      for (const follow of follows) {
        if (!userNotifications.has(follow.userId)) userNotifications.set(follow.userId, new Map());
        const entries = userNotifications.get(follow.userId);
        for (const entry of race.entries) {
          if (follow.driverId !== entry.driver.id && follow.teamId !== entry.team.id) continue;
          const position = entry.events[0]?.payload?.position;
          const grid = Number.isInteger(position) && position > 0 ? `P${position}` : 'grid TBC';
          entries.set(entry.driver.id, `${entry.driver.name} (${grid}, ${entry.team.name})`);
        }
      }

      // 3. Create notifications
      const notificationsToInsert = [];
      for (const [userId, entries] of userNotifications) {
        notificationsToInsert.push({
          userId,
          title: `Upcoming race: ${raceName}`,
          message: `The ${raceName} starts on ${timeString} UTC. Following: ${[...entries.values()].sort().join('; ')}.`,
          eventKey: `race_reminder:${race.id}`,
          type: 'race_reminder',
          isRead: false,
        });
      }
      const result = await createNotificationsOnce(notificationsToInsert);
      notificationsCreated += result.count;
    }

    return notificationsCreated;
  } catch (error) {
    console.error('Error processing race reminders:', error);
    return 0;
  }
};
