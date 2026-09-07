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

// Retries on 429 with backoff. Our own pacing (paceBundleRequests) is
// already close to OpenF1's 3-req/sec ceiling by design, so occasional
// jitter tipping over it is expected, not exceptional — this absorbs that
// without surfacing a hard failure to the whole fetch chain over one
// transient rate-limit hit.
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchOpenF1Json(upstreamUrl, attempt = 0) {
  const result = await fetchOpenF1JsonOnce(upstreamUrl);
  if (result.status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
    return result;
  }
  const backoffMs = 1000 * (attempt + 1);
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

async function fetchRequiredResource(resource, params) {
  const result = await fetchOpenF1Json(buildResourceUrl(resource, params));
  if (result.status === 404) return [];
  return result;
}

async function paceBundleRequests() {
  // The public OpenF1 tier allows three requests per second. Tests use mocked
  // responses and do not need the delay.
  if (process.env.NODE_ENV !== 'test') {
    await new Promise((resolve) => setTimeout(resolve, 350));
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
  const chunkMs = CAR_DATA_CHUNK_MINUTES * 60 * 1000;
  const allRecords = [];

  for (let windowStart = startMs; windowStart < endMs; windowStart += chunkMs) {
    // Overlap by 1 second so records at a boundary aren't missed.
    const windowEnd = Math.min(windowStart + chunkMs + 1000, endMs + 1000);
    await paceBundleRequests();
    const url = buildResourceUrl('car_data', {
      session_key: sessionKey,
      date_start: new Date(windowStart).toISOString(),
      date_end: new Date(windowEnd).toISOString(),
    });
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
    const url = buildResourceUrl('location', {
      session_key: sessionKey,
      date_start: new Date(windowStart).toISOString(),
      date_end: new Date(windowEnd).toISOString(),
    });
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
 * database — exported so other routes (e.g. watchLive.js) can reuse it
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
  // shape and real car positions (see deriveTrackShape in watchLive.js).
  // NOTE: this roughly doubles the cold-fetch time and cached payload size
  // versus car_data alone, since /location is comparably high-frequency.
  // Acceptable because the persisted cache (ExternalApiCache) means this
  // cost is paid once, not on every server restart.
  await paceBundleRequests();
  bundle.location = await fetchLocationDataChunked(
    sessionKey,
    session.date_start,
    session.date_end
  );

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