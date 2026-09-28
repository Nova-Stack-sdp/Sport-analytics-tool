/**
 * Query-parameter parsing for the public v1 API.
 *
 * Every endpoint declares the filters it accepts; unknown values are
 * rejected with a 400 that says exactly which parameter was wrong and why,
 * instead of being silently ignored (a typo in a filter would otherwise
 * quietly return the unfiltered data set).
 *
 * Pure — no Express, no database — so it's unit tested directly.
 */

export const EVENT_TYPES = [
  'lap_completed', 'pit_stop', 'tyre_stint', 'position_change', 'flag_event',
  'race_control_message', 'weather_snapshot', 'session_status_change',
  'classification', 'grid_position',
];
export const SESSION_TYPES = ['FP1', 'FP2', 'FP3', 'Q', 'Sprint', 'Race'];
export const SESSION_STATUSES = ['scheduled', 'live', 'finished'];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parsers take the raw string and return { value } or { error }. */
export const parsers = {
  int: ({ min = -Infinity, max = Infinity } = {}) => (raw) => {
    if (!/^-?\d+$/.test(raw)) return { error: 'must be a whole number' };
    const value = Number(raw);
    if (value < min || value > max) return { error: `must be between ${min} and ${max}` };
    return { value };
  },
  uuid: () => (raw) => (UUID.test(raw) ? { value: raw } : { error: 'must be an id (UUID)' }),
  oneOf: (allowed) => (raw) =>
    allowed.includes(raw) ? { value: raw } : { error: `must be one of: ${allowed.join(', ')}` },
  // Comma-separated list, each item from `allowed`.
  listOf: (allowed) => (raw) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = items.filter((item) => !allowed.includes(item));
    if (items.length === 0) return { error: 'must not be empty' };
    if (bad.length) return { error: `unknown value(s) ${bad.join(', ')} — allowed: ${allowed.join(', ')}` };
    return { value: items };
  },
  date: () => (raw) => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? { error: 'must be a date/time (ISO 8601, e.g. 2025-06-01 or 2025-06-01T14:00:00Z)' } : { value: date };
  },
  bool: () => (raw) => {
    if (['true', '1'].includes(raw)) return { value: true };
    if (['false', '0'].includes(raw)) return { value: false };
    return { error: 'must be true or false' };
  },
  text: ({ maxLength = 100 } = {}) => (raw) =>
    raw.length > maxLength ? { error: `must be at most ${maxLength} characters` } : { value: raw },
};

/**
 * @param {object} query - req.query
 * @param {object} spec - { name: parser }
 * @returns {{ values: object, errors: object|null }}
 */
export function parseQuery(query, spec) {
  const values = {};
  const errors = {};
  for (const [name, parse] of Object.entries(spec)) {
    const raw = query[name];
    if (raw === undefined || raw === '') continue;
    if (Array.isArray(raw)) {
      errors[name] = 'must be given once';
      continue;
    }
    const result = parse(String(raw));
    if (result.error) errors[name] = result.error;
    else values[name] = result.value;
  }
  // Unknown parameters are almost always typos — say so rather than ignore.
  for (const name of Object.keys(query)) {
    if (!(name in spec)) errors[name] = 'is not a supported parameter here';
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

/** Limit + cursor are accepted by every list endpoint. */
export const pagingSpec = {
  limit: parsers.int({ min: 1, max: MAX_LIMIT }),
  cursor: parsers.text({ maxLength: 200 }),
};

/** Sends the standard 400 for bad parameters. */
export function badRequest(res, errors) {
  return res.status(400).json({ error: 'Invalid query parameters', details: errors });
}
