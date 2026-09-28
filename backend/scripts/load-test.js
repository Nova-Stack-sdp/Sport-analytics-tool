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
 * Two times are recorded per request: the total seen by this client, and
 * the server's own time from the Server-Timing header (database + building
 * the response, without the network between here and the server). The
 * target is judged on the server time when the API sends it (--judge total
 * to judge on the client time instead), since a client on another continent
 * adds its own round trip to every request whatever the platform does.
 *
 * Exit code 0 when every endpoint's p95 meets the target and nothing
 * errored; 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = { base: 'http://localhost:8080', concurrency: 10, requests: 30, targetP95: 500, warmup: 1, report: null, judge: 'server' };

export function parseArgs(argv) {
  const args = { ...DEFAULTS };
  const numeric = { '--concurrency': 'concurrency', '--requests': 'requests', '--target-p95': 'targetP95', '--warmup': 'warmup' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--base') args.base = argv[++i].replace(/\/$/, '');
    else if (flag === '--report') args.report = argv[++i];
    else if (flag === '--judge') {
      args.judge = argv[++i];
      if (!['server', 'total'].includes(args.judge)) throw new Error('--judge must be server or total');
    }
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
  const serverTimes = samples.map((s) => s.serverMs).filter((v) => typeof v === 'number');
  const hasServer = serverTimes.length === samples.length && samples.length > 0;
  return {
    name,
    requests: samples.length,
    errors: samples.length - ok.length,
    cacheHits: samples.filter((s) => s.cache === 'HIT').length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    max: times.length ? Math.max(...times) : null,
    serverP50: hasServer ? percentile(serverTimes, 50) : null,
    serverP95: hasServer ? percentile(serverTimes, 95) : null,
    statuses: [...new Set(samples.filter((s) => !s.ok).map((s) => s.status))],
  };
}

async function timedGet(base, urlPath) {
  const started = performance.now();
  try {
    const res = await fetch(base + urlPath);
    await res.arrayBuffer(); // include body transfer in the timing
    return {
      ok: res.ok,
      status: res.status,
      ms: performance.now() - started,
      serverMs: parseServerTiming(res.headers.get('server-timing')),
      cache: res.headers.get('x-cache'),
    };
  } catch (error) {
    return { ok: false, status: error.cause?.code ?? 'network', ms: performance.now() - started };
  }
}

/** `app;dur=12.3` → 12.3 (null when the header is missing). */
export function parseServerTiming(header) {
  const match = /(?:^|,)\s*app;dur=([\d.]+)/.exec(header ?? '');
  return match ? Number(match[1]) : null;
}

/** The p95 the target is judged on: server time when available (and asked for), else total. */
export function judgedP95(row, judge) {
  return judge === 'server' && row.serverP95 != null ? row.serverP95 : row.p95;
}

async function getJson(base, urlPath) {
  const res = await fetch(base + urlPath);
  if (!res.ok) throw new Error(`GET ${urlPath} -> ${res.status} (is the API running at ${base}, with rate limits off?)`);
  return res.json();
}

/** Real ids to request, taken from the API so the test works on any database. */
async function discover(base) {
  const fixtures = await getJson(base, '/api/v1/fixtures?sessionType=Race&limit=100');
  const races = fixtures.data;
  if (!races.length) throw new Error('No Race fixtures in this database — sync some sessions first.');

  // Use a race that was actually synced: it has events and a classified
  // result. The newest fixtures can be scheduled races with entries but no
  // events yet. Prefer one with more than a page of events, so the cursor
  // request is realistic.
  let fallback = null;
  for (const race of races) {
    const firstPage = await getJson(base, `/api/v1/events?fixture=${race.id}&limit=500`);
    if (!firstPage.data.length) continue;
    const stats = (await getJson(base, `/api/v1/fixtures/${race.id}/statistics`)).data;
    const classified = stats.find((row) => row.finalPosition != null);
    if (!classified) continue;
    const laps = await getJson(base, `/api/v1/events?fixture=${race.id}&type=lap_completed&limit=1`);
    const found = {
      race,
      hasLaps: laps.data.length > 0,
      season: race.season ?? new Date(race.startTime).getUTCFullYear(),
      driverId: classified.driver?.id ?? null,
      deepCursor: firstPage.page.nextCursor,
    };
    if (found.deepCursor && found.hasLaps) return found;
    fallback ??= found;
  }
  if (fallback) return fallback;
  throw new Error('No Race fixture with synced events and results was found.');
}

export function buildScenario({ race, season, driverId, deepCursor, hasLaps = true }) {
  const id = race.id;
  const list = [
    // The website's own reads
    ['site: overview', '/api/overview'],
    ['site: fixtures list', '/api/fixtures'],
    ['site: fixture events', `/api/fixtures/${id}/events`],
    ['site: season statistics', `/api/statistics?view=season&season=${season}`],
    ['site: career statistics', '/api/statistics?view=career'],
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
  // Race replay needs lap data; a fixture without it answers 400 by design.
  if (hasLaps) list.push(['site: race replay state', `/api/race-replay/${id}/state?lap=10`]);
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
  const judge = args.judge ?? 'server';
  const verdict = (row) => (row.errors === 0 && judgedP95(row, judge) <= args.targetP95 ? 'ok' : 'OVER');
  const judgedOnServer = judge === 'server' && rows.every((r) => r.serverP95 != null);
  const lines = [
    '# Load test',
    '',
    `Generated ${generatedAt.toISOString()} against \`${args.base}\` — ${args.concurrency} concurrent clients, ${args.requests} requests per endpoint.`,
    '',
    `**Target: p95 ≤ ${args.targetP95} ms for every endpoint, no errors** (judged on ${judgedOnServer ? 'server time' : 'total time seen by the client'}). Result: **${overall.pass ? 'PASS' : 'FAIL'}** — overall p95 ${ms(overall.p95)} ms total${overall.serverP95 != null ? ` / ${ms(overall.serverP95)} ms server` : ''}, ${overall.requests} requests in ${seconds.toFixed(1)} s (${(overall.requests / seconds).toFixed(1)} req/s), ${overall.errors} errors.`,
    '',
    '"Total" is what this client measured; "server" is the API\'s own time from its Server-Timing header (database + building the response). The difference is the network between this client and the API.',
    '',
    '| Endpoint | Requests | Errors | total p50 | total p95 | total max | server p50 | server p95 | |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.name} | ${r.requests} | ${r.errors}${r.statuses.length ? ` (${r.statuses.join(', ')})` : ''} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${ms(r.serverP50)} | ${ms(r.serverP95)} | ${verdict(r)} |`),
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
    pass: overallRow.errors === 0 && rows.every((r) => judgedP95(r, args.judge) <= args.targetP95),
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
