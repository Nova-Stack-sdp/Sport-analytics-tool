/**
 * load-test — measures API response times under concurrent load and checks
 * them against the stated target (docs/PERFORMANCE.md).
 *
 * No dependencies: Node's built-in fetch. It discovers real ids from the API
 * itself (a race fixture, its driver, a season), then fires a mix of site
 * and public-API reads with N clients in parallel and reports p50 / p95 /
 * max per endpoint.
 *
 * Usage (from backend/, with the API running):
 *   node scripts/load-test.js                                  # http://localhost:8080, 10 clients
 *   node scripts/load-test.js --base http://localhost:8080 --concurrency 20 --requests 40
 *   node scripts/load-test.js --report ../docs/performance/load-test.md
 *
 * Start the API with rate limits and caching off, or you measure the 429s
 * and the cache instead of the database:
 *   RATE_LIMIT_PER_MINUTE=0 RATE_LIMIT_V1_PER_MINUTE=0 RATE_LIMIT_EXPORTS_PER_MINUTE=0 \
 *   CACHE_TTL_SECONDS=0 npm start
 *
 * Exit code 0 when overall p95 and every endpoint's p95 meet the target and
 * nothing errored; 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { base: 'http://localhost:8080', concurrency: 10, requests: 30, targetP95: 500, warmup: 1, report: null };

export function parseArgs(argv) {
  const args = { ...DEFAULTS };
  const numeric = { '--concurrency': 'concurrency', '--requests': 'requests', '--target-p95': 'targetP95', '--warmup': 'warmup' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--base') args.base = argv[++i].replace(/\/$/, '');
    else if (flag === '--report') args.report = argv[++i];
    else if (numeric[flag]) args[numeric[flag]] = Number(argv[++i]);
    else throw new Error(`Unknown argument ${flag}`);
  }
  return args;
}

/** Nearest-rank percentile of an array of numbers. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function summarize(name, samples) {
  const ok = samples.filter((s) => s.ok);
  const times = samples.map((s) => s.ms);
  return {
    name,
    requests: samples.length,
    errors: samples.length - ok.length,
    cacheHits: samples.filter((s) => s.cache === 'HIT').length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times.length ? Math.max(...times) : null,
    statuses: [...new Set(samples.filter((s) => !s.ok).map((s) => s.status))],
  };
}

async function timedGet(base, urlPath) {
  const started = performance.now();
  try {
    const res = await fetch(base + urlPath);
    await res.arrayBuffer(); // include body transfer in the timing
    return { ok: res.ok, status: res.status, ms: performance.now() - started, cache: res.headers.get('x-cache') };
  } catch (error) {
    return { ok: false, status: error.cause?.code ?? 'network', ms: performance.now() - started };
  }
}

async function getJson(base, urlPath) {
  const res = await fetch(base + urlPath);
  if (!res.ok) throw new Error(`GET ${urlPath} -> ${res.status} (is the API running at ${base}, with rate limits off?)`);
  return res.json();
}

/** Real ids to request, taken from the API so the test works on any database. */
async function discover(base) {
  const fixtures = await getJson(base, '/api/v1/fixtures?sessionType=Race&limit=50');
  const races = fixtures.data;
  if (!races.length) throw new Error('No Race fixtures in this database — sync some sessions first.');
  // Prefer a race that actually has results.
  let race = races[0];
  let stats = [];
  for (const candidate of races.slice(0, 10)) {
    stats = (await getJson(base, `/api/v1/fixtures/${candidate.id}/statistics`)).data;
    if (stats.length) { race = candidate; break; }
  }
  const season = race.season ?? new Date(race.startTime).getUTCFullYear();
  const driverId = stats[0]?.driver?.id ?? null;
  const firstPage = await getJson(base, `/api/v1/events?fixture=${race.id}&limit=500`);
  return { race, season, driverId, deepCursor: firstPage.page.nextCursor };
}

export function buildScenario({ race, season, driverId, deepCursor }) {
  const id = race.id;
  const list = [
    // The website's own reads
    ['site: overview', '/api/overview'],
    ['site: fixtures list', '/api/fixtures'],
    ['site: fixture events', `/api/fixtures/${id}/events`],
    ['site: season statistics', `/api/statistics?view=season&season=${season}`],
    ['site: career statistics', '/api/statistics?view=career'],
    ['site: race replay state', `/api/race-replay/${id}/state?lap=10`],
    // Public API (v1)
    ['v1: fixtures by season', `/api/v1/fixtures?season=${season}`],
    ['v1: one fixture', `/api/v1/fixtures/${id}`],
    ['v1: fixture statistics', `/api/v1/fixtures/${id}/statistics`],
    ['v1: events of a fixture (500)', `/api/v1/events?fixture=${id}&limit=500`],
    ['v1: laps of a fixture', `/api/v1/events?fixture=${id}&type=lap_completed&limit=200`],
    ['v1: pit stops in a season', `/api/v1/events?season=${season}&type=pit_stop&limit=100`],
    ['v1: events in a time window', `/api/v1/events?from=${encodeURIComponent(race.startTime)}&limit=100`],
    ['v1: driver standings', `/api/v1/statistics/drivers?season=${season}`],
    ['v1: team standings', `/api/v1/statistics/teams?season=${season}`],
    ['v1: drivers', '/api/v1/drivers'],
  ];
  if (deepCursor) list.push(['v1: events page 2 (cursor)', `/api/v1/events?fixture=${id}&limit=500&cursor=${deepCursor}`]);
  if (driverId) list.push(['v1: stat with source events', `/api/v1/fixtures/${id}/statistics/${driverId}`]);
  return list.map(([name, urlPath]) => ({ name, path: urlPath }));
}

/** Runs `requests` calls of every endpoint, interleaved, `concurrency` at a time. */
async function run(base, scenario, { concurrency, requests }) {
  const queue = [];
  for (let i = 0; i < requests; i += 1) for (const endpoint of scenario) queue.push(endpoint);
  const samples = new Map(scenario.map((e) => [e.name, []]));
  let next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < queue.length) {
      const endpoint = queue[next++];
      samples.get(endpoint.name).push(await timedGet(base, endpoint.path));
    }
  }));
  return { samples, seconds: (performance.now() - started) / 1000 };
}

export function formatReport({ args, rows, overall, seconds, exportTiming, generatedAt = new Date() }) {
  const ms = (v) => (v == null ? '—' : `${Math.round(v)}`);
  const verdict = (row) => (row.errors === 0 && row.p95 <= args.targetP95 ? 'ok' : 'OVER');
  const lines = [
    '# Load test',
    '',
    `Generated ${generatedAt.toISOString()} against \`${args.base}\` — ${args.concurrency} concurrent clients, ${args.requests} requests per endpoint.`,
    '',
    `**Target: p95 ≤ ${args.targetP95} ms for every endpoint, no errors.** Result: **${overall.pass ? 'PASS' : 'FAIL'}** — overall p95 ${ms(overall.p95)} ms, ${overall.requests} requests in ${seconds.toFixed(1)} s (${(overall.requests / seconds).toFixed(1)} req/s), ${overall.errors} errors.`,
    '',
    '| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.name} | ${r.requests} | ${r.errors}${r.statuses.length ? ` (${r.statuses.join(', ')})` : ''} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${verdict(r)} |`),
  ];
  if (exportTiming) {
    lines.push('', `Export (single request, not part of the concurrent mix): \`${exportTiming.path}\` — ${exportTiming.ok ? `${Math.round(exportTiming.ms)} ms, ${exportTiming.bytes.toLocaleString('en-US')} bytes` : `failed (${exportTiming.status})`}.`);
  }
  const hits = rows.reduce((sum, r) => sum + r.cacheHits, 0);
  if (hits) lines.push('', `Note: ${hits} responses came from the response cache — start the API with CACHE_TTL_SECONDS=0 to measure the database path.`);
  lines.push('');
  return lines.join('\n');
}

async function timeExport(base, raceId) {
  const urlPath = `/api/v1/exports/events?fixture=${raceId}&format=csv`;
  const started = performance.now();
  const res = await fetch(base + urlPath);
  const body = await res.arrayBuffer();
  return { path: urlPath, ok: res.ok, status: res.status, ms: performance.now() - started, bytes: body.byteLength };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ids = await discover(args.base);
  const scenario = buildScenario(ids);
  console.log(`Race fixture ${ids.race.id} (${ids.season}); ${scenario.length} endpoints × ${args.requests} requests, ${args.concurrency} clients.`);

  if (args.warmup > 0) await run(args.base, scenario, { concurrency: args.concurrency, requests: args.warmup });
  const { samples, seconds } = await run(args.base, scenario, args);

  const rows = scenario.map((e) => summarize(e.name, samples.get(e.name)));
  const all = [...samples.values()].flat();
  const overallRow = summarize('overall', all);
  const overall = {
    ...overallRow,
    pass: overallRow.errors === 0 && rows.every((r) => r.p95 <= args.targetP95),
  };
  const exportTiming = await timeExport(args.base, ids.race.id);

  const report = formatReport({ args, rows, overall, seconds, exportTiming });
  console.log(report);
  if (args.report) {
    fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
    fs.writeFileSync(args.report, report);
    console.log(`Report written to ${args.report}`);
  }
  process.exitCode = overall.pass ? 0 : 1;
}

// Only run when executed directly (the helpers above are unit tested).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
