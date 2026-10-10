/**
 * An OpenF1 client built for speed inside OpenF1's free-tier limits.
 *
 * OpenF1 allows 3 requests a second. The old sync fetched its dozen
 * endpoints one after another with a pause after each (8.1 s for a race,
 * measured); this client runs them CONCURRENTLY through a sliding-window
 * limiter — never more than `ratePerSecond` requests started in any rolling
 * second — which brings the same download to about 4 s.
 *
 * Even at exactly the limit OpenF1 occasionally answers 429 (seen in the
 * measurement), so a 429 is retried with exponential backoff; a 404 is
 * OpenF1's "no results" and reads as an empty list. Every response's size is
 * counted, for progress reporting.
 */

const DEFAULT_BASE = 'https://api.openf1.org/v1';

export function createOpenF1Client({
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE,
  ratePerSecond = 3,
  maxRetries = 4,
  retryBaseMs = 600,
  timeoutMs = 20_000,
  now = () => Date.now(),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  const starts = []; // start times of the requests in the current window
  let gate = Promise.resolve();
  const stats = { requests: 0, retries: 0, bytes: 0 };

  // Wait for a slot in the sliding one-second window. Requests queue through
  // `gate` so slots are handed out in order.
  function acquire() {
    const turn = gate.then(async () => {
      for (;;) {
        const t = now();
        while (starts.length && t - starts[0] >= 1000) starts.shift();
        if (starts.length < ratePerSecond) {
          starts.push(t);
          return;
        }
        await sleep(1000 - (t - starts[0]) + 5);
      }
    });
    gate = turn.catch(() => {});
    return turn;
  }

  async function get(path, params = {}, attempt = 0) {
    await acquire();
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}/${path}${query ? `?${query}` : ''}`;
    stats.requests += 1;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 429 && attempt < maxRetries) {
      stats.retries += 1;
      await sleep(retryBaseMs * 2 ** attempt);
      return get(path, params, attempt + 1);
    }
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`OpenF1 request failed: ${url} -> ${res.status}`);
    const text = await res.text();
    stats.bytes += text.length;
    return JSON.parse(text);
  }

  return { get, stats };
}
