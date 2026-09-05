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

async function fetchOpenF1Json(upstreamUrl) {
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

// One raw bundle containing the OpenF1 records consumed by the existing sync
// adapter. Records are not normalized, derived, or written to the database.
openF1Router.get('/races/barcelona-2026/raw', async (req, res) => {
  const sessionKey = BARCELONA_2026_RACE_SESSION_KEY;
  try {
    const sessionResult = await fetchOpenF1Json(
      buildResourceUrl('sessions', { session_key: sessionKey })
    );
    if (sessionResult.status !== 200) {
      return res.status(sessionResult.status).json(sessionResult.payload);
    }

    const session = sessionResult.payload[0];
    if (!session) return res.status(404).json({ error: 'OpenF1 session not found' });
    if (session.session_type !== 'Race' && session.session_type !== 'Sprint') {
      return res.status(400).json({ error: 'The requested session is not a race' });
    }

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
        return res.status(result.status).json(result.payload);
      }
      bundle[bundleKey] = Array.isArray(result) ? result : result.payload;
    }

    // OpenF1 stores a race's starting grid under the qualifying session key.
    await paceBundleRequests();
    const meetingSessionsResult = await fetchRequiredResource('sessions', {
      meeting_key: session.meeting_key,
    });
    if (!Array.isArray(meetingSessionsResult) && meetingSessionsResult.status !== 200) {
      return res.status(meetingSessionsResult.status).json(meetingSessionsResult.payload);
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
        return res.status(gridResult.status).json(gridResult.payload);
      }
      bundle.starting_grid = Array.isArray(gridResult) ? gridResult : gridResult.payload;
    } else {
      bundle.starting_grid = [];
    }

    res.set('Cache-Control', 'no-store');
    return res.json(bundle);
  } catch (error) {
    return sendOpenF1Failure(res, error);
  }
});
