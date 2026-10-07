import { prisma } from '../lib/prisma.js';

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
      const timeString = new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(race.startTime));
      
      // We will group notifications by userId to prevent sending multiple per race
      const userNotifications = new Map();

      for (const entry of race.entries) {
        // Find users following this driver
        const driverFans = await prisma.follow.findMany({
          where: { driverId: entry.driver.id },
          select: { userId: true }
        });

        const gridPos = entry.events[0]?.payload?.position || 'TBD';

        for (const fan of driverFans) {
          const userId = fan.userId;
          if (!userNotifications.has(userId)) {
            userNotifications.set(userId, { drivers: [], teams: [] });
          }
          userNotifications.get(userId).drivers.push(`${entry.driver.name} (P${gridPos})`);
        }

        // Find users following this team
        const teamFans = await prisma.follow.findMany({
          where: { teamId: entry.team.id },
          select: { userId: true }
        });

        for (const fan of teamFans) {
          const userId = fan.userId;
          if (!userNotifications.has(userId)) {
            userNotifications.set(userId, { drivers: [], teams: [] });
          }
          // We can just add the driver info to the team's list
          userNotifications.get(userId).teams.push(`${entry.driver.name} (P${gridPos}) for ${entry.team.name}`);
        }
      }

      // 3. Create notifications
      const notificationsToInsert = [];
      const messageId = `race_reminder_${race.id}`; // Used for deduplication in unique constraint

      for (const [userId, prefs] of userNotifications.entries()) {
        let message = `The ${raceName} starts at ${timeString}. `;
        
        if (prefs.drivers.length > 0) {
          message += `Your drivers: ${prefs.drivers.join(', ')}. `;
        }
        if (prefs.teams.length > 0) {
          // Deduplicate team messages
          const uniqueTeams = [...new Set(prefs.teams)];
          message += `Team updates: ${uniqueTeams.join(', ')}.`;
        }

        notificationsToInsert.push({
          userId,
          title: `Upcoming Race: ${raceName}`,
          message: message.trim().slice(0, 500), // Ensure it fits in the DB and is deduplicated
          type: 'race_reminder',
          isRead: false
        });
      }

      if (notificationsToInsert.length > 0) {
        const result = await prisma.notification.createMany({
          data: notificationsToInsert,
          skipDuplicates: true
        });
        notificationsCreated += result.count;
      }
    }

    return notificationsCreated;
  } catch (error) {
    console.error('Error processing race reminders:', error);
    return 0;
  }
};
