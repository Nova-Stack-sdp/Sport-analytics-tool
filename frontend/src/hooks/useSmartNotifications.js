import { useEffect } from 'react';
import { LORE_EVENTS, matchesFollows } from '../data/f1Lore';
import { createNotification } from '../api/client';

export default function useSmartNotifications(user, follows) {
  useEffect(() => {
    if (!user?.uid || !follows) return;
    if (follows.drivers.length === 0 && follows.teams.length === 0) return;

    const syncNotifications = async () => {
      const today = new Date();
      const dateString = today.toDateString();
      const syncKey = `f1_sync_${user.uid}`;
      
      if (localStorage.getItem(syncKey) === dateString) return;

      const notificationsToCreate = [];
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      const todaysLore = LORE_EVENTS.filter(event => 
        event.month === currentMonth && 
        event.day === currentDay && 
        matchesFollows(event, follows.drivers, follows.teams)
      );

      todaysLore.forEach(lore => {
        // Map LORE to a valid Prisma NotificationType enum (system_alert)
        notificationsToCreate.push({ title: lore.title, message: lore.note, type: 'system_alert' });
      });

      if (notificationsToCreate.length > 0) {
        try {
          await Promise.all(notificationsToCreate.map(notify => createNotification(notify)));
          localStorage.setItem(syncKey, dateString);
        } catch (error) {
          console.error('Failed to sync smart notifications:', error);
        }
      } else {
        localStorage.setItem(syncKey, dateString);
      }
    };

    syncNotifications();
  }, [user, follows]);
}