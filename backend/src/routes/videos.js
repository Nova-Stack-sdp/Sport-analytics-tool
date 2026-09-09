import { Router } from 'express';

export const videosRouter = Router();

// OpenF1 has no video endpoint, so popular videos come from YouTube instead:
// the official FORMULA 1 channel (UCB_qr75-ydFVKSF9Dmo6izg) via the YouTube
// Data API. Set YOUTUBE_API_KEY to pull live rankings; without a key we fall
// back to a curated list of recent race highlights so the front page never
// renders empty. No DB / OpenF1 dependency, so the rest of the backend is
// untouched.
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const F1_CHANNEL_ID = 'UCB_qr75-ydFVKSF9Dmo6izg';

// Recent official race highlights — used when YOUTUBE_API_KEY is not set.
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
 * Live ranking via the YouTube Data API:
 *  1. search.list for recent F1 channel videos
 *  2. videos.list to enrich with view counts / durations
 * Ranked by recency (search.list already orders by date, newest first) —
 * for a race season that's a good proxy for "popular right now".
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
      new Date(snippet.publishedAt || Date.now()).getFullYear().toString(),
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

videosRouter.get('/popular', async (req, res, next) => {
  try {
    let items = null;
    try {
      items = await getPopularFromYouTube();
    } catch (err) {
      // Bad/expired key or YouTube hiccup — fall back rather than 500.
      console.error('YouTube popular fetch failed, using fallback:', err.message);
      items = null;
    }

    const source = items === null ? 'fallback' : 'youtube';
    const list = (items && items.length > 0 ? items : FALLBACK_VIDEOS)
      .slice(0, 4)
      .map((item, index) => ({
        id: item.videoId,
        videoId: item.videoId,
        rank: index + 1,
        title: item.title,
        sub: item.sub,
        thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
      }));

    res.json({ source, videos: list });
  } catch (err) {
    next(err);
  }
});
