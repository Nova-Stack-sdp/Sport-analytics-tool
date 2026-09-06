import { Router } from 'express';
import { fetchBarcelonaRaceRaw } from './openf1.js';

export const watchLiveRouter = Router();

// Fetched once and cached — the Barcelona 2026 race this feature simulates
// as "live" doesn't change, so there's no need to re-fetch it per request.
let Barcelona_openf1Data = null;
let Barcelona_openf1Chunks = null;

async function getBarcelonaOpenF1Data() {
  if (!Barcelona_openf1Data) {
    Barcelona_openf1Data = await fetchBarcelonaRaceRaw();
    Barcelona_openf1Chunks = buildBarcelonaOpenF1Chunks(Barcelona_openf1Data);
  }

  return { bundle: Barcelona_openf1Data, chunks: Barcelona_openf1Chunks };
}

watchLiveRouter.get('/', async (req, res, next) => {
  try {
    const { bundle } = await getBarcelonaOpenF1Data();
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

// Transcript-derived video anchors. OpenF1 timestamps are intentionally not
// assigned here; the mapping layer will link these video times to race data.
export const Barcelona_video_anchors = [
  { startSeconds: 0, endSeconds: 0, category: 'event', description: 'Grid formation; George Russell on pole, front row.' },
  { startSeconds: 14, endSeconds: 14, category: 'event', description: 'Lights out; race start, Barcelona.' },
  { startSeconds: 20, endSeconds: 20, category: 'event', description: 'Russell gets a good start and cuts across to keep Hamilton behind.' },
  { startSeconds: 29, endSeconds: 29, category: 'event', description: 'Verstappen splits Norris and Antonelli heading into Turn 1.' },
  { startSeconds: 41, endSeconds: 41, category: 'event', description: 'Piastri looks down the inside of Verstappen at Turn 4; no move made.' },
  { startSeconds: 70, endSeconds: 70, category: 'event', description: 'Order after opening exchanges: Russell, Hamilton, Antonelli, Norris, Verstappen, Piastri.' },
  { startSeconds: 79, endSeconds: 79, category: 'event', description: 'Hajar has a poor start and drops to the mid-pack.' },
  { startSeconds: 99, endSeconds: 99, category: 'event', description: 'Hajar runs wide and picks up gravel; Bortoleto also runs wide.' },
  { startSeconds: 103, endSeconds: 103, category: 'event', description: 'End of lap 1 partial order: Lindblad 10th, Hulkenberg 9th, Colapinto 11th.' },
  { startSeconds: 109, endSeconds: 116, category: 'gap', description: 'Russell is already past the 1-second overtake-mode reference gap to Hamilton.' },
  { startSeconds: 109, endSeconds: 116, category: 'threshold', description: 'Overtake-mode reference gap is 1 second.' },
  { startSeconds: 132, endSeconds: 132, category: 'event', description: 'Ocon overtakes teammate Bearman around the outside; Ocon on softs, Bearman on mediums.' },
  { startSeconds: 148, endSeconds: 148, category: 'gap', description: 'Russell to Hamilton gap is over 1.5 seconds.' },
  { startSeconds: 205, endSeconds: 205, category: 'event', description: 'Sainz defends from a fast-recovering Hajar.' },
  { startSeconds: 242, endSeconds: 242, category: 'event', description: 'Alonso, starting from the pit lane, catches Stroll.' },
  { startSeconds: 251, endSeconds: 251, category: 'event', description: 'Lindblad and Hulkenberg noted by race control for leaving the track and gaining an advantage.' },
  { startSeconds: 258, endSeconds: 266, category: 'gap', description: 'Russell to Hamilton gap extends to 2 seconds.' },
  { startSeconds: 266, endSeconds: 266, category: 'lap_time', description: 'Verstappen lap time: 2:27, described as not a great lap.' },
  { startSeconds: 436, endSeconds: 436, category: 'event', description: 'Gasly gains positions as cars ahead go off track; incident under investigation.' },
  { startSeconds: 444, endSeconds: 444, category: 'event', description: 'Lindblad says he was pushed off the track.' },
  { startSeconds: 470, endSeconds: 470, category: 'event', description: 'Investigation opened into Hajar and Gasly for leaving the track and gaining an advantage.' },
  { startSeconds: 474, endSeconds: 481, category: 'event', description: 'Stroll heads to the pits with brake smoke and is confirmed retired.' },
  { startSeconds: 516, endSeconds: 522, category: 'gap', description: 'Russell to Hamilton gap is holding around 3 seconds.' },
  { startSeconds: 516, endSeconds: 516, category: 'race_distance', description: 'Lap 7 of 66.' },
  { startSeconds: 529, endSeconds: 538, category: 'event', description: 'Leclerc runs very close to the back of Piastri and nearly makes contact.' },
  { startSeconds: 553, endSeconds: 553, category: 'event', description: 'Antonelli had a long brake-pedal or brake-fluid issue before the race start.' },
  { startSeconds: 605, endSeconds: 629, category: 'event', description: 'Leclerc overtakes Piastri around the outside of Turn 3.' },
  { startSeconds: 687, endSeconds: 687, category: 'race_distance', description: 'Crossing into lap 9 of 66.' },
  { startSeconds: 752, endSeconds: 770, category: 'gap', description: 'Lawson is in low 1:25s, Russell low 1:23s; Piastri to Lawson is roughly a full pit stop, with Lawson about 22.3 seconds behind Russell.' },
  { startSeconds: 772, endSeconds: 782, category: 'rate', description: 'Undercut described as worth at least 2 seconds gained by pitting first.' },
  { startSeconds: 791, endSeconds: 799, category: 'gap', description: 'Russell to Hamilton gap is 3.4 to 3.5 seconds.' },
  { startSeconds: 808, endSeconds: 820, category: 'lap_time', description: 'Russell 1:23.1 versus Hamilton 1:23.4, about 0.3 seconds per lap.' },
  { startSeconds: 852, endSeconds: 860, category: 'gap', description: 'Piastri is 3 seconds behind Leclerc.' },
  { startSeconds: 883, endSeconds: 900, category: 'gap', description: 'Russell to Hamilton gap stabilizes at 3.5 seconds.' },
  { startSeconds: 919, endSeconds: 927, category: 'gap', description: 'Antonelli is 5.5 seconds behind Russell.' },
  { startSeconds: 919, endSeconds: 927, category: 'event', description: 'Hamilton pits first among the leaders and switches to hard tyres.' },
  { startSeconds: 960, endSeconds: 960, category: 'event', description: 'Lawson pits and drops out of the top 10.' },
  { startSeconds: 970, endSeconds: 979, category: 'pit_stop', description: 'Ferrari stop for Hamilton: approximately 2.5 seconds.' },
  { startSeconds: 984, endSeconds: 984, category: 'event', description: 'Alonso overtakes Bottas at Turn 1.' },
  { startSeconds: 1007, endSeconds: 1024, category: 'event', description: 'Russell pits; stop approximately 2.4 seconds.' },
  { startSeconds: 1024, endSeconds: 1032, category: 'pit_stop', description: 'Verstappen pits; Red Bull stop approximately 2.5 seconds.' },
  { startSeconds: 1040, endSeconds: 1040, category: 'event', description: 'Hamilton emerges 6th; Verstappen emerges into traffic.' },
  { startSeconds: 1094, endSeconds: 1104, category: 'event', description: 'Norris is told to box and pits.' },
  { startSeconds: 1154, endSeconds: 1154, category: 'event', description: 'Antonelli becomes the race leader as front-runners cycle through stops.' },
  { startSeconds: 1183, endSeconds: 1192, category: 'event', description: 'Antonelli pits.' },
  { startSeconds: 1199, endSeconds: 1199, category: 'event', description: 'Leclerc inherits the lead and has yet to stop.' },
  { startSeconds: 1217, endSeconds: 1228, category: 'event', description: 'Leclerc is told to pit again shortly after.' },
  { startSeconds: 1237, endSeconds: 1251, category: 'rate', description: 'Tyre change costs 0.6 seconds on the out-lap, followed by roughly 0.1 seconds per lap of stint degradation.' },
  { startSeconds: 1237, endSeconds: 1251, category: 'event', description: 'Verstappen is the only front-runner on a second fresh set of mediums; others are on hards.' },
  { startSeconds: 1260, endSeconds: 1277, category: 'event', description: 'Leclerc is told to stay out; he has an extra new soft set from his qualifying crash.' },
  { startSeconds: 1311, endSeconds: 1329, category: 'event', description: 'Bottas is told to retire the Cadillac; second retirement.' },
  { startSeconds: 1384, endSeconds: 1391, category: 'event', description: 'Sainz is under investigation for a start-line procedure infringement.' },
  { startSeconds: 1405, endSeconds: 1411, category: 'event', description: 'Both Williams cars are under investigation for a start-line procedure infringement.' },
  { startSeconds: 1459, endSeconds: 1468, category: 'event', description: 'Williams reportedly had non-compliant grid equipment; a 15-second final warning is issued.' },
  { startSeconds: 1468, endSeconds: 1479, category: 'event', description: 'Hajar/Gasly and Lindblad/Hulkenberg Turn-1 track-limits investigations are annulled; no further action.' },
  { startSeconds: 1494, endSeconds: 1511, category: 'event', description: 'Hajar pit-stop sequence drops Hulkenberg behind him.' },
  { startSeconds: 1528, endSeconds: 1539, category: 'event', description: 'Hajar overtakes Bearman for 9th.' },
  { startSeconds: 1557, endSeconds: 1568, category: 'event', description: 'Lawson passes Bearman at Turn 13.' },
  { startSeconds: 1568, endSeconds: 1582, category: 'pit_stop', description: 'Bearman pits after staying on worn medium tyres too long; this is described as costing at least 10 seconds, about half a pit stop.' },
  { startSeconds: 1593, endSeconds: 1593, category: 'pit_stop', description: 'Bearman stop: 3.6 seconds.' },
  { startSeconds: 1610, endSeconds: 1610, category: 'race_distance', description: 'Lap 26 of 66 referenced.' },
  { startSeconds: 1648, endSeconds: 1671, category: 'event', description: 'Alpine team orders: Colapinto lets Gasly through.' },
  { startSeconds: 1769, endSeconds: 1777, category: 'lap_time', description: 'Antonelli last lap 1:22.0, half a second quicker than Russell.' },
  { startSeconds: 1798, endSeconds: 1804, category: 'event', description: 'Russell is told the next seven laps are critical.' },
  { startSeconds: 1804, endSeconds: 1825, category: 'gap', description: 'Antonelli gap falls from 6.4 seconds to under 4 seconds behind Hamilton.' },
  { startSeconds: 1842, endSeconds: 1850, category: 'gap', description: 'Russell to Hamilton gap is 2.2 seconds after Hamilton has pitted once.' },
  { startSeconds: 1881, endSeconds: 1890, category: 'event', description: 'Antonelli receives his first track-limits warning.' },
  { startSeconds: 1905, endSeconds: 1913, category: 'lap_time', description: 'Leclerc 1:22.8, 0.8 seconds quicker than Verstappen.' },
  { startSeconds: 1921, endSeconds: 1932, category: 'event', description: 'Lindblad pits.' },
  { startSeconds: 1932, endSeconds: 1941, category: 'rate', description: 'Lindblad is predicted to catch Verstappen in five laps if the current pace continues.' },
  { startSeconds: 1956, endSeconds: 1966, category: 'gap', description: 'Russell to Antonelli gap is 4.9 seconds; Hamilton is down to 2 seconds in traffic.' },
  { startSeconds: 1995, endSeconds: 2004, category: 'event', description: 'Hulkenberg attacks Lawson for 9th; Lawson defends.' },
  { startSeconds: 2020, endSeconds: 2025, category: 'event', description: 'Gasly joins the Lawson/Hulkenberg fight for 9th.' },
  { startSeconds: 2042, endSeconds: 2052, category: 'event', description: 'Lawson is warned by radio that his defensive move was late and dangerous.' },
  { startSeconds: 2129, endSeconds: 2141, category: 'lap_time', description: 'Russell about 1:23.0 versus Hamilton about 1:23.2.' },
  { startSeconds: 2148, endSeconds: 2153, category: 'event', description: 'Hulkenberg is warned for moving in the braking zone.' },
  { startSeconds: 2208, endSeconds: 2215, category: 'event', description: 'Lindblad passes Ocon for 15th.' },
  { startSeconds: 2233, endSeconds: 2256, category: 'event', description: 'A three-stop strategy window is discussed; Hamilton makes his second stop.' },
  { startSeconds: 2268, endSeconds: 2277, category: 'event', description: 'Hamilton dives into the pits and locks up under braking.' },
  { startSeconds: 2287, endSeconds: 2287, category: 'gap', description: 'Russell is 3.9 seconds ahead of Antonelli.' },
  { startSeconds: 2345, endSeconds: 2354, category: 'gap', description: 'Hamilton to Antonelli real-time gap is approximately 1.7 seconds.' },
  { startSeconds: 2378, endSeconds: 2387, category: 'gap', description: 'Antonelli is 3.9 seconds behind Russell.' },
  { startSeconds: 2378, endSeconds: 2387, category: 'event', description: 'Mercedes are running 1-2, Antonelli then Russell; Hamilton has already stopped.' },
  { startSeconds: 2387, endSeconds: 2397, category: 'lap_time', description: 'Antonelli is 0.7 seconds faster than Russell through the first two sectors.' },
  { startSeconds: 2420, endSeconds: 2429, category: 'event', description: 'Hamilton overtakes Piastri around the outside, with Perez in a Cadillac between them.' },
  { startSeconds: 2441, endSeconds: 2449, category: 'event', description: 'Antonelli is shown a black-and-white flag for track limits; a 5-second penalty is at risk.' },
  { startSeconds: 2454, endSeconds: 2463, category: 'lap_time', description: 'Hamilton sets a 1:20.6 fastest lap, 2.6 seconds faster than Russell; Hamilton to Russell gap is under 21 seconds.' },
  { startSeconds: 2474, endSeconds: 2481, category: 'event', description: 'Hamilton moves up to 6th and Piastri drops to 7th.' },
  { startSeconds: 2494, endSeconds: 2494, category: 'event', description: 'Verstappen has a slow pit stop and emerges 7th.' },
  { startSeconds: 2536, endSeconds: 2543, category: 'event', description: 'Hulkenberg pits and appears to retire with an engine failure; third retirement.' },
  { startSeconds: 2568, endSeconds: 2583, category: 'gap', description: 'Antonelli is several tenths faster per lap, then almost a second faster for one lap; he closes to about 0.5 seconds behind Russell while blocked by a Williams.' },
  { startSeconds: 2596, endSeconds: 2603, category: 'lap_time', description: 'Leclerc 1:20.9 versus Hamilton 1:20.7.' },
  { startSeconds: 2618, endSeconds: 2622, category: 'gap', description: 'Hamilton to Russell gap falls to 10.7 seconds, from about 25 seconds when Hamilton exited the pits.' },
  { startSeconds: 2656, endSeconds: 2677, category: 'event', description: 'Leclerc is told to let Hamilton through because they are on different strategies.' },
  { startSeconds: 2673, endSeconds: 2673, category: 'gap', description: 'Antonelli closes to 0.3 seconds behind Russell.' },
  { startSeconds: 2674, endSeconds: 2688, category: 'gap', description: 'Hamilton is 9.4 seconds behind Russell; last laps: Hamilton 1:21.0, Russell 1:23.4, Antonelli 1:23.7.' },
  { startSeconds: 2674, endSeconds: 2688, category: 'rate', description: 'Hamilton is described as taking 2 to 2.5 seconds per lap out of the gap.' },
  { startSeconds: 2681, endSeconds: 2691, category: 'event', description: 'Russell defends the inside from Antonelli into Turn 1.' },
  { startSeconds: 2698, endSeconds: 2710, category: 'event', description: 'Antonelli nearly passes Russell at Turn 4 and tucks back in behind.' },
  { startSeconds: 2743, endSeconds: 2758, category: 'event', description: 'Antonelli receives another track-limits warning; one more infringement means a penalty.' },
  { startSeconds: 2854, endSeconds: 2862, category: 'gap', description: 'Norris is 3.9 seconds behind the lead group.' },
  { startSeconds: 2886, endSeconds: 2894, category: 'gap', description: 'Norris gap is 4.3 seconds and described as healthy.' },
  { startSeconds: 2908, endSeconds: 2917, category: 'gap', description: 'Hamilton to Antonelli gap is 4.8 seconds.' },
  { startSeconds: 2919, endSeconds: 2934, category: 'event', description: 'Russell final stop is signalled; Mercedes tell both drivers not to fight with Ferrari closing.' },
  { startSeconds: 2956, endSeconds: 2971, category: 'event', description: 'Norris pits for hard tyres; Russell is told to box this lap.' },
  { startSeconds: 2979, endSeconds: 2979, category: 'race_distance', description: '30 laps to go, against a 66-lap race distance.' },
  { startSeconds: 3010, endSeconds: 3028, category: 'pit_stop', description: 'Russell stop: 2.8 seconds; he emerges ahead of Norris.' },
  { startSeconds: 3063, endSeconds: 3069, category: 'event', description: 'Antonelli is told to cover Norris; pit call imminent.' },
  { startSeconds: 3096, endSeconds: 3105, category: 'event', description: 'Hamilton takes the race lead while Russell and Antonelli are mid pit-cycle.' },
  { startSeconds: 3113, endSeconds: 3113, category: 'pit_stop', description: 'Antonelli stop: 2.8 seconds.' },
  { startSeconds: 3121, endSeconds: 3128, category: 'event', description: 'Russell exits the pits just ahead of Norris.' },
  { startSeconds: 3138, endSeconds: 3150, category: 'event', description: 'Antonelli exits the pits and narrowly holds position ahead of Norris.' },
  { startSeconds: 3168, endSeconds: 3168, category: 'event', description: 'Transcript excerpt ends with Hamilton leading.' },
];

// Each boundary is a strategy reset confirmed by an OpenF1 pit record. The
// early grid-to-lights transition needs its own calibration point because the
// broadcast compresses the pre-race sequence.
export const Barcelona_video_chunks = [
  {
    id: 'opening-stint',
    videoStartSeconds: 0,
    videoEndSeconds: 923,
    calibrationAnchors: [
      { videoSeconds: 0, openF1Timestamp: '2026-06-14T13:00:00.000Z', source: 'scheduled-session-start' },
      { videoSeconds: 14, openF1Timestamp: '2026-06-14T13:03:27.854Z', source: 'session-started' },
      { videoSeconds: 923, openF1Timestamp: '2026-06-14T13:19:06.289Z', source: 'hamilton-first-pit-stop' },
    ],
  },
  {
    id: 'first-strategy-cycle',
    videoStartSeconds: 923,
    videoEndSeconds: 2244.5,
    calibrationAnchors: [
      { videoSeconds: 923, openF1Timestamp: '2026-06-14T13:19:06.289Z', source: 'hamilton-first-pit-stop' },
      { videoSeconds: 2244.5, openF1Timestamp: '2026-06-14T13:41:28.951Z', source: 'hamilton-second-pit-stop' },
    ],
  },
  {
    id: 'second-strategy-cycle',
    videoStartSeconds: 2244.5,
    videoEndSeconds: 3019,
    calibrationAnchors: [
      { videoSeconds: 2244.5, openF1Timestamp: '2026-06-14T13:41:28.951Z', source: 'hamilton-second-pit-stop' },
      { videoSeconds: 3019, openF1Timestamp: '2026-06-14T13:53:54.451Z', source: 'russell-final-pit-stop' },
    ],
  },
  {
    id: 'final-pit-cycle',
    videoStartSeconds: 3019,
    videoEndSeconds: 3168,
    calibrationAnchors: [
      { videoSeconds: 3019, openF1Timestamp: '2026-06-14T13:53:54.451Z', source: 'russell-final-pit-stop' },
      { videoSeconds: 3144, openF1Timestamp: '2026-06-14T13:55:16.919Z', source: 'antonelli-final-pit-stop' },
      {
        videoSeconds: 3168,
        openF1Timestamp: '2026-06-14T13:55:32.753Z',
        source: 'antonelli-final-pit-stop-rate',
        estimated: true,
      },
    ],
  },
];

function interpolateTimestamp(videoSeconds, startAnchor, endAnchor) {
  const startMilliseconds = Date.parse(startAnchor.openF1Timestamp);
  const endMilliseconds = Date.parse(endAnchor.openF1Timestamp);
  const progress = (videoSeconds - startAnchor.videoSeconds)
    / (endAnchor.videoSeconds - startAnchor.videoSeconds);

  return new Date(startMilliseconds + ((endMilliseconds - startMilliseconds) * progress)).toISOString();
}

export function mapBarcelonaVideoTime(videoSeconds) {
  if (!Number.isFinite(videoSeconds)) {
    throw new TypeError('videoSeconds must be a finite number');
  }

  const finalChunk = Barcelona_video_chunks.at(-1);
  const chunk = Barcelona_video_chunks.find((candidate) => {
    const includesEnd = candidate.id === finalChunk.id;
    return videoSeconds >= candidate.videoStartSeconds
      && (videoSeconds < candidate.videoEndSeconds || (includesEnd && videoSeconds <= candidate.videoEndSeconds));
  });
  if (!chunk) return null;

  const anchors = chunk.calibrationAnchors;
  const endAnchorIndex = anchors.findIndex((anchor) => videoSeconds <= anchor.videoSeconds);
  const endAnchor = anchors[Math.max(endAnchorIndex, 1)];
  const startAnchor = anchors[anchors.indexOf(endAnchor) - 1];

  return {
    chunkId: chunk.id,
    openF1Timestamp: interpolateTimestamp(videoSeconds, startAnchor, endAnchor),
    estimated: Boolean(startAnchor.estimated || endAnchor.estimated),
  };
}

const TIME_SERIES_RESOURCE_KEYS = [
  'laps',
  'pit',
  'stints',
  'position',
  'race_control',
  'weather',
];

function recordsWithinTimestampRange(records, startTimestamp, endTimestamp, includesEnd) {
  const startMilliseconds = Date.parse(startTimestamp);
  const endMilliseconds = Date.parse(endTimestamp);

  return records.filter((record) => {
    const timestamp = Date.parse(record.date);
    return Number.isFinite(timestamp)
      && timestamp >= startMilliseconds
      && (timestamp < endMilliseconds || (includesEnd && timestamp <= endMilliseconds));
  });
}

export function buildBarcelonaOpenF1Chunks(bundle) {
  return Barcelona_video_chunks.map((chunk) => {
    const start = mapBarcelonaVideoTime(chunk.videoStartSeconds);
    const end = mapBarcelonaVideoTime(chunk.videoEndSeconds);
    const isFinalChunk = chunk.id === Barcelona_video_chunks.at(-1).id;
    const resources = Object.fromEntries(
      TIME_SERIES_RESOURCE_KEYS.map((resourceKey) => [
        resourceKey,
        recordsWithinTimestampRange(
          Array.isArray(bundle[resourceKey]) ? bundle[resourceKey] : [],
          start.openF1Timestamp,
          end.openF1Timestamp,
          isFinalChunk
        ),
      ])
    );

    return {
      id: chunk.id,
      videoStartSeconds: chunk.videoStartSeconds,
      videoEndSeconds: chunk.videoEndSeconds,
      openF1StartTimestamp: start.openF1Timestamp,
      openF1EndTimestamp: end.openF1Timestamp,
      estimated: Boolean(start.estimated || end.estimated),
      videoAnchors: Barcelona_video_anchors.filter((anchor) =>
        anchor.startSeconds >= chunk.videoStartSeconds
        && (anchor.startSeconds < chunk.videoEndSeconds || isFinalChunk)
      ),
      resources,
    };
  });
}

function latestRecordsByDriver(records, timestamp) {
  const latestRecords = new Map();
  for (const record of records) {
    if (Date.parse(record.date) <= timestamp) {
      latestRecords.set(record.driver_number, record);
    }
  }
  return latestRecords;
}

function latestRecord(records, timestamp) {
  return records.reduce((latest, record) => (
    Date.parse(record.date) <= timestamp ? record : latest
  ), null);
}

function normalizeDriver(driver) {
  return {
    driverNumber: driver.driver_number,
    driverName: driver.full_name ?? driver.name_acronym ?? null,
    teamName: driver.team_name ?? null,
  };
}

export function createBarcelonaWatchLiveState(videoSeconds, bundle, chunks) {
  const mapping = mapBarcelonaVideoTime(videoSeconds);
  if (!mapping) return null;

  const chunk = chunks.find((candidate) => candidate.id === mapping.chunkId);
  const timestamp = Date.parse(mapping.openF1Timestamp);
  const driversByNumber = new Map(
    (bundle.drivers ?? []).map((driver) => [driver.driver_number, normalizeDriver(driver)])
  );
  const positionsByDriver = latestRecordsByDriver(chunk.resources.position, timestamp);
  const stintsByDriver = latestRecordsByDriver(chunk.resources.stints, timestamp);
  const lapsAtTimestamp = chunk.resources.laps.filter((lap) => Date.parse(lap.date) <= timestamp);
  const weather = latestRecord(chunk.resources.weather, timestamp);

  const leaderboard = [...positionsByDriver.values()]
    .sort((left, right) => left.position - right.position)
    .map((position) => ({
      position: position.position,
      ...(driversByNumber.get(position.driver_number) ?? { driverNumber: position.driver_number, driverName: null, teamName: null }),
      tyreCompound: stintsByDriver.get(position.driver_number)?.compound ?? null,
      stintNumber: stintsByDriver.get(position.driver_number)?.stint_number ?? null,
    }));

  const totalLaps = Math.max(0, ...(bundle.laps ?? [])
    .map((lap) => lap.lap_number)
    .filter(Number.isFinite));
  const currentLap = Math.max(0, ...lapsAtTimestamp
    .map((lap) => lap.lap_number)
    .filter(Number.isFinite));

  return {
    videoSeconds,
    mapping,
    session: {
      sessionKey: bundle.session_key,
      sessionName: bundle.session?.[0]?.session_name ?? null,
      meetingName: bundle.meeting?.[0]?.meeting_name ?? null,
      currentLap,
      totalLaps,
    },
    leaderboard,
    weather: weather ? {
      airTemperature: weather.air_temperature ?? null,
      trackTemperature: weather.track_temperature ?? null,
      humidity: weather.humidity ?? null,
      rainfall: weather.rainfall ?? null,
      windSpeed: weather.wind_speed ?? null,
    } : null,
    recentRaceControl: chunk.resources.race_control
      .filter((event) => Date.parse(event.date) <= timestamp)
      .slice(-5)
      .map((event) => ({
        date: event.date,
        lapNumber: event.lap_number ?? null,
        category: event.category ?? null,
        flag: event.flag ?? null,
        message: event.message ?? null,
      })),
    recentAnchors: chunk.videoAnchors
      .filter((anchor) => anchor.startSeconds <= videoSeconds)
      .slice(-5),
  };
}

watchLiveRouter.get('/state', async (req, res, next) => {
  const value = req.query.videoSeconds;
  const videoSeconds = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(videoSeconds)) {
    return res.status(400).json({ error: 'videoSeconds must be a finite number' });
  }

  const mapping = mapBarcelonaVideoTime(videoSeconds);

  if (!mapping) {
    return res.status(400).json({
      error: `videoSeconds must be between 0 and ${Barcelona_video_chunks.at(-1).videoEndSeconds}`,
    });
  }

  try {
    const { bundle, chunks } = await getBarcelonaOpenF1Data();
    return res.json(createBarcelonaWatchLiveState(videoSeconds, bundle, chunks));
  } catch (err) {
    return next(err);
  }
});
