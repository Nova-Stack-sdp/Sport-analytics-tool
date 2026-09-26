// Date/time formatting that follows the user's Settings:
//   clock:    'auto' (browser default) | '24h' | '12h'
//   timeZone: 'local' | 'utc'
// Times shown in UTC get a " UTC" suffix so there's no doubt which zone a
// time is in. Missing or invalid values render as an em dash, matching what
// the pages did before.

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function baseOptions({ clock, timeZone }) {
  const options = {};
  if (clock === '24h') options.hourCycle = 'h23';
  if (clock === '12h') options.hour12 = true;
  if (timeZone === 'utc') options.timeZone = 'UTC';
  return options;
}

export function createDateTimeFormatters(preferences = {}) {
  const options = baseOptions(preferences);
  const utcSuffix = preferences.timeZone === 'utc' ? ' UTC' : '';

  return {
    formatDate(value) {
      const date = toDate(value);
      if (!date) return '—';
      return date.toLocaleDateString(undefined, options.timeZone ? { timeZone: options.timeZone } : undefined);
    },
    formatTime(value) {
      const date = toDate(value);
      if (!date) return '—';
      return `${date.toLocaleTimeString(undefined, options)}${utcSuffix}`;
    },
    formatDateTime(value) {
      const date = toDate(value);
      if (!date) return '—';
      return `${date.toLocaleString(undefined, options)}${utcSuffix}`;
    },
  };
}
