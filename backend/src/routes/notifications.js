import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js'; // Ensure this matches your middleware path
import { notifyDriverFans, notifyTeamFans } from '../services/notificationService.js';

export const notificationsRouter = express.Router();

// GET /api/notifications
// Retrieves all notifications for the authenticated user
notificationsRouter.get('/', requireAuth, async (req, res) => {
  try {
    // 1. Check if the user object exists
    console.log('Checking auth in notifications:', req.user);
    
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: 'User is not logged in or missing uid' });
    }

    const userId = req.user.uid; 

    // 2. Fetch from DB
    const notifications = await prisma.notification.findMany({
      where: { userId: userId }, // If your DB uses snake_case, change this to user_id: userId
      orderBy: { createdAt: 'desc' }
    });

    res.json(notifications);
  } catch (error) {
    // 3. Print the exact cause of the crash to your terminal
    console.error('CRASH in GET /api/notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications
// Creates a personalized notification strictly for the logged-in user
notificationsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const { title, message, type } = req.body;
    
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newNotification = await prisma.notification.create({
      data: {
        userId: req.user.uid,
        title,
        message,
        type: type || 'system_alert', // Prisma NotificationType enum
        isRead: false
      }
    });

    res.status(201).json(newNotification);
  } catch (error) {
    console.error('CRASH in POST /api/notifications:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const updated = await prisma.notification.update({
      where: { 
        id: req.params.id,
        userId: req.user.uid 
      },
      data: { isRead: true }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// POST /api/notifications/trigger-test
// (In production, restrict this to admins only, or remove it and rely on background jobs)
notificationsRouter.post('/trigger-test', async (req, res) => {
  try {
    const { driverId, teamId, title, message } = req.body;

    let result = { count: 0 };

    if (driverId) {
      result = await notifyDriverFans(driverId, title, message);
    } else if (teamId) {
      result = await notifyTeamFans(teamId, title, message);
    } else {
      return res.status(400).json({ error: 'Must provide driverId or teamId' });
    }

    res.json({ success: true, notificationsSent: result.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger notifications' });
  }
});