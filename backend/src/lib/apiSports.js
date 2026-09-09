const API_SPORTS_BASE = 'https://v1.formula-1.api-sports.io';
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map();
const failureCache = new Map();
const inFlightRequests = new Map();

function errorMessage(errors) {
  if (!errors) return null;
  if (typeof errors === 'string') return errors || null;
  if (Array.isArray(errors)) return errors.filter(Boolean).join('; ') || null;
  if (typeof errors === 'object') return Object.values(errors).filter(Boolean).join('; ') || null;
  return String(errors);
}

async function fetchApiSports(path, key, fetchClient) {
  const response = await fetchClient(`${API_SPORTS_BASE}${path}`, {
    headers: { 'x-apisports-key': key },
  });
  if (!response.ok) throw new Error(`API-Sports ${path} -> ${response.status}`);

  const payload = await response.json();
  const providerError = errorMessage(payload.errors);
  if (providerError) throw new Error(`API-Sports ${path} -> ${providerError}`);

  return payload.response || [];
}

export async function apiSports(path) {
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) throw new Error('API_SPORTS_KEY is not configured');

  const fetchClient = globalThis.fetch;
  const now = Date.now();
  const storedResponse = responseCache.get(path);
  const cached = storedResponse?.apiKey === apiKey && storedResponse?.fetchClient === fetchClient
    ? storedResponse
    : null;
  if (cached && now - cached.storedAt < SUCCESS_TTL_MS) return cached.value;

  const storedFailure = failureCache.get(path);
  const failure = storedFailure?.apiKey === apiKey && storedFailure?.fetchClient === fetchClient
    ? storedFailure
    : null;
  if (failure && now < failure.retryAt) {
    if (cached) return cached.value;
    throw failure.error;
  }

  const inFlight = inFlightRequests.get(path);
  if (inFlight?.apiKey === apiKey && inFlight?.fetchClient === fetchClient) {
    return inFlight.promise;
  }

  const request = fetchApiSports(path, apiKey, fetchClient)
    .then((value) => {
      responseCache.set(path, { value, storedAt: Date.now(), apiKey, fetchClient });
      failureCache.delete(path);
      return value;
    })
    .catch((error) => {
      failureCache.set(path, {
        error,
        retryAt: Date.now() + FAILURE_TTL_MS,
        apiKey,
        fetchClient,
      });
      if (cached) return cached.value;
      throw error;
    })
    .finally(() => {
      if (inFlightRequests.get(path)?.promise === request) inFlightRequests.delete(path);
    });

  inFlightRequests.set(path, { promise: request, apiKey, fetchClient });
  return request;
}

export async function apiSportsOrEmpty(path) {
  try {
    return await apiSports(path);
  } catch (error) {
    return [];
  }
}

export function clearApiSportsCache() {
  responseCache.clear();
  failureCache.clear();
  inFlightRequests.clear();
}

export const apiSportsCacheDurations = {
  successMs: SUCCESS_TTL_MS,
  failureMs: FAILURE_TTL_MS,
};
