import { prisma } from '../lib/prisma.js'; // Adjust path to your shared prisma client

/**
 * Sends a notification to all users who have favorited a specific driver.
 */
export const notifyDriverFans = async (driverId, title, message, linkUrl = null) => {
  try {
    // 1. Find all users who follow this driver
    const fans = await prisma.userProfile.findMany({
      where: { favoriteDriverId: driverId },
      select: { userId: true }
    });

    if (fans.length === 0) return { count: 0 };

    // 2. Prepare the notification payloads
    const notifications = fans.map(fan => ({
      userId: fan.userId,
      type: 'driver_news', // Matches your NotificationType enum
      title,
      message,
      linkUrl
    }));

    // 3. Bulk insert them into the database
    const result = await prisma.notification.createMany({
      data: notifications
    });

    return { count: result.count };
  } catch (error) {
    console.error('Error notifying driver fans:', error);
    throw error;
  }
}

/**
 * Sends a notification to all users who have favorited a specific team.
 */
export const notifyTeamFans = async (teamId, title, message, linkUrl = null) => {
  try {
    const fans = await prisma.userProfile.findMany({
      where: { favoriteTeamId: teamId },
      select: { userId: true }
    });

    if (fans.length === 0) return { count: 0 };

    const notifications = fans.map(fan => ({
      userId: fan.userId,
      type: 'team_update', // Matches your NotificationType enum
      title,
      message,
      linkUrl
    }));

    const result = await prisma.notification.createMany({
      data: notifications
    });

    return { count: result.count };
  } catch (error) {
    console.error('Error notifying team fans:', error);
    throw error;
  }
}