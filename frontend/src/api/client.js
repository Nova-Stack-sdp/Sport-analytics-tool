/**
 * Backend API client.
 *
 * Base URL comes from REACT_APP_API_URL, a build-time env var (CRA only
 * exposes vars prefixed REACT_APP_). Set this in Netlify's site settings ->
 * Environment variables, pointing at the Northflank service URL, e.g.
 * https://sport--backend-api--7kcwxz9xblx5.code.run
 *
 * Falls back to that same Northflank URL for local dev convenience — override
 * it locally via a .env.Local file if you're running the backend elsewhere
 * (e.g. http://localhost:8080).
 *
 * All requests include credentials: 'include' so the httpOnly __session
 * cookie set by POST /api/auth/session is sent automatically on every call.
 */
const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'https://sport--backend-api--7kcwxz9xblx5.code.run';

// Give up quickly so a hung backend can't leave a button stuck on "busy".
const DEFAULT_TIMEOUT_MS = 10000;

// The httpOnly __session cookie alone is NOT reliable in production: the
// frontend (netlify.app) and backend (code.run) are different sites, so the
// cookie is a third-party cookie that Firefox/Safari (and increasingly
// Chrome) block or partition. It also holds a raw Firebase ID token that
// expires after an hour and is only refreshed on an explicit sign-in. So
// every request also carries a fresh ID token as `Authorization: Bearer`,
// which requireAuth on the backend checks first.
//
// The token source is registered from the app entry point (see index.js)
// rather than imported here, so this module stays free of Firebase and
// easy to test.
let authTokenProvider = null;

export function setAuthTokenProvider(provider) {
  authTokenProvider = typeof provider === 'function' ? provider : null;
}

async function getAuthToken() {
  if (!authTokenProvider) return null;
  try {
    // Firebase's getIdToken() returns the cached token and transparently
    // refreshes it when it's close to expiry.
    return (await authTokenProvider()) || null;
  } catch {
    // Can't get a token (e.g. offline) — fall back to the cookie.
    return null;
  }
}

async function request(path, options = {}) {
  // raw: resolve with the Response itself (e.g. to read a file as a Blob)
  // instead of parsing it as JSON. Errors are reported the same way.
  const { timeoutMs = DEFAULT_TIMEOUT_MS, raw = false, ...fetchOptions } = options;
  // Start the clock first so a slow token refresh counts toward the timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    const headers = { ...(fetchOptions.headers || {}) };
    if (!headers.Authorization) {
      const token = await getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    // Timed out while waiting for the token — don't start the fetch at all.
    if (controller.signal.aborted) throw new DOMException('Timed out', 'AbortError');
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      ...(Object.keys(headers).length ? { headers } : {}),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    // Our own timeout is the only thing that aborts these requests, so the
    // browser's raw "signal is aborted without reason" would just mystify
    // whoever reads it in an error banner — say what actually happened.
    if (controller.signal.aborted) {
      const timeoutError = new Error('The server took too long to respond. Please try again.');
      timeoutError.timedOut = true;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const error = new Error(`Request to ${path} failed with status ${res.status}`);
    error.status = res.status;
    try {
      error.body = await res.json();
    } catch {
      // Response wasn't JSON — leave error.body undefined, error.status is
      // still meaningful on its own.
    }
    throw error;
  }
  return raw ? res : res.json();
}

// ---------------------------------------------------------------------------
// Auth session helpers
// ---------------------------------------------------------------------------

/**
 * Exchange a Firebase ID token for an httpOnly cookie on the backend.
 * Call this after any successful Firebase sign-in (email/password, Google,
 * GitHub) so subsequent API requests carry the cookie automatically.
 */
export function establishSession(idToken) {
  return request('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
}

/**
 * Clear the httpOnly session cookie on the backend.
 * Call this alongside Firebase signOut() for a full logout.
 */
export function clearSession() {
  return request('/api/auth/logout', { method: 'POST' });
}

/**
 * Check whether the backend cookie is still valid.
 * Returns the user object or throws if no valid session exists.
 */
export function getSession(idToken) {
  return request('/api/auth/me', {
    ...(idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : {}),
  });
}

/**
 * Permanently delete the signed-in account (the "Delete profile" button
 * under Profile). The backend removes every uid-keyed row from PostgreSQL,
 * the Firestore mirror document and the Firebase account itself, then
 * clears the session cookie — so a resolved promise means the account no
 * longer exists anywhere and the caller should drop local auth state.
 *
 * `idToken` is optional and sent explicitly when provided, same pattern as
 * getSession above: requireAuth checks the header first and falls back to
 * the cookie.
 */
export function deleteAccount(idToken) {
  return request('/api/auth/account', {
    method: 'DELETE',
    ...(idToken ? { headers: { Authorization: `Bearer ${idToken}` } } : {}),
  });
}

/**
 * Set the `developer` custom claim on the signed-in user's own Firebase
 * account. This is self-service (any signed-in user can toggle their own
 * flag) — see the backend route for the reasoning. The frontend still
 * needs to force a fresh ID token afterwards (see AuthContext's
 * refreshDeveloperMode) for the new claim to actually be visible locally.
 *
 * `idToken` is optional and, when provided, is sent as an explicit
 * `Authorization: Bearer` header (same pattern as uploadDriverImage
 * below) alongside the usual `credentials: 'include'` cookie. requireAuth
 * on the backend checks the header first and falls back to the cookie, so
 * this covers both transports — useful because the httpOnly cookie set at
 * sign-in doesn't always make it onto every request in local dev (e.g. a
 * Firebase session restored from a previous visit, without a fresh trip
 * through the sign-in page that re-establishes the cookie).
 */
export function setDeveloperModeOnServer(enabled, idToken) {
  return request('/api/auth/developer-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ enabled }),
  });
}

// ---------------------------------------------------------------------------
// Email verification (6-digit code)
//
// Firebase happily creates an email/password account for any syntactically
// valid address without ever mailing it, so the backend proves the address
// with a code sent to it (see backend/src/routes/emailVerification.js) and
// gates the protected routes behind that proof.
// ---------------------------------------------------------------------------

/**
 * Ask the backend to mail a fresh 6-digit code to the signed-in account's
 * own address. Resolves with { status, email, expiresInMinutes,
 * resendAfterSeconds } — and, while the console mail provider is active
 * outside production, a `devCode`. Rejects with a body whose `code` explains
 * any refusal: NO_EMAIL, RESEND_COOLDOWN (too soon — `retryAfterSeconds`
 * says how long), DAILY_LIMIT, EMAIL_SEND_FAILED.
 *
 * `idToken` is optional and sent explicitly for the same reason as
 * setDeveloperModeOnServer above.
 */
export function requestEmailVerificationCode(idToken) {
  return request('/api/auth/verify-email/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
  });
}

/**
 * Submit a code for checking. On success the backend flags the Firebase
 * account as verified — which only becomes visible locally in a token minted
 * afterwards, so the caller has to force a fresh one (see AuthContext's
 * confirmEmailCode).
 */
export function confirmEmailVerificationCode(code, idToken) {
  return request('/api/auth/verify-email/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ code }),
  });
}

// ---------------------------------------------------------------------------
// Account creation (the account is born only once the code is confirmed)
//
// The Firebase account deliberately does NOT exist when the sign-up form is
// submitted: the backend notes a pending sign-up, mails a code to the
// address, and creates the account (Admin SDK, already verified) only when
// the code is confirmed — see backend/src/routes/signup.js. The caller then
// signs in with the credentials it is still holding.
// ---------------------------------------------------------------------------

/**
 * Note a pending sign-up for an address and have a code mailed to it.
 * Resolves like requestEmailVerificationCode: { status, email (masked),
 * expiresInMinutes, resendAfterSeconds } plus `devCode` while the console
 * provider is active outside production. Rejects with a body whose `code`
 * explains any refusal: RESEND_COOLDOWN (too soon — `retryAfterSeconds`
 * says how long), DAILY_LIMIT, EMAIL_SEND_FAILED, INVALID_EMAIL.
 *
 * The response is identical whether or not the address already has an
 * account — that only ever surfaces at confirm, where the caller has
 * proved they can read the address's inbox.
 */
export function requestSignupCode(email) {
  return request('/api/auth/signup/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

/**
 * Confirm the code and have the account created along with it. The password
 * travels with this one call (it is handed straight to Admin createUser and
 * never stored); a resolved promise means the account now exists, verified.
 * Rejects with CODE_MISMATCH, CODE_EXPIRED, TOO_MANY_ATTEMPTS,
 * NO_PENDING_SIGNUP, EMAIL_EXISTS, WEAK_PASSWORD or CREATE_FAILED in
 * error.body.code.
 */
export function confirmSignup({ email, code, password, firstName, lastName }) {
  return request('/api/auth/signup/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password, firstName, lastName }),
  });
}

// ---------------------------------------------------------------------------
// Account notifications
// ---------------------------------------------------------------------------

export function createNotification(notificationData) {
  return request('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notificationData),
  });
}

/**
 * The signed-in user's own notifications, newest first (requireAuth on the
 * backend — no session, no rows). The response is the array itself.
 */
export function getNotifications() {
  return request('/api/notifications');
}

/**
 * Mark one notification read. Callers own their optimistic state — the list
 * may be on screen when this happens.
 */
export function markNotificationRead(id) {
  return request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

// ---------------------------------------------------------------------------
// Data endpoints
// ---------------------------------------------------------------------------

export async function downloadDatasetExport({ dataset, season, format }) {
  const query = new URLSearchParams({ format });
  if (season) query.set('season', season);
  const response = await request(`/api/v1/exports/${encodeURIComponent(dataset)}?${query}`, { raw: true });
  return response.blob();
}

export function getOverview() {
  return request('/api/overview');
}

export function getStatistics({ view, season, sessionId } = {}) {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (season != null) params.set('season', season);
  if (sessionId) params.set('sessionId', sessionId);
  const query = params.toString();
  return request(`/api/statistics${query ? `?${query}` : ''}`);
}

export function getFixtures() {
  return request('/api/fixtures');
}

// Adding a race RaceSync doesn't have yet (see backend routes/raceRequests.js):
// one season's OpenF1 races, each marked with where it stands here…
export function getAvailableRaces(year) {
  return request(`/api/race-requests/available?year=${encodeURIComponent(year)}`, {
    timeoutMs: 20000,
  });
}

// …a sync request for one of them (signed-in users only)…
export function requestRaceSync(sessionKey) {
  return request('/api/race-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKey }),
  });
}

// …and where that request stands: queued, syncing, ready or failed.
export function getRaceSyncStatus(sessionKey) {
  return request(`/api/race-requests/${encodeURIComponent(sessionKey)}`);
}

export function getFixtureEvents(sessionId) {
  return request(`/api/fixtures/${sessionId}/events`);
}

export function getTimeTravelContext(sessionId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  const query = params.toString();
  return request(`/api/timetravel/context${query ? `?${query}` : ''}`);
}

export function getTimeTravelChangelog(entryId) {
  return request(`/api/timetravel/changelog?entryId=${entryId}`);
}

export function getTimeTravelAsOf({ sessionId, entryId, date }) {
  const params = new URLSearchParams({ sessionId, entryId, date });
  return request(`/api/timetravel/asof?${params.toString()}`);
}

export function getPopularVideos() {
  return request('/api/videos/popular');
}

export function getLiveVideo() {
  return request('/api/watch-live');
}

export function getTeams({ limit, offset } = {}) {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (offset != null) params.set('offset', String(offset));
  const query = params.toString();
  return request(`/api/teams${query ? `?${query}` : ''}`);
}

export function getTeam(id) {
  return request(`/api/teams/${id}`);
}

// The drivers endpoints enrich every row with external API data (API-Sports
// and OpenF1) on top of a deep database include, so they routinely take
// several seconds — close enough to the default budget that an ordinary
// latency spike would abort them. They get extra headroom instead.
const DRIVERS_TIMEOUT_MS = 25000;

export function getDrivers({ limit, offset } = {}) {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (offset != null) params.set('offset', String(offset));
  const query = params.toString();
  return request(`/api/drivers${query ? `?${query}` : ''}`, { timeoutMs: DRIVERS_TIMEOUT_MS });
}

export function getDriver(id) {
  return request(`/api/drivers/${id}`, { timeoutMs: DRIVERS_TIMEOUT_MS });
}

// Remote headshots/logos are routed through the backend's caching image proxy
// so the browser reuses one immutable, cached copy per asset.
export function getCachedImageUrl(source) {
  return `${API_BASE_URL}/api/images?source=${encodeURIComponent(source)}`;
}

// A driver's headshot once it's been persisted server-side (Firestore) —
// same URL forever for a given driver, no source param needed.
// `version` is the uploaded photo's last-updated time (from the drivers API).
// It's part of the URL so a replaced photo is never served from a stale
// browser cache.
export function getDriverImageUrl(driverId, version) {
  const url = `${API_BASE_URL}/api/drivers/${driverId}/image`;
  return version ? `${url}?v=${version}` : url;
}

// Uploads (or replaces) a driver's photo; it's stored in the backend's
// database next to the driver record. The file is sent as the raw request
// body, and the caller's Firebase ID token proves they're signed in.
export async function uploadDriverImage(driverId, file, idToken) {
  const res = await fetch(`${API_BASE_URL}/api/drivers/${driverId}/image`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error page — fall through to the generic message below.
  }
  if (!res.ok) {
    const error = new Error(body?.error || `Upload failed with status ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

// Fetches one replay state or a short playback buffer.
export function getWatchLiveState({ videoSeconds, bufferSeconds } = {}) {
  const params = new URLSearchParams({ videoSeconds: String(videoSeconds) });
  if (bufferSeconds != null) params.set('bufferSeconds', String(bufferSeconds));
  return request(`/api/watch-live/state?${params.toString()}`);
}

// Real track outline derived from one driver's actual location telemetry —
// see deriveTrackShape() in the backend for how this is picked.
export function getTrackShape() {
  return request('/api/watch-live/track-shape');
}

// ---------------------------------------------------------------------------
// Race Replay — decoupled from Watch Live, works for any synced fixture
// (see /api/fixtures' `replayReady` flag for which ones qualify), not just
// the one hardcoded Barcelona session Watch Live is built around.
// ---------------------------------------------------------------------------

// Leaderboard reconstructed from the Event log as of the end of `lap`.
export function getRaceReplayState(sessionId, { lap } = {}) {
  const params = new URLSearchParams({ lap: String(lap) });
  return request(`/api/race-replay/${sessionId}/state?${params.toString()}`);
}

// Real track outline for this session's circuit — live OpenF1 telemetry
// when available, else a static FastF1-generated shape for the circuit,
// else a 404 (the caller falls back to the illustrative track, same as
// Watch Live already does for getTrackShape above).
export function getRaceReplayTrackShape(sessionId) {
  return request(`/api/race-replay/${sessionId}/track-shape`);
}

// The whole race as one table — every lap's leaderboard in a single response,
// one array per measure per driver — which is what RaceSync's panels under the
// map are drawn from. Read-only, and built from the same reconstruction the
// state endpoint above serves lap by lap.
export function getRaceReplayLapSeries(sessionId) {
  return request(`/api/race-replay/${sessionId}/lap-series`);
}

// ---------------------------------------------------------------------------
// Follows (stored server-side per signed-in user)
// ---------------------------------------------------------------------------

const jsonBody = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

export function getFollows() {
  return request('/api/follows');
}

export function followDriverRequest(driverId, snapshot) {
  return request(`/api/follows/drivers/${encodeURIComponent(driverId)}`, { method: 'PUT', ...jsonBody(snapshot) });
}

export function unfollowDriverRequest(driverId) {
  return request(`/api/follows/drivers/${encodeURIComponent(driverId)}`, { method: 'DELETE' });
}

export function followTeamRequest(teamId, snapshot) {
  return request(`/api/follows/teams/${encodeURIComponent(teamId)}`, { method: 'PUT', ...jsonBody(snapshot) });
}

export function unfollowTeamRequest(teamId) {
  return request(`/api/follows/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
}
// ---------------------------------------------------------------------------
// Submissions (developer/admin)
// ---------------------------------------------------------------------------

export function submitData(body) {
  return request('/api/submissions', { method: 'POST', ...jsonBody(body) });
}

export function listSubmissions(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/submissions${query}`);
}

export function reviewSubmission(id, status) {
  return request(`/api/submissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    ...jsonBody({ status }),
  });
}

// ---------------------------------------------------------------------------
// Dataset submissions — admin view (backend/src/routes/adminDatasets.js)
//
// view is one of: pending, accepted, rejected, test, deleted. Accepting or
// rejecting race data stays on reviewSubmission() above.
// ---------------------------------------------------------------------------

export function listAdminDatasets(view = 'pending') {
  return request(`/api/admin/datasets?view=${encodeURIComponent(view)}`);
}

export function getAdminDataset(id) {
  return request(`/api/admin/datasets/${encodeURIComponent(id)}`);
}

// Resolves with { blob, kind } where kind is 'original' (the exact upload)
// or 'rebuilt' (an older dataset reconstructed from what was stored).
// Large files get a longer timeout than ordinary API calls.
export async function downloadAdminDataset(id) {
  const res = await request(`/api/admin/datasets/${encodeURIComponent(id)}/upload`, {
    raw: true,
    timeoutMs: 60000,
  });
  const blob = await res.blob();
  return { blob, kind: res.headers.get('X-Dataset-Upload') === 'rebuilt' ? 'rebuilt' : 'original' };
}

export function deleteAdminDataset(id) {
  return request(`/api/admin/datasets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function restoreAdminDataset(id) {
  return request(`/api/admin/datasets/${encodeURIComponent(id)}/restore`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Code submissions (developer submits a script, admin reviews it)
//
// Backed by the code_submission table (backend/src/routes/codeSubmissions.js).
// New submissions are stored as 'pending'; an admin moves them to 'approved'
// or 'rejected'. The body shape is pinned by
// features/code-submission/submissionFormat.js.
// ---------------------------------------------------------------------------

export function submitCodeSubmission(body) {
  return request('/api/code-submissions', { method: 'POST', ...jsonBody(body) });
}

export function listCodeSubmissions(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/code-submissions${query}`);
}

export function getCodeSubmission(id) {
  return request(`/api/code-submissions/${encodeURIComponent(id)}`);
}

export function reviewCodeSubmission(id, status) {
  return request(`/api/code-submissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    ...jsonBody({ status }),
  });
}

// ---------------------------------------------------------------------------
// F1 news feed
// ---------------------------------------------------------------------------

export function getF1News({ driverId, teamId, limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  
  if (driverId) params.set('driverId', driverId);
  if (teamId) params.set('teamId', teamId);
  
  return request(`/api/news?${params.toString()}`);
}

export function refreshF1News({ limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return request(`/api/news/refresh?${params.toString()}`, { method: 'POST' });
}

// EventSource can't go through request(), so it needs the absolute URL.
export function getF1NewsStreamUrl() {
  return `${API_BASE_URL}/api/news/stream`;
}

// ---------------------------------------------------------------------------
// Telemetry TV
// ---------------------------------------------------------------------------

export function getTelemetryTVRaces() {
  return request('/api/telemetry-tv/races');
}

export function getTelemetryTVRace(slug) {
  return request(`/api/telemetry-tv/races/${encodeURIComponent(slug)}`);
}

// A race video a user wants added to Telemetry TV (signed in). Every request
// is checked for copyright by the developers before it goes live.
export function submitVideoRequest({ raceName, videoUrl, hostedDescription, notes }) {
  return request('/api/video-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raceName, videoUrl, hostedDescription, notes }),
  });
}

// The signed-in user's own video requests, newest first.
export function getMyVideoRequests() {
  return request('/api/video-requests/mine');
}

// Admin: the review queue (optionally one status), and a review decision.
export function getVideoRequests(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/video-requests${query}`);
}

export function reviewVideoRequest(id, { status, reviewNote }) {
  return request(`/api/video-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reviewNote }),
  });
}

// Race-day weather for one broadcast: measured conditions over the race
// window (Open-Meteo archive), or { weather: null } when none can be read.
export function getTelemetryTVWeather(slug) {
  return request(`/api/telemetry-tv/races/${encodeURIComponent(slug)}/weather`, {
    timeoutMs: 15000,
  });
}

// ---------------------------------------------------------------------------
// Approved code — public API (backend/src/api/v1/code.js)
//
// No sign-in needed. Each item is
//   { slug, name, description, language, code, tags, approvedAt, endpoint }
// where endpoint is the path to call it, e.g. /api/v1/code/average-pit-loss.
// ---------------------------------------------------------------------------

export function listPublicCode({ language, tag } = {}) {
  const params = new URLSearchParams();
  if (language) params.set('language', language);
  if (tag) params.set('tag', tag);
  const query = params.toString();
  return request(`/api/v1/code${query ? `?${query}` : ''}`);
}

export function getPublicCode(slug) {
  return request(`/api/v1/code/${encodeURIComponent(slug)}`);
}

// Full public URL of a script, for showing "how to call it".
export function publicCodeUrl(endpoint) {
  return `${API_BASE_URL}${endpoint}`;
}

// ---------------------------------------------------------------------------
// Approved code — admin management (backend/src/routes/adminVerifiedCode.js)
// ---------------------------------------------------------------------------

export function listPublishedCode() {
  return request('/api/admin/verified-code');
}

// Permanent: takes the script off the public API. Confirm with the admin first.
export function removePublishedCode(id) {
  return request(`/api/admin/verified-code/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
