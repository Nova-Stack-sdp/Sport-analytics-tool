import {
  DEFAULT_PREFERENCES,
  LEGACY_THEME_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  readPreferences,
  resetPreferences,
  resolveTheme,
  savePreferences,
  subscribeToPreferences,
} from '../services/preferences';
import { createDateTimeFormatters } from '../utils/dateTime';

describe('preferences service', () => {
  beforeEach(() => window.localStorage.clear());

  test('returns the defaults when nothing is saved', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  test('keeps a theme saved by the old standalone theme key', () => {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'light');

    expect(readPreferences().theme).toBe('light');
  });

  test('merges saved changes and ignores values that are not allowed', () => {
    savePreferences({ density: 'compact', replaySpeed: 4 });
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ ...JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)), theme: 'purple', startPage: '/admin' })
    );

    expect(readPreferences()).toEqual({
      ...DEFAULT_PREFERENCES,
      density: 'compact',
      replaySpeed: 4,
      // invalid values fall back to their defaults
      theme: 'dark',
      startPage: '/overview',
    });
  });

  test('survives corrupt saved JSON', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, '{not json');

    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  test('notifies subscribers on save and reset, and reset restores defaults', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToPreferences(listener);

    savePreferences({ reduceMotion: true });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ reduceMotion: true }));

    resetPreferences();
    expect(listener).toHaveBeenLastCalledWith(DEFAULT_PREFERENCES);
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);

    unsubscribe();
    savePreferences({ reduceMotion: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('resolves "Match system" from the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('date/time formatters', () => {
  const MOMENT = '2026-07-05T14:05:00Z';

  test('render a dash for missing or invalid values', () => {
    const { formatDate, formatTime, formatDateTime } = createDateTimeFormatters(DEFAULT_PREFERENCES);

    expect(formatDate(null)).toBe('—');
    expect(formatTime(undefined)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  test('UTC + 24-hour shows 14:05 and labels the zone', () => {
    const { formatTime } = createDateTimeFormatters({ clock: '24h', timeZone: 'utc' });

    expect(formatTime(MOMENT)).toMatch(/14:05/);
    expect(formatTime(MOMENT)).toMatch(/UTC$/);
  });

  test('UTC + 12-hour shows 2:05 PM', () => {
    const { formatDateTime } = createDateTimeFormatters({ clock: '12h', timeZone: 'utc' });

    expect(formatDateTime(MOMENT)).toMatch(/2:05/);
    expect(formatDateTime(MOMENT)).toMatch(/pm/i);
  });

  test('local time has no UTC label', () => {
    const { formatDateTime } = createDateTimeFormatters({ clock: 'auto', timeZone: 'local' });

    expect(formatDateTime(MOMENT)).not.toMatch(/UTC/);
  });
});
