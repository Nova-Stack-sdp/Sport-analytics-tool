/**
 * The reference check itself has to be right, or a "PASS" means nothing.
 * These tests feed it database rows built from the reference file (so they
 * should match), then break one value at a time and expect it to be caught.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareSeason,
  compareSession,
  formatReport,
  namesMatch,
  normalizeText,
  overallStatus,
} from '../src/verification/compareReference.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const reference = JSON.parse(
  fs.readFileSync(path.join(here, '../src/verification/reference-results.json'), 'utf8')
);
const session = (id) => reference.sessions.find((s) => s.id === id);
const season2025 = reference.seasons.find((s) => s.season === 2025);

// What the database would hold if ingestion + derivation were perfect.
function perfectSessionRows(ref) {
  return {
    found: true,
    rows: ref.results.map((r) => ({
      carNumber: r.carNumber,
      driverName: r.driver.toUpperCase(),
      finalPosition: r.position ?? null,
      points: r.points,
    })),
  };
}

describe('the reference file', () => {
  test('every session lists each car once, and classified positions run 1..n', () => {
    for (const s of reference.sessions) {
      const cars = s.results.map((r) => r.carNumber);
      expect(new Set(cars).size).toBe(cars.length);
      const positions = s.results.filter((r) => r.position !== undefined).map((r) => r.position);
      expect(positions).toEqual(positions.map((_, i) => i + 1));
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  test('2025 driver points and constructor points add up to the same total', () => {
    const drivers = season2025.drivers.reduce((sum, d) => sum + d.points, 0);
    const teams = season2025.teams.reduce((sum, t) => sum + t.points, 0);
    expect(drivers).toBe(teams);
    expect(season2025.drivers.reduce((sum, d) => sum + d.wins, 0)).toBe(24);
  });

  test('race points follow the published scale (25-18-15-12-10-8-6-4-2-1, + fastest lap before 2025)', () => {
    const scale = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    for (const s of reference.sessions.filter((x) => x.sessionType === 'Race')) {
      const total = s.results.reduce((sum, r) => sum + r.points, 0);
      const base = scale.reduce((a, b) => a + b, 0);
      expect(total).toBe(s.season < 2025 ? base + 1 : base);
    }
  });
});

describe('name matching', () => {
  test('ignores case, accents and OpenF1 surname capitals', () => {
    expect(normalizeText('Nico HÜLKENBERG')).toBe('nico hulkenberg');
    expect(namesMatch('Sergio Pérez', 'Sergio PEREZ')).toBe(true);
    expect(namesMatch('Zhou Guanyu', 'ZHOU Guanyu')).toBe(true);
    expect(namesMatch('Kimi Antonelli', 'Andrea Kimi ANTONELLI')).toBe(true);
    expect(namesMatch('Max Verstappen', 'Lando NORRIS')).toBe(false);
  });
});

describe('compareSession', () => {
  const ref = session('2024-bahrain-race');

  test('passes when every position and points value matches', () => {
    const result = compareSession(ref, perfectSessionRows(ref));
    expect(result.status).toBe('pass');
    expect(result.mismatches).toEqual([]);
    expect(result.checks).toBe(60); // 20 cars × (entry, position, points)
  });

  test('catches a wrong points value (e.g. a missing fastest-lap point)', () => {
    const actual = perfectSessionRows(ref);
    actual.rows[0].points = 25;
    const result = compareSession(ref, actual);
    expect(result.status).toBe('fail');
    expect(result.mismatches).toEqual([
      { carNumber: 1, driver: 'Max Verstappen', field: 'points', expected: 26, actual: 25 },
    ]);
  });

  test('catches swapped positions, a missing car and an extra classified car', () => {
    const actual = perfectSessionRows(ref);
    actual.rows[1].finalPosition = 3;
    actual.rows[2].finalPosition = 2;
    actual.rows.pop(); // Sargeant missing
    actual.rows.push({ carNumber: 99, driverName: 'Nobody', finalPosition: 21, points: 0 });
    const fields = compareSession(ref, actual).mismatches.map((m) => `${m.carNumber}:${m.field}`);
    expect(fields).toEqual(['11:position', '55:position', '2:entry', '99:entry']);
  });

  test('a retired car is only checked for points, not position', () => {
    const sprint = session('2024-china-sprint');
    const actual = perfectSessionRows(sprint);
    actual.rows.find((r) => r.carNumber === 14).finalPosition = 20;
    expect(compareSession(sprint, actual).status).toBe('pass');
  });

  test('a car stored under another driver\'s name is a warning, not a failure', () => {
    const actual = perfectSessionRows(ref);
    actual.rows[0].driverName = 'Lando NORRIS';
    const result = compareSession(ref, actual);
    expect(result.status).toBe('pass');
    expect(result.warnings[0]).toMatch(/Car #1: reference driver is Max Verstappen.*Lando NORRIS/);
  });

  test('a session that was never ingested is reported as missing', () => {
    expect(compareSession(ref, { found: false }).status).toBe('missing');
  });
});

describe('compareSeason (2025)', () => {
  const australia = session('2025-australia-race');

  function seasonRows({ withoutAustralia }) {
    const pts = new Map(season2025.drivers.map((d) => [d.carNumber, { points: d.points, wins: d.wins }]));
    const teams = new Map(season2025.teams.map((t) => [t.team, t.points]));
    if (withoutAustralia) {
      for (const r of australia.results) {
        const d = pts.get(r.carNumber);
        d.points -= r.points;
        if (r.position === 1) d.wins -= 1;
        const team = season2025.teams.find((t) => t.aliases.some((a) => r.team.toLowerCase().includes(a)));
        teams.set(team.team, teams.get(team.team) - r.points);
      }
    }
    const covered = Array.from({ length: withoutAustralia ? 29 : 30 }, (_, i) => ({ meeting: `Grand Prix ${i}`, sessionType: 'Race' }));
    if (!withoutAustralia) covered[0] = { meeting: 'Australian Grand Prix', sessionType: 'Race' };
    return {
      coveredSessions: covered,
      drivers: season2025.drivers.map((d) => ({ carNumber: d.carNumber, driverName: d.driver, ...pts.get(d.carNumber) })),
      teams: season2025.teams.map((t) => ({ name: t.team, points: teams.get(t.team) })),
    };
  }

  test('with every session ingested, totals must equal the official standings', () => {
    const result = compareSeason(season2025, reference.sessions, seasonRows({ withoutAustralia: false }));
    expect(result.status).toBe('pass');
    expect(result.adjustments).toEqual([]);
    expect(result.checks).toBe(21 * 2 + 10);
  });

  test('a missing session the reference knows is subtracted, and the rest still checked', () => {
    const result = compareSeason(season2025, reference.sessions, seasonRows({ withoutAustralia: true }));
    expect(result.status).toBe('pass');
    expect(result.adjustments[0]).toMatch(/2025 Australian Race is not in the database/);
  });

  test('sprint points left out of the totals are caught', () => {
    const actual = seasonRows({ withoutAustralia: true });
    actual.drivers.find((d) => d.carNumber === 1).points -= 8; // e.g. a sprint win not counted
    const result = compareSeason(season2025, reference.sessions, actual);
    expect(result.status).toBe('fail');
    expect(result.mismatches).toEqual([
      { carNumber: 1, driver: 'Max Verstappen', field: 'points', expected: 403, actual: 395 },
    ]);
  });

  test('too many sessions means duplicates, and is a failure', () => {
    const actual = seasonRows({ withoutAustralia: false });
    actual.coveredSessions.push({ meeting: 'Extra', sessionType: 'Sprint' });
    expect(compareSeason(season2025, reference.sessions, actual).status).toBe('fail');
  });

  test('gaps the reference cannot account for leave the season incomplete, not failed', () => {
    const actual = seasonRows({ withoutAustralia: true });
    actual.coveredSessions.pop();
    expect(compareSeason(season2025, reference.sessions, actual).status).toBe('incomplete');
  });
});

describe('report and exit status', () => {
  test('missing data only fails in strict mode; the report lists every check', () => {
    const results = [
      compareSession(session('2024-bahrain-race'), perfectSessionRows(session('2024-bahrain-race'))),
      compareSession(session('2023-australia-race'), { found: false }),
    ];
    expect(overallStatus(results)).toBe('pass');
    expect(overallStatus(results, { strict: true })).toBe('fail');

    const report = formatReport(results, { generatedAt: new Date('2026-09-28T00:00:00Z') });
    expect(report).toContain('overall: **PASS**');
    expect(report).toContain('| 2024 Bahrain Race | PASS | 60 | 0 | 0 |');
    expect(report).toContain('| 2023 Australian Race | NOT INGESTED | 0 | 0 | 1 |');
  });
});
