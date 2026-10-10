import { Router } from 'express';
import { getTorontoraceContext } from '../data/Torontorace.js';
import { getLongBeachraceContext } from '../data/LongBeachrace.js';
import { getRaceWeather, isoDate } from '../lib/raceWeather.js';

export const telemetryTVRouter = Router();

const RACE_KEY_PATTERN = /^indycar:(.+)-race:v(\d+)$/;

// Races with a curated broadcast-anchor set. Keyed by slug; the context
// feeds the lap calibration, the video-stamped ticker events, the curated
// pit-stop fallback and the pace-and-strategy intelligence panel.
const CURATED_RACE_CONTEXTS = {
  'toronto-2025': getTorontoraceContext,
  'long-beach-2023': getLongBeachraceContext,
};

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

// Race-day weather for the header: the venue's measured conditions over the
// race window, from Open-Meteo's archive (see lib/raceWeather.js). Its own
// endpoint so the header can show it the moment a race is picked, without
// waiting for the full report. A race with no venue lookup, or an archive
// that can't be reached, answers `weather: null` — never a guess.
telemetryTVRouter.get('/races/:slug/weather', async (req, res, next) => {
  try {
    const curated = CURATED_RACE_CONTEXTS[req.params.slug]?.() ?? null;
    const lookup = curated?.weatherLookup;
    if (!lookup) return res.json({ weather: null });

    // The report's own session date wins over the curated fallback.
    let date = lookup.date;
    try {
      const { prisma } = await import('../lib/prisma.js');
      const rows = await prisma.externalApiCache.findMany({
        where: { key: { startsWith: `indycar:${req.params.slug}-race:v` } },
      });
      const reported = rows
        .map((row) => isoDate(row.payload?.session?.sessionDate))
        .find(Boolean);
      if (reported) date = reported;
    } catch {
      // No report to read the date from — the curated date stands.
    }

    let weather = null;
    try {
      weather = await getRaceWeather({ ...lookup, date, venue: curated.venue });
    } catch {
      weather = null;
    }
    return res.json({ weather });
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
    const curated = CURATED_RACE_CONTEXTS[req.params.slug]?.() ?? null;

    return res.json({
      race: {
        slug: req.params.slug,
        session: payload.session ?? {},
        video: payload.video ?? {},
        clock: payload.clock ?? null,
        // A curated calibration is measured from the broadcast, so it always
        // outranks a shipped modelled one.
        lapCalibration: curated?.lapCalibration ?? payload.lapCalibration ?? null,
        classification: payload.classification ?? [],
        leaderLaps: payload.leaderLaps ?? [],
        lapChart: payload.lapChart ?? { positions: {}, flags: {}, legend: {} },
        // Official parsed pit data wins when the bundle carries it; the
        // curated broadcast-called list covers the no-data fallback.
        pitStops: payload.pitStops?.length ? payload.pitStops : (curated?.pitStops ?? []),
        stats: payload.stats ?? {},
        podium: payload.podium ?? [],
        pole: payload.pole ?? null,
        leaders: payload.leaders ?? [],
        cautions: payload.cautions ?? [],
        events: [...(payload.events ?? []), ...(curated?.events ?? [])],
        intelligence: curated ? {
          paceAndStrategy: curated.paceAndStrategy,
          weather: curated.paceAndStrategy.weather,
          strategySignals: curated.paceAndStrategy.strategySignals,
          narrative: curated.narrative,
        } : null,
      },
    });
  } catch (err) {
    return next(err);
  }
});
