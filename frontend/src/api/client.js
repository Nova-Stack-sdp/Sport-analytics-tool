/**
 * Backend API client.
 *
 * Base URL comes from REACT_APP_API_URL, a build-time env var (CRA only
 * exposes vars prefixed REACT_APP_). Set this in Netlify's site settings ->
 * Environment variables, pointing at the Northflank service URL, e.g.
 * https://sport--backend-api--7kcwxz9xblx5.code.run
 *
 * Falls back to that same Northflank URL for local dev convenience — override
 * it locally via a .env.local file if you're running the backend elsewhere
 * (e.g. http://localhost:8080).
 */
const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'https://sport--backend-api--7kcwxz9xblx5.code.run';

async function request(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json();
}

export function getOverview() {
  return request('/api/overview');
}