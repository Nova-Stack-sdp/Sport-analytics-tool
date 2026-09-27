import { Router } from 'express';

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
