import { Router } from 'express';

export const videosRouter = Router();

// OpenF1 has no video endpoint, so the welcome page's videos come from
// YouTube instead: the official FORMULA 1 channel (UCB_qr75-ydFVKSF9Dmo6izg)
// via the YouTube Data API. Set YOUTUBE_API_KEY to get the channel's latest
// uploads; without a key (or if YouTube fails) a saved list of race
// highlights is served instead, and the response says so (source:
// 'fallback') so the page can tell visitors. No DB / OpenF1 dependency.
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const F1_CHANNEL_ID = 'UCB_qr75-ydFVKSF9Dmo6izg';

// Saved official race highlights, served when YouTube can't be used. This
// list does not update itself; the response marks it source: 'fallback'.
const FALLBACK_VIDEOS = [
  {
    videoId: '3OMLs3yI-KE',
    title: 'Race Highlights | 2026 Dutch Grand Prix',
    sub: 'FORMULA 1 · YouTube',
  },
  {
    videoId: 'I6RfOY_7leA',
    title: 'Race Highlights | 2026 Belgian Grand Prix',
    sub: 'FORMULA 1 · YouTube',
  },
  {
    videoId: '_JeaXt_3Mhc',
    title: 'Race Highlights | 2026 Hungarian Grand Prix',
    sub: 'FORMULA 1 · YouTube',
  },
  {
    videoId: 'usP9O0zFVaA',
    title: 'Race Highlights | 2026 Austrian Grand Prix',
    sub: 'FORMULA 1 · YouTube',
  },
];

function formatViewCount(views) {
  if (typeof views !== 'number') return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
  return `${views} views`;
}

async function fetchYouTube(path, params) {
  const query = new URLSearchParams(params).toString();
  const url = `${YOUTUBE_API_BASE}/${path}?${query}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API request failed: ${url} -> ${res.status}`);
  }
  return res.json();
}

/**
 * The channel's latest uploads via the YouTube Data API:
 *  1. search.list for F1 channel videos from the last 60 days, newest first
 *  2. videos.list to add view counts
 * Ordered by upload date, newest first. Nothing here measures popularity.
 */
async function getPopularFromYouTube() {
  const key = process.env.YOUTUBE_API_KEY;
  const apiKey = key && key.trim() ? key.trim() : null;
  if (!apiKey) return null;

  const publishedAfter = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const search = await fetchYouTube('search', {
    key: apiKey,
    channelId: F1_CHANNEL_ID,
    part: 'snippet',
    order: 'date',
    type: 'video',
    maxResults: 10,
    publishedAfter: publishedAfter.toISOString(),
  });

  const videoIds = (search.items || [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);
  if (videoIds.length === 0) return [];

  const details = await fetchYouTube('videos', {
    key: apiKey,
    part: 'snippet,statistics',
    id: videoIds.join(','),
  });

  const byId = new Map();
  for (const item of details.items || []) {
    byId.set(item.id, item);
  }

  return videoIds.map((videoId) => {
    const item = byId.get(videoId);
    const snippet = item?.snippet || {};
    const views = Number(item?.statistics?.viewCount ?? NaN);
    const sub = [
      formatViewCount(views),
      snippet.publishedAt ? new Date(snippet.publishedAt).getFullYear().toString() : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      videoId,
      title: snippet.title || 'Formula 1 video',
      sub: sub || 'FORMULA 1 · YouTube',
    };
  });
}

// search.list costs 100 of the default 10,000 daily quota units, so a
// result is reused for VIDEOS_CACHE_SECONDS (default 15 minutes) instead of
// calling YouTube on every welcome-page visit. Only YouTube results are
// cached; the fallback is cheap and is retried on the next request.
let cached = null; // { at, body }

function cacheTtlMs() {
  const seconds = Number(process.env.VIDEOS_CACHE_SECONDS ?? 900);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 900_000;
}

export function clearPopularVideosCache() {
  cached = null;
}

function toCards(items) {
  return items.slice(0, 4).map((item, index) => ({
    id: item.videoId,
    videoId: item.videoId,
    rank: index + 1,
    title: item.title,
    sub: item.sub,
    thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
  }));
}

videosRouter.get('/popular', async (req, res, next) => {
  try {
    if (cached && Date.now() - cached.at < cacheTtlMs()) {
      return res.json(cached.body);
    }

    let items = null;
    try {
      items = await getPopularFromYouTube();
    } catch (err) {
      // Bad/expired key or YouTube hiccup — fall back rather than 500.
      console.error('YouTube popular fetch failed, using fallback:', err.message);
      items = null;
    }

    // 'youtube' only when YouTube actually supplied the videos. No key, an
    // error, or no uploads in the window all serve the saved list, and say so.
    if (items && items.length > 0) {
      const body = { source: 'youtube', videos: toCards(items) };
      cached = { at: Date.now(), body };
      return res.json(body);
    }
    res.json({ source: 'fallback', videos: toCards(FALLBACK_VIDEOS) });
  } catch (err) {
    next(err);
  }
});
