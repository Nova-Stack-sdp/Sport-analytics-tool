import { Router } from 'express';
import { getTorontoraceContext } from '../data/Torontorace.js';

export const telemetryTVRouter = Router();

const RACE_KEY_PATTERN = /^indycar:(.+)-race:v(\d+)$/;

function parseDateMs(value) {
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

telemetryTVRouter.get('/races', async (req, res, next) => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const rows = await prisma.externalApiCache.findMany({
      where: { key: { startsWith: 'indycar:' } },
    });

    const latestBySlug = new Map();
    for (const row of rows) {
      const match = RACE_KEY_PATTERN.exec(row.key);
      if (!match) continue;
      const slug = match[1];
      const version = Number(match[2]);
      const current = latestBySlug.get(slug);
      if (current && current.version >= version) continue;
      latestBySlug.set(slug, { version, row });
    }

    const races = [...latestBySlug.entries()].map(([slug, { row }]) => {
      const session = row.payload?.session ?? {};
      const video = row.payload?.video ?? {};
      return {
        slug,
        eventName: session.eventName ?? null,
        sessionDate: session.sessionDate ?? null,
        totalLaps: session.totalLaps ?? null,
        fieldSize: session.fieldSize ?? null,
        video: {
          youtubeId: video.youtubeId ?? null,
          embedStartSeconds: video.embedStartSeconds ?? null,
          videoDurationSeconds: video.videoDurationSeconds ?? null,
        },
      };
    });

    races.sort((a, b) => parseDateMs(b.sessionDate) - parseDateMs(a.sessionDate));

    return res.json({ races });
  } catch (err) {
    return next(err);
  }
});

telemetryTVRouter.get('/races/:slug', async (req, res, next) => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const rows = await prisma.externalApiCache.findMany({
      where: { key: { startsWith: `indycar:${req.params.slug}-race:v` } },
    });

    const matchingRows = rows.flatMap((row) => {
      const match = RACE_KEY_PATTERN.exec(row.key);
      return match?.[1] === req.params.slug
        ? [{ version: Number(match[2]), row }]
        : [];
    });
    const latest = matchingRows.reduce((current, candidate) => (
      !current || candidate.version > current.version ? candidate : current
    ), null);

    if (!latest) return res.status(404).json({ error: 'INDYCAR race not found' });

    const payload = latest.row.payload ?? {};
    const torontorace = req.params.slug === 'toronto-2025' ? getTorontoraceContext() : null;

    return res.json({
      race: {
        slug: req.params.slug,
        session: payload.session ?? {},
        video: payload.video ?? {},
        clock: payload.clock ?? null,
        lapCalibration: payload.lapCalibration ?? torontorace?.lapCalibration ?? null,
        classification: payload.classification ?? [],
        leaderLaps: payload.leaderLaps ?? [],
        lapChart: payload.lapChart ?? { positions: {}, flags: {}, legend: {} },
        pitStops: payload.pitStops ?? [],
        stats: payload.stats ?? {},
        podium: payload.podium ?? [],
        pole: payload.pole ?? null,
        leaders: payload.leaders ?? [],
        cautions: payload.cautions ?? [],
        events: [...(payload.events ?? []), ...(torontorace?.events ?? [])],
        intelligence: torontorace ? {
          paceAndStrategy: torontorace.paceAndStrategy,
          weather: torontorace.paceAndStrategy.weather,
          narrative: torontorace.narrative,
        } : null,
      },
    });
  } catch (err) {
    return next(err);
  }
});
