/**
 * The load test's arithmetic: if percentiles or the pass/fail verdict were
 * wrong, the numbers in docs/PERFORMANCE.md would be too.
 */
import { buildScenario, formatReport, judgedP95, parseArgs, parseServerTiming, percentile, summarize } from '../scripts/load-test.js';

describe('percentile (nearest rank)', () => {
  test('matches hand-computed values', () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]; // 1..10, unsorted
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 90)).toBe(9);
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('summarize', () => {
  test('counts errors, statuses and cache hits', () => {
    const row = summarize('x', [
      { ok: true, status: 200, ms: 10, cache: 'MISS' },
      { ok: true, status: 200, ms: 20, cache: 'HIT' },
      { ok: false, status: 429, ms: 5 },
    ]);
    expect(row).toEqual(expect.objectContaining({
      requests: 3, errors: 1, cacheHits: 1, p50: 10, max: 20, statuses: [429],
    }));
  });
});

describe('parseArgs', () => {
  test('defaults and overrides', () => {
    expect(parseArgs([])).toEqual(expect.objectContaining({ base: 'http://localhost:8080', concurrency: 10, targetP95: 500 }));
    const args = parseArgs(['--base', 'https://api.example.test/', '--concurrency', '25', '--target-p95', '300']);
    expect(args).toEqual(expect.objectContaining({ base: 'https://api.example.test', concurrency: 25, targetP95: 300 }));
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});

describe('buildScenario', () => {
  test('covers the site and the public API for a real fixture, driver and season', () => {
    const scenario = buildScenario({
      race: { id: 'fx-1', startTime: '2025-06-01T14:00:00.000Z' }, season: 2025, driverId: 'drv-1', deepCursor: 'abc',
    });
    const paths = scenario.map((e) => e.path);
    expect(paths).toContain('/api/overview');
    expect(paths).toContain('/api/v1/events?fixture=fx-1&limit=500&cursor=abc');
    expect(paths).toContain('/api/v1/fixtures/fx-1/statistics/drv-1');
    expect(paths).toContain('/api/v1/statistics/drivers?season=2025');
    expect(new Set(scenario.map((e) => e.name)).size).toBe(scenario.length);
  });
});

describe('server timing', () => {
  test('reads the app duration from the Server-Timing header', () => {
    expect(parseServerTiming('app;dur=12.5')).toBe(12.5);
    expect(parseServerTiming('cache;desc=hit, app;dur=3')).toBe(3);
    expect(parseServerTiming(null)).toBeNull();
  });

  test('summarize reports server percentiles only when every sample has one', () => {
    const withServer = summarize('x', [
      { ok: true, status: 200, ms: 300, serverMs: 10 },
      { ok: true, status: 200, ms: 320, serverMs: 30 },
    ]);
    expect(withServer).toEqual(expect.objectContaining({ p95: 320, serverP50: 10, serverP95: 30 }));
    const partial = summarize('x', [{ ok: true, status: 200, ms: 1, serverMs: 1 }, { ok: true, status: 200, ms: 2 }]);
    expect(partial.serverP95).toBeNull();
  });

  test('judged on server time by default, total when asked or when the header is missing', () => {
    expect(judgedP95({ p95: 800, serverP95: 90 }, 'server')).toBe(90);
    expect(judgedP95({ p95: 800, serverP95: 90 }, 'total')).toBe(800);
    expect(judgedP95({ p95: 800, serverP95: null }, 'server')).toBe(800);
  });
});

describe('formatReport', () => {
  test('marks endpoints over the target and states the overall result', () => {
    const args = { base: 'http://x', concurrency: 10, requests: 2, targetP95: 100, judge: 'server' };
    const rows = [
      { name: 'fast', requests: 2, errors: 0, cacheHits: 0, p50: 300, p95: 320, max: 320, serverP50: 10, serverP95: 20, statuses: [] },
      { name: 'slow', requests: 2, errors: 0, cacheHits: 0, p50: 400, p95: 450, max: 450, serverP50: 90, serverP95: 150, statuses: [] },
    ];
    const report = formatReport({
      args, rows, seconds: 1, overall: { pass: false, p95: 450, serverP95: 150, requests: 4, errors: 0 },
      generatedAt: new Date('2026-09-28T00:00:00Z'),
    });
    expect(report).toContain('Result: **FAIL**');
    expect(report).toContain('judged on server time');
    expect(report).toContain('| fast | 2 | 0 | 300 | 320 | 320 | 10 | 20 | ok |');
    expect(report).toContain('| slow | 2 | 0 | 400 | 450 | 450 | 90 | 150 | OVER |');
  });
});
