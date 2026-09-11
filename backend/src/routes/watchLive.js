import { Router } from 'express';
import { fetchBarcelonaRaceIntervals, fetchBarcelonaRaceRaw } from './openf1.js';

// Maps replay playback time to cached Barcelona OpenF1 state.
export const watchLiveRouter = Router();

// The DB row key for the persisted bundle cache (see ExternalApiCache in
// schema.prisma). Bumped if the bundle's *shape* ever changes in a way that
// would make an old cached payload stale/incompatible.
const BARCELONA_CACHE_KEY = 'openf1:barcelona-2026-race:v3';

// In-memory cache on top of the DB cache — avoids a DB round-trip on every
// single request within the same running process, while the DB layer
// avoids re-fetching from OpenF1 (which takes well over a minute) after a
// restart.
let Barcelona_openf1Data = null;
let Barcelona_openf1Chunks = null;
let Barcelona_precomputed = null;
// Tracks an in-progress fetch so concurrent callers await the SAME promise
// instead of each independently kicking off their own full fetch sequence
// against OpenF1. Without this, every request that arrives before the
// first fetch finishes starts a brand new multi-request sequence — a
// classic cache-stampede bug that reliably trips OpenF1's rate limits
// (30/min, 3/sec): a dozen overlapping fetch sequences instead of one
// paced one.
let Barcelona_fetchPromise = null;
const Barcelona_snapshotCache = new Map();
const MAX_BUFFER_SECONDS = 20;
const GAP_REFERENCE_BUCKET_MS = 2_000;
const MAX_INTERVAL_SAMPLE_AGE_MS = 6_000;

async function fetchAndCacheBarcelonaData() {
  // Imported lazily, not at module top-level: several exports from this
  // file (buildBarcelonaOpenF1Chunks, createBarcelonaWatchLiveState, etc.)
  // are imported directly by tests that never call this function and
  // never need a database connection. lib/prisma.js throws at import time
  // if DATABASE_URL isn't set, which it isn't in the test environment — a
  // static top-level import here would break those tests even though
  // they don't touch the DB.
  const { prisma } = await import('../lib/prisma.js');

  const cached = await prisma.externalApiCache.findUnique({
    where: { key: BARCELONA_CACHE_KEY },
  });

  if (cached) return cached.payload;

  const raw = await fetchBarcelonaRaceRaw();
  let intervals = [];
  try {
    intervals = await fetchBarcelonaRaceIntervals();
  } catch (err) {
    console.warn('Barcelona OpenF1 interval fetch failed:', err.message);
  }
  const fresh = { ...raw, intervals };
  // Persist so the next cold start (server restart/redeploy) doesn't have
  // to redo the expensive fetch chain against OpenF1 again. Best-effort —
  // if this write fails, the in-memory cache above still works for the
  // lifetime of this process, we just lose the durability across restarts.
  try {
    await prisma.externalApiCache.upsert({
      where: { key: BARCELONA_CACHE_KEY },
      create: { key: BARCELONA_CACHE_KEY, payload: fresh },
      update: { payload: fresh, fetchedAt: new Date() },
    });
  } catch (err) {
    console.error('Failed to persist Barcelona OpenF1 cache to DB:', err);
  }
  return fresh;
}

async function getBarcelonaOpenF1Data() {
  if (Barcelona_openf1Data) {
    return { bundle: Barcelona_openf1Data, chunks: Barcelona_openf1Chunks };
  }

  if (!Barcelona_fetchPromise) {
    Barcelona_fetchPromise = fetchAndCacheBarcelonaData();
  }

  try {
    Barcelona_openf1Data = await Barcelona_fetchPromise;
  } catch (err) {
    // Let the next request retry from scratch instead of staying stuck
    // pointing at a rejected promise forever.
    Barcelona_fetchPromise = null;
    throw err;
  }

  Barcelona_openf1Chunks = buildBarcelonaOpenF1Chunks(Barcelona_openf1Data);
  Barcelona_precomputed = buildPrecomputedIndex(Barcelona_openf1Data, Barcelona_openf1Chunks);
  return { bundle: Barcelona_openf1Data, chunks: Barcelona_openf1Chunks };
}

// Builds a one-time lookup index from the cached OpenF1 bundle so each
// snapshot computation avoids re-parsing timestamps, re-flattening laps,
// and re-scanning driver records. Called once after the initial fetch.
function buildPrecomputedIndex(bundle, chunks) {
  const driversByNumber = new Map(
    (bundle.drivers ?? []).map((d) => [d.driver_number, normalizeDriver(d)])
  );

  // Groups time-series records by driver with pre-parsed timestamps so
  // latestByDriver can use a single comparison per record.
  function indexByDriver(records, dateField) {
    const index = new Map();
    for (const record of records) {
      const dateValue = record[dateField] ?? record.date;
      const ms = Date.parse(dateValue);
      if (!Number.isFinite(ms)) continue;
      const driver = record.driver_number;
      if (!index.has(driver)) index.set(driver, []);
      index.get(driver).push({ ...record, _ms: ms });
    }
    for (const driverRecords of index.values()) {
      driverRecords.sort((left, right) => left._ms - right._ms);
    }
    return index;
  }

  const positionIndex = indexByDriver(bundle.position ?? [], 'date');
  const stintIndex = indexByDriver(bundle.stints ?? [], 'date');
  const carDataIndex = indexByDriver(bundle.car_data ?? [], 'date');
  // Real x,y,z position telemetry — used to enrich the leaderboard with
  // real track position when available, and by deriveTrackShape below to
  // trace an accurate track outline. Most sessions won't have this (it's
  // a heavier resource OpenF1 doesn't always retain), so downstream code
  // always treats missing x/y as an expected case, not an error.
  const locationIndex = indexByDriver(bundle.location ?? [], 'date');
  const intervalIndex = indexByDriver(bundle.intervals ?? [], 'date');

  // Pre-flatten laps from all chunks with pre-parsed start timestamps.
  // OpenF1 lap records use date_start; tests may use date.
  const allLaps = chunks.flatMap((c) => (c.resources.laps ?? []).map((lap) => ({
    ...lap,
    _startMs: Date.parse(lap.date_start ?? lap.date),
  }))).filter((lap) => Number.isFinite(lap._startMs))
    .sort((a, b) => a._startMs - b._startMs);

  // Pre-group laps by driver (sorted by start time) so createBarcelonaWatchLiveState
  // can binary-search per driver instead of linearly scanning all laps every call.
  const lapsByDriver = new Map();
  for (const lap of allLaps) {
    const driver = lap.driver_number;
    if (!lapsByDriver.has(driver)) lapsByDriver.set(driver, []);
    lapsByDriver.get(driver).push(lap);
  }

  // Precompute sorted lap end times for O(log n) currentLap lookups.
  const completedLapEnds = allLaps
    .filter((lap) => Number.isFinite(lap.lap_duration) && lap.lap_duration > 0)
    .map((lap) => ({ endMs: lap._startMs + lap.lap_duration * 1000, lap_number: lap.lap_number }))
    .sort((a, b) => a.endMs - b.endMs);

  const totalLaps = Math.max(0, ...(bundle.laps ?? [])
    .map((lap) => lap.lap_number)
    .filter(Number.isFinite));

  return {
    driversByNumber, positionIndex, stintIndex, carDataIndex, locationIndex, intervalIndex,
    allLaps, lapsByDriver, completedLapEnds, totalLaps,
  };
}

// Triggers the one-time OpenF1 fetch in the background so the cache is warm
// by the time a user hits the watch-live page. Called from server.js at
// startup — failures are logged but never fatal.
export function prewarmBarcelonaCache() {
  getBarcelonaOpenF1Data().catch((err) => {
    console.warn('Barcelona OpenF1 cache pre-warm failed:', err.message);
  });
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

  if (videoSeconds < 0) return null;

  // Inclusive end boundary (<=): at shared boundaries like videoSeconds=923,
  // the earlier chunk wins because its end matches before the next chunk starts.
  const chunk = Barcelona_video_chunks.find((candidate) => (
    videoSeconds >= candidate.videoStartSeconds
    && videoSeconds <= candidate.videoEndSeconds
  ));
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
  'intervals',
  'car_data',
  // Real x,y,z telemetry — not every session has it (this one doesn't),
  // but when present it's used both to enrich the leaderboard with real
  // track position and, separately, by deriveTrackShape to trace an
  // accurate outline. Included here so it gets the same time-windowed
  // chunk slicing as every other time-series resource.
  'location',
  'race_control',
  'weather',
];

function recordsWithinTimestampRange(records, startTimestamp, endTimestamp, includesEnd) {
  const startMilliseconds = Date.parse(startTimestamp);
  const endMilliseconds = Date.parse(endTimestamp);

  return records.filter((record) => {
    // Most OpenF1 resources use `date`; laps use `date_start`.
    const timestamp = Date.parse(record.date ?? record.date_start);
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

function latestByDriver(driverRecords, timestamp) {
  const latest = new Map();
  for (const [driverNumber, records] of driverRecords) {
    for (const record of records) {
      if (record._ms <= timestamp) latest.set(driverNumber, record);
    }
  }
  return latest;
}

// Builds a pre-parsed, per-driver index from a flat record array.
// Used by the on-the-fly fallback path when no precomputed index exists.
function buildDriverIndex(records, dateField = 'date') {
  const index = new Map();
  for (const record of records) {
    const ms = Date.parse(record[dateField] ?? record.date);
    if (!Number.isFinite(ms)) continue;
    const driver = record.driver_number;
    if (!index.has(driver)) index.set(driver, []);
    index.get(driver).push({ ...record, _ms: ms });
  }
  for (const driverRecords of index.values()) {
    driverRecords.sort((left, right) => left._ms - right._ms);
  }
  return index;
}

function numericGapToLeader(record) {
  if (record?.gap_to_leader == null) return null;
  const value = Number(record.gap_to_leader);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Resolve a driver's gap to the leader at one shared race timestamp. For a
// completed replay we interpolate between the surrounding OpenF1 interval
// samples. During a live edge, the latest preceding sample is accepted only
// while it is fresh enough; otherwise the UI receives null and displays "--".
function gapToLeaderAtReference(records, referenceTimestamp, isLeader = false) {
  if (isLeader) return 0;
  if (!records?.length || !Number.isFinite(referenceTimestamp)) return null;

  let lo = 0;
  let hi = records.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (records[mid]._ms <= referenceTimestamp) lo = mid + 1;
    else hi = mid - 1;
  }

  const before = hi >= 0 ? records[hi] : null;
  const after = lo < records.length ? records[lo] : null;
  const beforeValue = numericGapToLeader(before);
  const afterValue = numericGapToLeader(after);
  const beforeAge = before ? referenceTimestamp - before._ms : Number.POSITIVE_INFINITY;
  const afterAge = after ? after._ms - referenceTimestamp : Number.POSITIVE_INFINITY;

  if (beforeValue != null && afterValue != null
    && beforeAge <= MAX_INTERVAL_SAMPLE_AGE_MS
    && afterAge <= MAX_INTERVAL_SAMPLE_AGE_MS
    && after._ms > before._ms) {
    const progress = beforeAge / (after._ms - before._ms);
    return beforeValue + (afterValue - beforeValue) * progress;
  }

  return beforeValue != null && beforeAge <= MAX_INTERVAL_SAMPLE_AGE_MS
    ? beforeValue
    : null;
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

  const chunkIdx = chunks.findIndex((candidate) => candidate.id === mapping.chunkId);
  const chunk = chunks[chunkIdx];
  const idx = Barcelona_precomputed;
  const timestamp = Date.parse(mapping.openF1Timestamp);

  // At chunk boundaries, map() returns the earlier chunk (inclusive end)
  // but recordsWithinTimestampRange uses exclusive end (<), so records at
  // the exact boundary timestamp live in the next chunk. Fall back to the
  // adjacent chunk's resources when the mapped chunk is empty at the boundary.
  const nextChunk = chunkIdx + 1 < chunks.length ? chunks[chunkIdx + 1] : null;
  const chunkMsEnd = Date.parse(chunk.openF1EndTimestamp);
  const atBoundary = nextChunk && Number.isFinite(chunkMsEnd) && timestamp === chunkMsEnd;
  function resourceRecords(key) {
    const records = chunk.resources[key] ?? [];
    if (records.length > 0 || !atBoundary) return records;
    return nextChunk.resources[key] ?? [];
  }
  const driversByNumber = idx?.driversByNumber ?? new Map(
    (bundle.drivers ?? []).map((driver) => [driver.driver_number, normalizeDriver(driver)])
  );
  // Merge live position data with the starting grid so the masterboard always
  // shows all drivers. Grid positions act as a base layer — live position
  // records override them as they become available.
  const livePositions = idx
    ? latestByDriver(idx.positionIndex, timestamp)
    : latestByDriver(buildDriverIndex(resourceRecords('position')), timestamp);
  const positionsByDriver = new Map();
  const gridByDriver = new Map();
  if (Array.isArray(bundle.starting_grid) && bundle.starting_grid.length > 0) {
    for (const entry of bundle.starting_grid) {
      positionsByDriver.set(entry.driver_number, {
        driver_number: entry.driver_number,
        position: entry.position,
      });
      gridByDriver.set(entry.driver_number, entry.position);
    }
  }
  for (const [driverNumber, record] of livePositions) {
    positionsByDriver.set(driverNumber, record);
  }
  const stintsByDriver = idx
    ? latestByDriver(idx.stintIndex, timestamp)
    : latestByDriver(buildDriverIndex(resourceRecords('stints')), timestamp);
  // car_data may be available for some sessions; use the precomputed index
  // when available, otherwise build it on the fly.
  const carDataByDriver = idx
    ? latestByDriver(idx.carDataIndex, timestamp)
    : latestByDriver(buildDriverIndex(resourceRecords('car_data')), timestamp);
  // Real x,y,z position, when this session actually has /location data
  // (most don't). Missing for a given driver just means no real-position
  // enrichment for them — callers already treat x/y as possibly absent.
  const locationByDriver = idx
    ? latestByDriver(idx.locationIndex, timestamp)
    : latestByDriver(buildDriverIndex(resourceRecords('location')), timestamp);
  const intervalIndex = idx?.intervalIndex
    ?? buildDriverIndex(resourceRecords('intervals'));
  const gapReferenceTimestamp = Math.floor(timestamp / GAP_REFERENCE_BUCKET_MS)
    * GAP_REFERENCE_BUCKET_MS;
  // Binary-search the precomputed per-driver lap index to find the latest
  // lap at or before the current timestamp, plus the previous lap (for
  // lastLapTime). O(log n) per driver instead of O(n) over all laps.
  const lapsByDriver = idx?.lapsByDriver ?? null;
  const allLaps = idx?.allLaps ?? chunks.flatMap((c) =>
    (c.resources.laps ?? []).map((lap) => ({ ...lap, _startMs: Date.parse(lap.date_start ?? lap.date) }))
      .filter((lap) => Number.isFinite(lap._startMs))
      .sort((a, b) => a._startMs - b._startMs)
  );
  const latestLapsByDriver = new Map();
  const previousLapsByDriver = new Map();
  if (lapsByDriver) {
    for (const [driverNum, driverLaps] of lapsByDriver) {
      let lo = 0;
      let hi = driverLaps.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (driverLaps[mid]._startMs <= timestamp) lo = mid + 1;
        else hi = mid - 1;
      }
      if (hi >= 0) {
        const latestLap = driverLaps[hi];
        // Only count laps where lap_duration is populated (lap completed).
        // This prevents pit-stop laps from creating phantom gaps.
        if (Number.isFinite(latestLap.lap_duration) && latestLap.lap_duration > 0) {
          latestLapsByDriver.set(driverNum, latestLap);
          if (hi > 0) previousLapsByDriver.set(driverNum, driverLaps[hi - 1]);
        }
      }
    }
  } else {
    for (const lap of allLaps) {
      if (lap._startMs <= timestamp
        && Number.isFinite(lap.lap_duration) && lap.lap_duration > 0) {
        const current = latestLapsByDriver.get(lap.driver_number);
        if (current && lap._startMs > current._startMs) {
          previousLapsByDriver.set(lap.driver_number, current);
        }
        latestLapsByDriver.set(lap.driver_number, lap);
      }
    }
  }
  const weather = latestRecord(resourceRecords('weather'), timestamp);

  // Build the leaderboard sorted by position, then compute per-driver
  // metrics that depend on neighbours (gap) or historical data (lap time,
  // grid delta).
  const sorted = [...positionsByDriver.values()]
    .sort((left, right) => left.position - right.position);
  const leaderboard = sorted.map((position, index) => {
    const driverLap = latestLapsByDriver.get(position.driver_number);
    const prevLap = previousLapsByDriver.get(position.driver_number);
    const lapSpeed = driverLap?.st_speed ?? driverLap?.i2_speed ?? driverLap?.i1_speed ?? null;
    const carSpeed = carDataByDriver.get(position.driver_number)?.speed ?? null;
    // Last lap time = gap between consecutive lap start timestamps.
    const lastLapTime = (driverLap && prevLap)
      ? (driverLap._startMs - prevLap._startMs) / 1000
      : null;
    // Calculate both cars' gaps to the leader at the same two-second timing
    // reference, then subtract them. Missing, lapped, stale, or inconsistent
    // telemetry produces null so the frontend displays "--".
    let gapToAhead = null;
    if (index > 0) {
      const ahead = sorted[index - 1];
      const driverGapToLeader = gapToLeaderAtReference(
        intervalIndex.get(position.driver_number),
        gapReferenceTimestamp,
      );
      const aheadGapToLeader = gapToLeaderAtReference(
        intervalIndex.get(ahead.driver_number),
        gapReferenceTimestamp,
        index === 1,
      );
      if (driverGapToLeader != null && aheadGapToLeader != null) {
        const candidateGap = driverGapToLeader - aheadGapToLeader;
        if (Number.isFinite(candidateGap) && candidateGap >= 0) {
          gapToAhead = Number(candidateGap.toFixed(3));
        }
      }
    }
    const gridDelta = gridByDriver.has(position.driver_number)
      ? gridByDriver.get(position.driver_number) - position.position
      : null;
    const location = locationByDriver.get(position.driver_number);
    return {
      position: position.position,
      ...(driversByNumber.get(position.driver_number) ?? { driverNumber: position.driver_number, driverName: null, teamName: null }),
      tyreCompound: stintsByDriver.get(position.driver_number)?.compound ?? null,
      stintNumber: stintsByDriver.get(position.driver_number)?.stint_number ?? null,
      speedKph: lapSpeed ?? carSpeed,
      lastLapTime,
      gapToAhead,
      gridDelta,
      // Real x,y — null when this session has no /location data for this
      // driver at this point in time (the common case). Consumers treat
      // this as "no real position available," not an error.
      x: location?.x ?? null,
      y: location?.y ?? null,
    };
  });

  // currentLap via binary search on precomputed completed-lap end times.
  const completedLapEnds = idx?.completedLapEnds ?? [];
  let currentLap = 0;
  if (completedLapEnds.length > 0) {
    let lo = 0;
    let hi = completedLapEnds.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (completedLapEnds[mid].endMs <= timestamp) lo = mid + 1;
      else hi = mid - 1;
    }
    for (let i = 0; i < lo; i++) {
      if (completedLapEnds[i].lap_number > currentLap) {
        currentLap = completedLapEnds[i].lap_number;
      }
    }
  } else {
    // Fallback: highest started lap number (no completion check).
    currentLap = Math.max(0, ...allLaps
      .filter((lap) => Number.isFinite(lap._startMs) && lap._startMs <= timestamp)
      .map((lap) => lap.lap_number)
      .filter(Number.isFinite));
  }
  const totalLaps = idx?.totalLaps ?? Math.max(0, ...(bundle.laps ?? [])
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
    recentRaceControl: resourceRecords('race_control')
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

export function getBarcelonaCachedState(videoSeconds, bundle, chunks, cache = Barcelona_snapshotCache) {
  const snapshotSecond = Math.floor(videoSeconds);
  let snapshot = cache.get(snapshotSecond);

  if (!snapshot) {
    snapshot = createBarcelonaWatchLiveState(snapshotSecond, bundle, chunks);
    cache.set(snapshotSecond, snapshot);
  }

  return snapshot;
}

export function createBarcelonaWatchLiveBuffer(videoSeconds, bufferSeconds, bundle, chunks, cache) {
  const bufferStartSeconds = Math.floor(videoSeconds);
  const finalVideoSecond = Barcelona_video_chunks.at(-1).videoEndSeconds;
  const bufferEndSeconds = Math.min(bufferStartSeconds + bufferSeconds, finalVideoSecond);
  const snapshots = [];

  for (let second = bufferStartSeconds; second <= bufferEndSeconds; second += 1) {
    snapshots.push(getBarcelonaCachedState(second, bundle, chunks, cache));
  }

  return {
    requestedVideoSeconds: videoSeconds,
    bufferStartSeconds,
    bufferEndSeconds,
    snapshots,
  };
}

// Derives an accurate track outline from real location telemetry, the same
// technique the reference F1 Race Replay tool uses via FastF1: pick one
// clean, representative lap and trace the x,y points a car actually drove.
// This works for any circuit with no per-track manual design — it's why
// neither that tool nor this one needs a hand-drawn map per circuit.
let Barcelona_trackShapeCache = null;

function deriveTrackShape(bundle) {
  if (Barcelona_trackShapeCache) return Barcelona_trackShapeCache;

  const locationRecords = bundle.location ?? [];
  if (locationRecords.length === 0) return null;

  // Prefer the driver with the most location records — a clean run with
  // fewer gaps in telemetry coverage than a driver who retired early or
  // spent time in the garage.
  const countsByDriver = new Map();
  for (const record of locationRecords) {
    countsByDriver.set(record.driver_number, (countsByDriver.get(record.driver_number) ?? 0) + 1);
  }
  const [referenceDriver] = [...countsByDriver.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null];
  if (referenceDriver == null) return null;

  // Prefer a single representative lap over the whole session — avoids
  // pit lane excursions and formation-lap oddities cluttering the outline.
  // Picks a lap roughly a third of the way through the race: early enough
  // that tyre wear/fuel load haven't caused an unusual line, late enough
  // to be clear of first-lap incidents.
  const driverLaps = (bundle.laps ?? [])
    .filter((lap) => lap.driver_number === referenceDriver && lap.lap_number && lap.date_start)
    .sort((a, b) => a.lap_number - b.lap_number);

  let windowStartMs = null;
  let windowEndMs = null;
  if (driverLaps.length > 2) {
    const sampleIndex = Math.floor(driverLaps.length / 3);
    windowStartMs = Date.parse(driverLaps[sampleIndex].date_start);
    windowEndMs = driverLaps[sampleIndex + 1]
      ? Date.parse(driverLaps[sampleIndex + 1].date_start)
      : windowStartMs + 2 * 60 * 1000;
  }

  const candidatePoints = locationRecords
    .filter((record) => record.driver_number === referenceDriver)
    .filter((record) => {
      if (windowStartMs == null) return true;
      const t = Date.parse(record.date);
      return t >= windowStartMs && t <= windowEndMs;
    })
    .map((record) => ({ x: record.x, y: record.y }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (candidatePoints.length < 10) return null;

  // Downsample to a manageable point count for a smooth-but-light SVG path.
  const TARGET_POINTS = 200;
  const step = Math.max(1, Math.floor(candidatePoints.length / TARGET_POINTS));
  const points = candidatePoints.filter((_, i) => i % step === 0);

  Barcelona_trackShapeCache = { points, sourceDriverNumber: referenceDriver };
  return Barcelona_trackShapeCache;
}

let Barcelona_staticTrackShapeCache = null;

// Static fallback for sessions with no live /location data (this one has
// none — confirmed via a direct DB query). The physical circuit hasn't
// changed, so this is real telemetry from an actual 2024 Spanish GP lap,
// generated once offline via scripts/generate_track_shape.py using FastF1
// (which has no data at all for the fictional session itself, only for
// real past seasons at the same circuit).
async function readStaticTrackShape() {
  if (Barcelona_staticTrackShapeCache) return Barcelona_staticTrackShapeCache;
  try {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const dataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'barcelona-track-shape.json');
    const raw = await readFile(dataPath, 'utf-8');
    Barcelona_staticTrackShapeCache = JSON.parse(raw);
    return Barcelona_staticTrackShapeCache;
  } catch (err) {
    console.error('Failed to read static track shape fallback:', err);
    return null;
  }
}

watchLiveRouter.get('/track-shape', async (req, res, next) => {
  try {
    const { bundle } = await getBarcelonaOpenF1Data();
    const liveShape = deriveTrackShape(bundle);
    if (liveShape) {
      return res.json({ ...liveShape, source: 'openf1-live' });
    }

    const staticShape = await readStaticTrackShape();
    if (staticShape) {
      return res.json({ ...staticShape, source: 'fastf1-static-fallback' });
    }

    return res.status(404).json({ error: 'No location telemetry available to derive a track shape' });
  } catch (err) {
    return next(err);
  }
});

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
      maxVideoSeconds: Barcelona_video_chunks.at(-1).videoEndSeconds,
    });
  }

  const requestedBufferSeconds = req.query.bufferSeconds;
  const bufferSeconds = requestedBufferSeconds == null
    ? null
    : Number(requestedBufferSeconds);
  if (bufferSeconds != null && (!Number.isInteger(bufferSeconds)
    || bufferSeconds < 1 || bufferSeconds > MAX_BUFFER_SECONDS)) {
    return res.status(400).json({
      error: `bufferSeconds must be an integer between 1 and ${MAX_BUFFER_SECONDS}`,
    });
  }

  try {
    const { bundle, chunks } = await getBarcelonaOpenF1Data();
    if (bufferSeconds != null) {
      return res.json(createBarcelonaWatchLiveBuffer(videoSeconds, bufferSeconds, bundle, chunks));
    }

    return res.json(getBarcelonaCachedState(videoSeconds, bundle, chunks));
  } catch (err) {
    return next(err);
  }
});
