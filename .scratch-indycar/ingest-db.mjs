import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const DATA = 'c:/Users/user/sport-analytics-tool/.scratch-indycar/data';
const API = 'C:/Users/user/.qoder/cache/projects/sport-analytics-tool-9bc05f7d/agent-tools/11fbe974/';

const RACES = [
  {
    key: 'toronto2025', slug: 'toronto-2025', api: '1259281d.txt',
    eventId: 5509, sessionId: 6467, apiDate: '7/20/2025', pdfDate: '2025-07-20',
    youtubeId: 'UO4c-wMLhso', embedStartSeconds: 184, videoDurationSeconds: 7759,
  },
  {
    key: 'longbeach2023', slug: 'long-beach-2023', api: '06a6f0f8.txt',
    eventId: 5434, sessionId: 6138, apiDate: '4/16/2023', pdfDate: '2023-04-16',
    youtubeId: '2ifguXu0P7s', embedStartSeconds: 1704, videoDurationSeconds: 8163,
  },
  {
    key: 'indy5002024', slug: 'indianapolis-500-2024', api: '0cce1850.txt',
    eventId: 5465, sessionId: 6309, apiDate: '5/26/2024', pdfDate: '2024-05-26',
    youtubeId: 'fWwonhySrWg', embedStartSeconds: 10353, videoDurationSeconds: 20625,
  },
  {
    key: 'sonsioims2024', slug: 'sonsio-ims-2024', api: '9ddc6f94.txt',
    eventId: 5457, sessionId: 6301, apiDate: '5/11/2024', pdfDate: '2024-05-11',
    youtubeId: '6Xc1jSd3sgo', embedStartSeconds: 2160, videoDurationSeconds: 8451,
  },
  {
    key: 'roadamerica2023', slug: 'road-america-2023', api: '5dce6539.txt',
    eventId: 5436, sessionId: 6140, apiDate: '6/18/2023', pdfDate: '2023-06-18',
    youtubeId: 'uEm9j8vVoAk', embedStartSeconds: 1030, videoDurationSeconds: 8373,
  },
];

function buildBundle(r) {
  const parsed = JSON.parse(fs.readFileSync(`${DATA}/${r.key}.json`, 'utf8'));
  const classification = JSON.parse(fs.readFileSync(API + r.api, 'utf8'));
  const report = JSON.parse(fs.readFileSync(`${DATA}/final-report.json`, 'utf8'))[r.key];

  return {
    version: 1,
    source: {
      classification: `https://www.indycar.com/api/results/EventsSessionDetails?id=${r.sessionId}`,
      reports: `http://www.imscdn.com/INDYCAR/Documents/${r.sessionId}/${r.pdfDate}`,
      reportDocs: ['indycar-eventsummary.pdf', 'indycar-race-leaderlapsummary.pdf', 'indycar-race-lapchart.pdf', 'indycar-race-pitstopsummary.pdf', 'indycar-race-results.pdf'],
      note: 'Parsed from official INDYCAR RIS report PDFs + indycar.com results API',
    },
    session: {
      indycarEventId: r.eventId,
      indycarSessionId: r.sessionId,
      eventName: classification.EventName,
      sessionDate: classification.SessionDate,
      sessionType: classification.SessionType,
      trackType: classification.TrackType,
      totalLaps: parsed.leaderLaps.length,
      fieldSize: (classification.records || []).length,
    },
    video: {
      youtubeId: r.youtubeId,
      embedStartSeconds: r.embedStartSeconds,
      videoDurationSeconds: r.videoDurationSeconds,
    },
    clock: {
      model: 'videoSeconds = embedStartSeconds + raceClock(lap); race clock cumulated from leader lap times, lead-change gaps added, residual drift vs official winner elapsed time distributed proportionally between green(=0) and checkered(=winnerElapsed)',
      rawLeaderClockSec: report.clockModel.rawLeaderClockSec,
      driftSec: report.clockModel.driftSec,
      midRaceUncertaintySec: report.clockModel.midRaceUncertaintySec,
      raceTimeSec: report.raceTimeSec,
      winnerElapsed: report.winner.ElapsedTime,
      checkpoints: report.checkpoints,
      validation: report.clockModel.pitAnchorCheckTop6,
    },
    classification: classification.records,
    leaderLaps: parsed.leaderLaps,
    lapChart: parsed.lapChart,
    pitStops: parsed.pitStops,
    eventSummary: parsed.eventSummary,
    stats: report.stats,
    podium: report.podium,
    pole: report.pole,
    leaders: report.leaders,
    cautions: report.cautions,
  };
}

const { prisma } = await import(
  pathToFileURL('c:/Users/user/sport-analytics-tool/backend/src/lib/prisma.js').href
);

try {
  for (const r of RACES) {
    const key = `indycar:${r.slug}-race:v1`;
    const payload = buildBundle(r);
    await prisma.externalApiCache.upsert({
      where: { key },
      create: { key, payload },
      update: { payload, fetchedAt: new Date() },
    });
    console.log(
      `upserted ${key}: laps=${payload.session.totalLaps} field=${payload.session.fieldSize}` +
      ` leaderLaps=${payload.leaderLaps.length} pitStops=${payload.pitStops.reduce((a, d) => a + d.stops.length, 0)}` +
      ` ~${Math.round(JSON.stringify(payload).length / 1024)}KB`
    );
  }

  console.log('--- verification (read-back) ---');
  for (const r of RACES) {
    const key = `indycar:${r.slug}-race:v1`;
    const row = await prisma.externalApiCache.findUnique({ where: { key } });
    if (!row) { console.log(`MISSING ${key}`); continue; }
    const p = row.payload;
    console.log(
      `${key} -> eventName="${p.session.eventName}" video=${p.video.youtubeId}` +
      ` checkpoints=${p.clock.checkpoints.length} classification=${p.classification.length}` +
      ` chartLaps=${Object.keys(p.lapChart.positions).length} fetchedAt=${row.fetchedAt.toISOString()}`
    );
  }
} finally {
  await prisma.$disconnect();
}
