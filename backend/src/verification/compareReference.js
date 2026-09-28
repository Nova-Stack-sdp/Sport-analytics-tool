/**
 * Reference check: compares what the platform derived from ingested data
 * with known-correct published results (reference-results.json).
 *
 * Pure — the script in scripts/verify-reference.js loads the database rows
 * and hands them in, so every rule here is unit tested without a database.
 *
 * Drivers are matched on car number (how OpenF1 and our driver table
 * identify them). Names are compared too, but only produce warnings: a
 * name mismatch means the result is attached to the right car but the
 * stored driver name is wrong, which is a display problem rather than a
 * wrong statistic.
 */

const EPSILON = 1e-9;

/** Lower-case, accents removed, single spaces — "Nico HÜLKENBERG" → "nico hulkenberg". */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Same person? Compares the reference surname against the stored full name. */
export function namesMatch(referenceName, storedName) {
  const surname = normalizeText(referenceName).split(' ').pop();
  return Boolean(surname) && normalizeText(storedName).split(' ').includes(surname);
}

export function meetingMatches(referenceMeeting, storedMeetingName) {
  return normalizeText(storedMeetingName).includes(normalizeText(referenceMeeting));
}

const samePoints = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < EPSILON;

/**
 * @param {object} ref - one entry of reference.sessions
 * @param {{found:boolean, rows:Array<{carNumber:number, driverName:string, finalPosition:number|null, points:number|null}>}} actual
 * @returns {{kind:'session', id, label, status:'pass'|'fail'|'missing', checks:number, mismatches:Array, warnings:string[]}}
 */
export function compareSession(ref, actual) {
  const label = `${ref.season} ${ref.meeting} ${ref.sessionType}`;
  const result = { kind: 'session', id: ref.id, label, status: 'pass', checks: 0, mismatches: [], warnings: [] };

  if (!actual?.found) {
    result.status = 'missing';
    result.warnings.push('Session has no derived results in the database (not ingested yet).');
    return result;
  }

  const byCar = new Map(actual.rows.map((row) => [row.carNumber, row]));
  const mismatch = (row, field, expected, got) =>
    result.mismatches.push({ carNumber: row.carNumber, driver: row.driver, field, expected, actual: got });

  for (const expected of ref.results) {
    const stored = byCar.get(expected.carNumber);
    result.checks += 1;
    if (!stored) {
      mismatch(expected, 'entry', 'present', 'missing');
      continue;
    }
    byCar.delete(expected.carNumber);

    if (expected.position !== undefined) {
      result.checks += 1;
      if (stored.finalPosition !== expected.position) {
        mismatch(expected, 'position', expected.position, stored.finalPosition);
      }
    }
    result.checks += 1;
    if (!samePoints(stored.points, expected.points)) {
      mismatch(expected, 'points', expected.points, stored.points ?? 0);
    }
    if (!namesMatch(expected.driver, stored.driverName)) {
      result.warnings.push(
        `Car #${expected.carNumber}: reference driver is ${expected.driver}, but the database names this car "${stored.driverName}".`
      );
    }
  }

  // A classified car the reference doesn't know about is a wrong result too.
  for (const extra of byCar.values()) {
    if (extra.finalPosition != null) {
      result.checks += 1;
      result.mismatches.push({
        carNumber: extra.carNumber, driver: extra.driverName, field: 'entry', expected: 'absent', actual: `P${extra.finalPosition}`,
      });
    }
  }

  if (result.mismatches.length) result.status = 'fail';
  return result;
}

/**
 * Season totals. If some of the season's points-paying sessions are not in
 * the database, but the reference file has their results, their points (and
 * wins) are taken off the official totals so the rest can still be checked.
 * If sessions are missing that the reference can't account for, the season
 * is reported as incomplete instead of as a failure.
 *
 * @param {object} ref - one entry of reference.seasons
 * @param {object[]} sessionRefs - reference.sessions (used for adjustments)
 * @param {{coveredSessions:Array<{meeting:string, sessionType:string}>,
 *          drivers:Array<{carNumber:number, driverName:string, points:number, wins:number}>,
 *          teams:Array<{name:string, points:number}>}} actual
 */
export function compareSeason(ref, sessionRefs, actual) {
  const label = `${ref.season} season totals`;
  const result = {
    kind: 'season', id: `season-${ref.season}`, label, status: 'pass', checks: 0,
    mismatches: [], warnings: [], adjustments: [],
  };

  const covered = actual.coveredSessions;
  const isCovered = (s) => covered.some(
    (c) => c.sessionType === s.sessionType && meetingMatches(s.meeting, c.meeting)
  );
  const missingWithReference = sessionRefs.filter((s) => s.season === ref.season && !isCovered(s));

  if (covered.length > ref.pointsSessions) {
    result.status = 'fail';
    result.mismatches.push({
      field: 'sessions', expected: ref.pointsSessions, actual: covered.length,
      driver: 'More points-paying sessions with results than the season had — duplicated or mislabelled sessions.',
    });
    return result;
  }
  if (covered.length + missingWithReference.length !== ref.pointsSessions) {
    result.status = 'incomplete';
    result.warnings.push(
      `Only ${covered.length} of ${ref.pointsSessions} race/sprint sessions have results, and the reference file can't account for the rest — totals not compared.`
    );
    return result;
  }

  // Official totals minus whatever the missing sessions contributed.
  const driverAdjust = new Map();
  const teamAdjust = new Map();
  for (const s of missingWithReference) {
    result.adjustments.push(`${s.season} ${s.meeting} ${s.sessionType} is not in the database; its points are taken off the official totals.`);
    for (const row of s.results) {
      const adj = driverAdjust.get(row.carNumber) ?? { points: 0, wins: 0 };
      adj.points += row.points;
      if (s.sessionType === 'Race' && row.position === 1) adj.wins += 1;
      driverAdjust.set(row.carNumber, adj);

      const team = ref.teams.find((t) => row.team && t.aliases.some((a) => normalizeText(row.team).includes(normalizeText(a))));
      if (team) teamAdjust.set(team.team, (teamAdjust.get(team.team) ?? 0) + row.points);
    }
  }

  const storedDrivers = new Map(actual.drivers.map((d) => [d.carNumber, d]));
  for (const official of ref.drivers) {
    const adj = driverAdjust.get(official.carNumber) ?? { points: 0, wins: 0 };
    const expectedPoints = official.points - adj.points;
    const expectedWins = official.wins - adj.wins;
    const stored = storedDrivers.get(official.carNumber);
    const got = stored ?? { points: 0, wins: 0 };

    result.checks += 2;
    if (!samePoints(got.points, expectedPoints)) {
      result.mismatches.push({ carNumber: official.carNumber, driver: official.driver, field: 'points', expected: expectedPoints, actual: got.points });
    }
    if (got.wins !== expectedWins) {
      result.mismatches.push({ carNumber: official.carNumber, driver: official.driver, field: 'wins', expected: expectedWins, actual: got.wins });
    }
    if (stored && !namesMatch(official.driver, stored.driverName)) {
      result.warnings.push(
        `Car #${official.carNumber}: reference driver is ${official.driver}, but the database names this car "${stored.driverName}".`
      );
    }
  }

  for (const official of ref.teams) {
    const rows = actual.teams.filter((t) => official.aliases.some((a) => normalizeText(t.name).includes(normalizeText(a))));
    const expected = official.points - (teamAdjust.get(official.team) ?? 0);
    const got = rows.reduce((sum, t) => sum + Number(t.points ?? 0), 0);
    result.checks += 1;
    if (!samePoints(got, expected)) {
      result.mismatches.push({ team: official.team, field: 'team points', expected, actual: got });
    }
    if (rows.length > 1) {
      result.warnings.push(`${official.team} is split over ${rows.length} team rows (${rows.map((r) => r.name).join(', ')}).`);
    }
  }

  if (result.mismatches.length) result.status = 'fail';
  return result;
}

/** Overall outcome: failures always fail; missing data fails only in strict mode. */
export function overallStatus(results, { strict = false } = {}) {
  if (results.some((r) => r.status === 'fail')) return 'fail';
  if (strict && results.some((r) => r.status !== 'pass')) return 'fail';
  return 'pass';
}

const ICON = { pass: 'PASS', fail: 'FAIL', missing: 'NOT INGESTED', incomplete: 'INCOMPLETE' };

/** Markdown report — printed by the script and optionally saved as evidence. */
export function formatReport(results, { generatedAt = new Date(), strict = false } = {}) {
  const lines = [];
  const outcome = overallStatus(results, { strict });
  lines.push('# Reference check');
  lines.push('');
  lines.push(`Generated ${generatedAt.toISOString()} — overall: **${outcome.toUpperCase()}**`);
  lines.push('');
  lines.push('| Check | Result | Values compared | Mismatches | Warnings |');
  lines.push('|---|---|---:|---:|---:|');
  for (const r of results) {
    lines.push(`| ${r.label} | ${ICON[r.status]} | ${r.checks} | ${r.mismatches.length} | ${r.warnings.length} |`);
  }

  for (const r of results) {
    if (!r.mismatches.length && !r.warnings.length && !r.adjustments?.length) continue;
    lines.push('');
    lines.push(`## ${r.label}`);
    for (const note of r.adjustments ?? []) lines.push(`- Note: ${note}`);
    for (const m of r.mismatches) {
      const who = m.team ?? (m.carNumber !== undefined ? `#${m.carNumber} ${m.driver}` : m.driver);
      lines.push(`- Mismatch — ${who}: ${m.field} expected ${m.expected}, got ${m.actual}`);
    }
    for (const w of r.warnings) lines.push(`- Warning — ${w}`);
  }
  lines.push('');
  return lines.join('\n');
}
