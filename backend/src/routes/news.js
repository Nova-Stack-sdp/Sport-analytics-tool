import { Router } from 'express';
import { f1NewsService } from '../lib/f1NewsFeed.js';
import { prisma } from '../lib/prisma.js';
import { canonicalNotificationUrl, createNotificationsOnce, newsEventKey } from '../services/notificationService.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function page(payload, query = {}) {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, nonNegativeInteger(query.limit, DEFAULT_LIMIT))
  );
  const offset = nonNegativeInteger(query.offset, 0);
  const allItems = Array.isArray(payload.items) ? payload.items : [];
  const items = allItems.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    ...payload,
    items,
    pagination: {
      limit,
      offset,
      total: allItems.length,
      hasMore: nextOffset < allItems.length,
      nextOffset: nextOffset < allItems.length ? nextOffset : null,
    },
  };
}

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
    if (driver.name) {
      const name = driver.name.toLowerCase().trim();
      terms.push(name, name.split(/\s+/).at(-1));
    }
    if (driver.familyName) terms.push(driver.familyName.toLowerCase());
    if (driver.code) terms.push(driver.code.toLowerCase());

    const validTerms = terms.filter(t => t.length > 2);

    for (const term of validTerms) {
      if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
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
        if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
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

// One notification per article and follower, even when several follows match.
export async function processNewsNotifications(articles) {
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
      select: { userId: true, driverId: true, teamId: true }
    });

    if (follows.length === 0) continue;

    const recipients = new Map();
    for (const follow of follows) {
      const driverMatch = taggedDriverIds.includes(follow.driverId);
      const teamMatch = taggedTeamIds.includes(follow.teamId);
      const match = recipients.get(follow.userId) || { driver: false, team: false };
      match.driver ||= driverMatch;
      match.team ||= teamMatch;
      recipients.set(follow.userId, match);
    }
    const eventKey = newsEventKey(article.title, article.url);
    await createNotificationsOnce([...recipients].map(([userId, match]) => ({
      userId,
      title: match.driver && match.team ? 'Driver & team news'
        : match.driver ? 'Driver news' : 'Team news',
      message: article.title,
      type: match.driver ? 'driver_news' : 'team_update',
      linkUrl: canonicalNotificationUrl(article.url),
      eventKey,
      isRead: false,
    })));

  }
}

export function createNewsRouter(service = f1NewsService) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      // 1. Teammate's new caching logic
      await service.hydrate();
      let payload = service.snapshot();
      if (payload.items.length === 0) {
        payload = await service.refresh();
      }

      // 2. Extract articles for your notification worker
      const articlesArray = payload.items || payload.articles || payload.data || [];

      // 3. Run background worker to create notifications for followers
      processNewsNotifications(articlesArray).catch(console.error);

      // 4. Your filtering logic
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
        
        // Update payload with filtered items before paginating
        payload = { ...payload, items: filteredArticles };
      }

      // 5. Teammate's pagination logic applied to the final payload
      res.json(page(payload, req.query));
    } catch (err) {
      console.error('News route error:', err);
      res.status(503).json(page({ items: [], error: 'Service unavailable' }, req.query));
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      res.json(page(await service.refresh(), req.query));
    } catch {
      res.status(503).json(page({
        ...service.snapshot(),
        error: 'The F1 news provider is temporarily unavailable.',
      }, req.query));
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
