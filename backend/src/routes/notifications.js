import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireVerifiedEmail, requireAdmin } from '../middleware/requireAuth.js';
import { notifyDriverFans, notifyTeamFans, createNotificationOnce, NOTIFICATION_TYPES, notificationEventKey } from '../services/notificationService.js';

export const notificationsRouter = express.Router();

// GET /api/notifications
// Retrieves all notifications for the authenticated user
notificationsRouter.get('/', requireAuth, requireVerifiedEmail, async (req, res) => {
  try {
    // 1. Check if the user object exists
    
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
notificationsRouter.post('/', requireAuth, requireVerifiedEmail, async (req, res) => {
  try {
    const { title, message, type = 'system_alert', eventKey } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 2000
      || (title != null && (typeof title !== 'string' || title.length > 200))
      || !NOTIFICATION_TYPES.includes(type)
      || (eventKey != null && (typeof eventKey !== 'string' || !eventKey.trim() || eventKey.length > 300))) {
      return res.status(400).json({ error: 'Invalid notification title, message, type or event key' });
    }
    
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newNotification = await createNotificationOnce({
        userId: req.user.uid,
        title: title?.trim() || null,
        message: message.trim(),
        type,
        eventKey: notificationEventKey('client', eventKey || `${type}:${title || ''}:${message.trim()}`),
        isRead: false
    });

    res.status(201).json(newNotification);
  } catch (error) {
    console.error('CRASH in POST /api/notifications:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
notificationsRouter.patch('/:id/read', requireAuth, requireVerifiedEmail, async (req, res) => {
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
notificationsRouter.post('/trigger-test', requireAuth, requireVerifiedEmail, requireAdmin, async (req, res) => {
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
