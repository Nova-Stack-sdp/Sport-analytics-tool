import { Router } from 'express';
import { f1NewsService } from '../lib/f1NewsFeed.js';
import { prisma } from '../lib/prisma.js';

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// Dynamically matches article keywords to actual database UUIDs
function extractTagsFromDB(article, dbDrivers, dbTeams) {
  const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
  const matchedDrivers = new Set();
  const matchedTeams = new Set();

  // Match drivers by name, surname, or code -> returns UUID
  for (const driver of dbDrivers) {
    const terms = [];
    if (driver.name) terms.push(...driver.name.toLowerCase().split(/\s+/));
    if (driver.givenName) terms.push(driver.givenName.toLowerCase());
    if (driver.familyName) terms.push(driver.familyName.toLowerCase());
    if (driver.code) terms.push(driver.code.toLowerCase());

    const validTerms = terms.filter(t => t.length > 2);

    for (const term of validTerms) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(text)) {
        matchedDrivers.add(driver.id);
        break;
      }
    }
  }

  // Match teams by name -> returns UUID
  for (const team of dbTeams) {
    const teamName = (team.name || team.teamName || team.id || '').toLowerCase();
    const ignoreWords = ['racing', 'team', 'f1', 'formula', 'scuderia', 'motorsport'];
    const terms = teamName.split(/\s+/).filter(w => w.length > 2 && !ignoreWords.includes(w));

    if (teamName && text.includes(teamName)) {
      matchedTeams.add(team.id);
    } else {
      for (const term of terms) {
        if (new RegExp(`\\b${term}\\b`, 'i').test(text)) {
          matchedTeams.add(team.id);
          break;
        }
      }
    }
  }

  return {
    drivers: Array.from(matchedDrivers),
    teams: Array.from(matchedTeams)
  };
}

// Background worker to check for followers and send notifications
// Background worker to check for followers and send notifications
async function processNewsNotifications(articles) {
  if (!articles || articles.length === 0) return;

  // 1. Fetch reference drivers and teams from database
  const [dbDrivers, dbTeams] = await Promise.all([
    prisma.driver.findMany(),
    prisma.team.findMany()
  ]);

  // 2. Process each article
  for (const article of articles) {
    if (!article || !article.title) continue;

    // Extract tags for this specific article
    const { drivers: taggedDriverIds, teams: taggedTeamIds } = extractTagsFromDB(article, dbDrivers, dbTeams);

    if (taggedDriverIds.length === 0 && taggedTeamIds.length === 0) {
      continue;
    }

    // Build query conditions safely based on present tags
    const orConditions = [];
    if (taggedDriverIds.length > 0) orConditions.push({ driverId: { in: taggedDriverIds } });
    if (taggedTeamIds.length > 0) orConditions.push({ teamId: { in: taggedTeamIds } });

    const follows = await prisma.follow.findMany({
      where: { OR: orConditions },
      select: { userId: true }
    });

    if (follows.length === 0) continue;

    // Deduplicate target user IDs matching this article
    const uniqueUserIds = [...new Set(follows.map(f => f.userId))];

    // =========================================================================
    // DEDUPLICATION FIX: Find users who ALREADY got a notification for this article
    // =========================================================================
    const existingNotifications = await prisma.notification.findMany({
      where: {
        userId: { in: uniqueUserIds },
        message: article.title // Matches the message field set below
      },
      select: { userId: true }
    });

    const alreadyNotifiedUserIds = new Set(existingNotifications.map(n => n.userId));

    // Filter out users who already received this notification
    const usersToNotify = uniqueUserIds.filter(userId => !alreadyNotifiedUserIds.has(userId));

    if (usersToNotify.length === 0) continue; // Skip if everyone was already notified
    // =========================================================================

    // Build notification objects for new users only
    const notificationData = usersToNotify.map(userId => ({
      userId,
      title: 'New update on your followed drivers/teams!',
      message: article.title,
      type: 'driver_news',
      linkUrl: article.url || '',
      isRead: false
    }));

    await prisma.notification.createMany({
      data: notificationData,
      skipDuplicates: true
    });
  }
}

export function createNewsRouter(service = f1NewsService) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const feedData = await service.refresh();
      
      const articlesArray = Array.isArray(feedData) 
        ? feedData 
        : (feedData.items || feedData.articles || feedData.data || []);

      // Run background worker to create notifications for followers
      processNewsNotifications(articlesArray).catch(console.error);

      // Optional filtering if query parameters are provided
      const { driverId, teamId } = req.query;
      
      if (driverId || teamId) {
        const [dbDrivers, dbTeams] = await Promise.all([
          prisma.driver.findMany(),
          prisma.team.findMany()
        ]);

        const filteredArticles = articlesArray.filter(article => {
          const tags = extractTagsFromDB(article, dbDrivers, dbTeams);
          return (driverId && tags.drivers.includes(driverId)) || 
                 (teamId && tags.teams.includes(teamId));
        });
        
        if (Array.isArray(feedData)) {
          return res.json(filteredArticles);
        } else if (feedData.items) {
          return res.json({ ...feedData, items: filteredArticles });
        } else if (feedData.articles) {
          return res.json({ ...feedData, articles: filteredArticles });
        }
      }

      res.json(feedData);
    } catch (err) {
      console.error('News route error:', err);
      res.status(503).json({
        ...service.snapshot(),
        error: 'The F1 news provider is temporarily unavailable.',
      });
    }
  });

  router.get('/stream', (req, res) => {
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    writeEvent(res, 'connected', service.snapshot());
    const unsubscribe = service.subscribe((payload) => writeEvent(res, 'news', payload));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    heartbeat.unref?.();

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  });

  return router;
}

export const newsRouter = createNewsRouter();
