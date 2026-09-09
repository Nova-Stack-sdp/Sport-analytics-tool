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

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json();
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
export function getSession() {
  return request('/api/auth/me');
}

// ---------------------------------------------------------------------------
// Data endpoints
// ---------------------------------------------------------------------------

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

export function getDrivers({ limit, offset } = {}) {
  const params = new URLSearchParams();
  if (limit != null) params.set('limit', String(limit));
  if (offset != null) params.set('offset', String(offset));
  const query = params.toString();
  return request(`/api/drivers${query ? `?${query}` : ''}`);
}

export function getDriver(id) {
  return request(`/api/drivers/${id}`);
}

// Remote headshots/logos are routed through the backend's caching image proxy
// so the browser reuses one immutable, cached copy per asset.
export function getCachedImageUrl(source) {
  return `${API_BASE_URL}/api/images?source=${encodeURIComponent(source)}`;
}

// Fetches one replay state or a short playback buffer.
export function getWatchLiveState({ videoSeconds, bufferSeconds } = {}) {
  const params = new URLSearchParams({ videoSeconds: String(videoSeconds) });
  if (bufferSeconds != null) params.set('bufferSeconds', String(bufferSeconds));
  return request(`/api/watch-live/state?${params.toString()}`);
}
