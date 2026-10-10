import { Router } from 'express';

export const openF1Router = Router();

const OPENF1_API_BASE = 'https://api.openf1.org/v1';
const BARCELONA_2026_RACE_SESSION_KEY = 11307;

function buildResourceUrl(resource, params = {}) {
  const upstreamUrl = new URL(`${OPENF1_API_BASE}/${resource}`);
  for (const [name, value] of Object.entries(params)) {
    if (value != null) upstreamUrl.searchParams.append(name, String(value));
  }
  return upstreamUrl;
}

async function fetchOpenF1JsonOnce(upstreamUrl) {
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  const responseText = await upstreamResponse.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    const error = new Error('OpenF1 returned an invalid JSON response');
    error.code = 'INVALID_JSON';
    throw error;
  }

  return { status: upstreamResponse.status, payload };
}

// Retries on 429 with backoff. Sized around the stricter 30/minute limit
// (see paceBundleRequests) rather than the 3/sec one — a short 1-3s backoff
// doesn't help if the actual constraint is a per-minute quota.
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchOpenF1Json(upstreamUrl, attempt = 0) {
  const result = await fetchOpenF1JsonOnce(upstreamUrl);
  if (result.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
    return result;
  }
  const backoffMs = 15000 * (attempt + 1);
  await new Promise((resolve) => setTimeout(resolve, backoffMs));
  return fetchOpenF1Json(upstreamUrl, attempt + 1);
}

function sendOpenF1Failure(res, error) {
  if (error?.code === 'INVALID_JSON') {
    return res.status(502).json({ error: error.message });
  }

  const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  return res.status(502).json({
    error: timedOut ? 'OpenF1 request timed out' : 'Unable to reach OpenF1',
  });
}

// OpenF1 filters a time window with comparison operators on the record's
// own `date` field: /location?session_key=…&date>…&date<… . There is no
// date_start/date_end filter on these resources — sending those makes
// OpenF1 answer with an error instead of data, which is why every chunk
// used to come back empty. URLSearchParams encodes the keys as date%3E /
// date%3C, which OpenF1 accepts.
function buildWindowUrl(resource, sessionKey, windowStartMs, windowEndMs) {
  const url = buildResourceUrl(resource, { session_key: sessionKey });
  url.searchParams.append('date>', new Date(windowStartMs).toISOString());
  url.searchParams.append('date<', new Date(windowEndMs).toISOString());
  return url;
}

async function fetchRequiredResource(resource, params) {
  const result = await fetchOpenF1Json(buildResourceUrl(resource, params));
  if (result.status === 404) return [];
  return result;
}

async function paceBundleRequests() {
  // OpenF1's documented limit is 3 requests/second, but live testing showed
  // a stricter 30-requests/minute cap actually applies too. A full fetch is
  // ~32 requests (session + 9 metadata resources + ~9 car_data chunks + ~9
  // location chunks + grid lookups) — at the old 350ms pacing (built only
  // around 3/sec), all of them land within ~11 seconds, comfortably inside
  // one 60-second window and blowing straight through 30/minute even with
  // zero concurrency. 2100ms keeps us under both limits with margin.
  // Tests use mocked responses and do not need the delay.
  if (process.env.NODE_ENV !== 'test') {
    await new Promise((resolve) => setTimeout(resolve, 2100));
  }
}

// OpenF1 rejects bulk car_data requests for a full race with a 422
// ("asking for too much data at once"). This helper splits the request
// into overlapping time windows so each individual response stays within
// the upstream limit.
const CAR_DATA_CHUNK_MINUTES = 10;

async function fetchCarDataChunked(sessionKey, sessionStart, sessionEnd) {
  const startMs = Date.parse(sessionStart);
  const endMs = Date.parse(sessionEnd);

  // Live sessions (or stripped test payloads) can lack a usable time window —
  // ask for the whole session in one request and let OpenF1's own size limits
  // apply rather than silently returning no car data at all.
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    await paceBundleRequests();
    const result = await fetchOpenF1Json(
      buildResourceUrl('car_data', { session_key: sessionKey })
    );
    if (result.status === 404) return [];
    if (result.status !== 200) {
      throw new OpenF1PassthroughError(result.status, result.payload);
    }
    return result.payload;
  }

  const chunkMs = CAR_DATA_CHUNK_MINUTES * 60 * 1000;
  const allRecords = [];

  for (let windowStart = startMs; windowStart < endMs; windowStart += chunkMs) {
    // Overlap by 1 second so records at a boundary aren't missed.
    const windowEnd = Math.min(windowStart + chunkMs + 1000, endMs + 1000);
    await paceBundleRequests();
    const url = buildWindowUrl('car_data', sessionKey, windowStart, windowEnd);
    const result = await fetchOpenF1Json(url);
    if (result.status === 404) continue;
    if (result.status !== 200) {
      throw new OpenF1PassthroughError(result.status, result.payload);
    }
    allRecords.push(...result.payload);
  }

  return allRecords;
}

// Real x,y,z car position telemetry — the same kind of data FastF1-based
// tools (e.g. F1 Race Replay) use to derive an accurate track shape and
// real car positions, rather than an estimated/illustrative layout. Same
// 422-avoidance chunking as car_data, since /location is similarly
// high-frequency (~3.7Hz per driver).
const LOCATION_CHUNK_MINUTES = 10;

async function fetchLocationDataChunked(sessionKey, sessionStart, sessionEnd) {
  const startMs = Date.parse(sessionStart);
  const endMs = Date.parse(sessionEnd);
  const chunkMs = LOCATION_CHUNK_MINUTES * 60 * 1000;
  const allRecords = [];

  for (let windowStart = startMs; windowStart < endMs; windowStart += chunkMs) {
    const windowEnd = Math.min(windowStart + chunkMs + 1000, endMs + 1000);
    await paceBundleRequests();
    const url = buildWindowUrl('location', sessionKey, windowStart, windowEnd);
    const result = await fetchOpenF1Json(url);
    if (result.status === 404) continue;
    if (result.status !== 200) {
      throw new OpenF1PassthroughError(result.status, result.payload);
    }
    allRecords.push(...result.payload);
  }

  return allRecords;
}

// Thrown when an upstream OpenF1 call comes back with a non-200 status that
// should be passed straight through to the HTTP response as-is.
class OpenF1PassthroughError extends Error {
  constructor(status, payload) {
    super('OpenF1 upstream returned a non-200 response');
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Builds the raw OpenF1 bundle (session, laps, pit, stints, position,
 * car_data, race_control, weather, session_result, starting_grid) for the
 * Barcelona 2026 race. Records are not normalized, derived, or written to the
 * database — exported so other routes (e.g. telemetryTV.js) can reuse it
 * in-process instead of calling this endpoint over HTTP.
 */
export async function fetchBarcelonaRaceRaw() {
  const sessionKey = BARCELONA_2026_RACE_SESSION_KEY;
  const sessionResult = await fetchOpenF1Json(
    buildResourceUrl('sessions', { session_key: sessionKey })
  );
  if (sessionResult.status !== 200) {
    throw new OpenF1PassthroughError(sessionResult.status, sessionResult.payload);
  }

  const session = sessionResult.payload[0];
  if (!session) throw new OpenF1PassthroughError(404, { error: 'OpenF1 session not found' });
  if (session.session_type !== 'Race' && session.session_type !== 'Sprint') {
    throw new OpenF1PassthroughError(400, { error: 'The requested session is not a race' });
  }

  // Resources fetched in a single request — car_data is handled separately
  // below because OpenF1 rejects a full-race car_data query as too large.
  const resources = [
    ['meeting', 'meetings', { meeting_key: session.meeting_key }],
    ['drivers', 'drivers', { session_key: sessionKey }],
    ['laps', 'laps', { session_key: sessionKey }],
    ['pit', 'pit', { session_key: sessionKey }],
    ['stints', 'stints', { session_key: sessionKey }],
    ['position', 'position', { session_key: sessionKey }],
    ['race_control', 'race_control', { session_key: sessionKey }],
    ['weather', 'weather', { session_key: sessionKey }],
    ['session_result', 'session_result', { session_key: sessionKey }],
  ];

  const bundle = {
    session_key: sessionKey,
    session: sessionResult.payload,
  };

  for (const [bundleKey, resource, params] of resources) {
    await paceBundleRequests();
    const result = await fetchRequiredResource(resource, params);
    if (!Array.isArray(result) && result.status !== 200) {
      throw new OpenF1PassthroughError(result.status, result.payload);
    }
    bundle[bundleKey] = Array.isArray(result) ? result : result.payload;
  }

  // Fetch car_data in time-windowed chunks to avoid the 422 "too much data"
  // rejection from OpenF1's free tier.
  await paceBundleRequests();
  bundle.car_data = await fetchCarDataChunked(
    sessionKey,
    session.date_start,
    session.date_end
  );

  // Real x,y,z position telemetry — needed to derive an accurate track
  // shape and real car positions (see deriveTrackShape in telemetryTV.js).
  // NOTE: this roughly doubles the cold-fetch time and cached payload size
  // versus car_data alone, since /location is comparably high-frequency.
  // Acceptable because the persisted cache (ExternalApiCache) means this
  // cost is paid once, not on every server restart.
  await paceBundleRequests();
  const locationData = await fetchLocationDataChunked(
    sessionKey,
    session.date_start,
    session.date_end
  );
  if (locationData.length > 0) {
    bundle.location = locationData;
  }

  // OpenF1 stores a race's starting grid under the qualifying session key.
  await paceBundleRequests();
  const meetingSessionsResult = await fetchRequiredResource('sessions', {
    meeting_key: session.meeting_key,
  });
  if (!Array.isArray(meetingSessionsResult) && meetingSessionsResult.status !== 200) {
    throw new OpenF1PassthroughError(meetingSessionsResult.status, meetingSessionsResult.payload);
  }
  const meetingSessions = Array.isArray(meetingSessionsResult)
    ? meetingSessionsResult
    : meetingSessionsResult.payload;
  const qualifyingNames = session.session_type === 'Sprint'
    ? ['Sprint Qualifying', 'Sprint Shootout']
    : ['Qualifying'];
  const qualifyingSession = meetingSessions.find((item) =>
    qualifyingNames.includes(item.session_name)
  );

  if (qualifyingSession) {
    await paceBundleRequests();
    const gridResult = await fetchRequiredResource('starting_grid', {
      session_key: qualifyingSession.session_key,
    });
    if (!Array.isArray(gridResult) && gridResult.status !== 200) {
      throw new OpenF1PassthroughError(gridResult.status, gridResult.payload);
    }
    bundle.starting_grid = Array.isArray(gridResult) ? gridResult : gridResult.payload;
  } else {
    bundle.starting_grid = [];
  }

  return bundle;
}

/**
 * Real x,y location telemetry + laps for an ARBITRARY session, keyed by its
 * own OpenF1 session_key — the generalized version of the Barcelona-only
 * telemetry fetch above, used by Race Replay (src/routes/raceReplay.js) to
 * derive a real track outline for whichever session is being replayed,
 * instead of an illustrative one. Deliberately minimal: just enough
 * (session window + laps + location) to run deriveTrackShapeFromTelemetry
 * in src/lib/trackShape.js — no car_data, pit, stints, etc., since track
 * shape is all this is for.
 *
 * Returns null if OpenF1 has no session for this key, or no location data
 * for it (common for older/less-recent sessions — OpenF1's retention for
 * high-frequency resources like /location is limited) — never throws for
 * that case, since "no live telemetry" is an expected, handled outcome
 * (the caller falls back to a static per-circuit shape, then to the
 * illustrative track), not a failure.
 */
export { buildWindowUrl };

export async function fetchSessionTrackTelemetryRaw(sessionKey) {
  const sessionResult = await fetchOpenF1Json(
    buildResourceUrl('sessions', { session_key: sessionKey })
  );
  if (sessionResult.status !== 200) return null;
  const session = sessionResult.payload[0];
  if (!session) return null;

  await paceBundleRequests();
  const lapsResult = await fetchRequiredResource('laps', { session_key: sessionKey });
  const laps = Array.isArray(lapsResult) ? lapsResult : lapsResult.payload;

  // A track outline needs one clean lap of one car, so only that lap's
  // location samples are fetched: a few hundred records instead of every
  // car for the whole race (~50,000 per 10 minutes). The lap's own start
  // times are used rather than the session's date_start/date_end, which are
  // its *scheduled* times — the 2026 Bahrain GP was scheduled 07:00–09:00
  // UTC but its laps ran 08:33–10:20.
  const windows = representativeLapWindows(laps);
  if (windows.length === 0) {
    // No lap timing at all: fall back to the scheduled window.
    await paceBundleRequests();
    const location = await fetchLocationDataChunked(sessionKey, session.date_start, session.date_end);
    return location.length === 0 ? null : { laps, location };
  }

  for (const window of windows) {
    await paceBundleRequests();
    const url = buildWindowUrl('location', sessionKey, window.start, window.end);
    url.searchParams.append('driver_number', String(window.driverNumber));
    const result = await fetchOpenF1Json(url);
    if (result.status === 404) continue;
    if (result.status !== 200) {
      throw new OpenF1PassthroughError(result.status, result.payload);
    }
    const onTrack = result.payload.filter(
      (r) => Number.isFinite(r.x) && Number.isFinite(r.y) && r.x !== 0 && r.y !== 0
    );
    if (onTrack.length >= 10) return { laps, location: result.payload };
  }
  return null;
}

/**
 * Laps to try for the outline, best first: the car with the most timed
 * laps, starting a third of the way into the race (clear of first-lap
 * incidents), then later laps, then earlier ones. Each window runs from
 * one lap's start to the next lap's start. At most `limit` are returned.
 */
export function representativeLapWindows(laps, limit = 6) {
  const timed = (Array.isArray(laps) ? laps : []).filter(
    (l) => l.lap_number && Number.isFinite(Date.parse(l.date_start))
  );
  const byDriver = new Map();
  for (const lap of timed) {
    if (!byDriver.has(lap.driver_number)) byDriver.set(lap.driver_number, []);
    byDriver.get(lap.driver_number).push(lap);
  }
  const best = [...byDriver.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  if (!best || best[1].length < 2) return [];
  const [driverNumber, driverLaps] = best;
  driverLaps.sort((a, b) => a.lap_number - b.lap_number);

  const first = Math.floor(driverLaps.length / 3);
  const order = [];
  for (let i = first; i < driverLaps.length - 1; i += 1) order.push(i);
  for (let i = first - 1; i >= 0; i -= 1) order.push(i);

  return order.slice(0, limit).map((i) => ({
    driverNumber,
    lapNumber: driverLaps[i].lap_number,
    start: Date.parse(driverLaps[i].date_start),
    end: Date.parse(driverLaps[i + 1].date_start),
  })).filter((w) => w.end > w.start);
}

// One raw bundle containing the OpenF1 records consumed by the existing sync
// adapter. Records are not normalized, derived, or written to the database.
openF1Router.get('/races/barcelona-2026/raw', async (req, res) => {
  try {
    const bundle = await fetchBarcelonaRaceRaw();
    res.set('Cache-Control', 'no-store');
    return res.json(bundle);
  } catch (error) {
    if (error instanceof OpenF1PassthroughError) {
      return res.status(error.status).json(error.payload);
    }
    return sendOpenF1Failure(res, error);
  }
});