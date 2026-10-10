import { useEffect } from 'react';
import { LORE_EVENTS, matchesFollows } from '../data/f1Lore';
import { createNotification } from '../api/client';

// Avoid duplicate effects in StrictMode or several mounted consumers. The server
// enforces event identity across tabs/devices; this only saves redundant requests.
const inFlight = new Map();

export default function useSmartNotifications(user, follows) {
  useEffect(() => {
    if (!user?.uid || !follows) return;
    const today = new Date();
    const occurrence = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const events = LORE_EVENTS.filter(event =>
      event.month === today.getMonth() + 1 && event.day === today.getDate()
      && (!event.year || event.year === today.getFullYear())
      && matchesFollows(event, follows.drivers || [], follows.teams || [])
    );
    for (const event of events) {
      const eventKey = `lore:${occurrence}:${event.type}:${event.driverName || event.teamName}`;
      const cacheKey = `f1-notification:${user.uid}:${eventKey}`;
      try { if (localStorage.getItem(cacheKey)) continue; } catch { /* Storage is optional. */ }
      if (inFlight.has(cacheKey)) continue;
      const pending = createNotification({
        title: event.title,
        message: `${event.title} (${today.getFullYear()}). ${event.note}`,
        type: event.driverName ? 'driver_news' : 'team_update',
        eventKey,
      }).then(() => {
        try { localStorage.setItem(cacheKey, 'sent'); } catch { /* Server deduplicates. */ }
      }).catch(error => {
        console.error('Failed to sync smart notification:', error);
      }).finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, pending);
    }
  }, [user, follows]);
}
