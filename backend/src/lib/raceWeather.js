/**
 * Race-day weather for a broadcast, from Open-Meteo's historical archive
 * (ERA5 reanalysis — https://open-meteo.com, free, no key).
 *
 * The broadcast reports carry no weather of their own (the curated notes are
 * prose, not readings), so the header's conditions come from a measured
 * source instead of being described: the venue's hourly weather on race day,
 * summarised over the race window. Nothing is guessed — if the archive can't
 * be reached, the caller gets null and the page shows no conditions at all.
 *
 * The window is a span of local hours (the curated lookup says which), not
 * the exact green-to-checkered time: the reports don't carry wall-clock race
 * times, and the response says which hours were read so the page can too.
 */

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'weather_code',
];

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// A window only reads as wet when real rain fell in it: half a millimetre
// over the race hours. Below that a single drizzle hour is a trace, not a
// wet race, and the window's usual sky decides instead.
const WET_WINDOW_MM = 0.5;
const isWetCode = (code) => code >= 51;

// The window's condition: its most common code (ties go to the more severe),
// unless the rain gauge says otherwise — enough rain makes it the wettest
// code seen; a dry gauge never lets a lone wet hour label the race.
export function windowCode(codes, precipitationMm) {
  if (codes.length === 0) return null;
  const counts = new Map();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const wet = (precipitationMm ?? 0) >= WET_WINDOW_MM;
  if (wet) {
    const wettest = Math.max(...codes);
    return isWetCode(wettest) ? wettest : 61;
  }
  const dry = ranked.find(([code]) => !isWetCode(code));
  return dry ? dry[0] : ranked[0][0];
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const round1 = (value) => Math.round(value * 10) / 10;

// Wind direction is an angle, so it is averaged as one: the mean of the unit
// vectors, which keeps 350° and 10° from averaging to 180°.
function circularMeanDegrees(degrees) {
  const x = mean(degrees.map((d) => Math.cos((d * Math.PI) / 180)));
  const y = mean(degrees.map((d) => Math.sin((d * Math.PI) / 180)));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function compassPoint(degrees) {
  return COMPASS[Math.round(degrees / 45) % 8];
}

// WMO weather codes, as Open-Meteo reports them, read into the handful of
// conditions a race header needs.
export function conditionForCode(code) {
  if (code >= 95) return { key: 'storm', label: 'Thunderstorms' };
  if (code >= 71 && code <= 77) return { key: 'snow', label: 'Snow' };
  if (code >= 85 && code <= 86) return { key: 'snow', label: 'Snow showers' };
  if (code >= 80) return { key: 'rain', label: 'Rain showers' };
  if (code >= 61) return { key: 'rain', label: 'Rain' };
  if (code >= 51) return { key: 'drizzle', label: 'Drizzle' };
  if (code >= 45) return { key: 'fog', label: 'Fog' };
  if (code === 3) return { key: 'overcast', label: 'Overcast' };
  if (code === 2) return { key: 'partly-cloudy', label: 'Partly cloudy' };
  if (code === 1) return { key: 'clear', label: 'Mainly clear' };
  return { key: 'clear', label: 'Clear' };
}

// 'M/D/YYYY' (the broadcast reports' format) or 'YYYY-MM-DD' -> 'YYYY-MM-DD'.
export function isoDate(value) {
  if (typeof value !== 'string') return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return null;
}

/**
 * Summarise one race window from Open-Meteo's hourly payload. Pure, so the
 * arithmetic is testable without the network.
 */
export function summariseWeather(hourly, { fromHour, toHour }) {
  const rows = (hourly?.time ?? [])
    .map((time, i) => ({ hour: Number(String(time).slice(11, 13)), i }))
    .filter(({ hour }) => hour >= fromHour && hour < toHour)
    .map(({ i }) => i);
  const pick = (name) =>
    rows.map((i) => hourly?.[name]?.[i]).filter((value) => Number.isFinite(value));

  const temperature = pick('temperature_2m');
  if (temperature.length === 0) return null;
  const humidity = pick('relative_humidity_2m');
  const precipitation = pick('precipitation');
  const cloud = pick('cloud_cover');
  const windSpeed = pick('wind_speed_10m');
  const windDirection = pick('wind_direction_10m');
  const codes = pick('weather_code');

  const windDegrees = windDirection.length > 0 ? circularMeanDegrees(windDirection) : null;
  const rainfall = precipitation.reduce((s, v) => s + v, 0);
  const code = windowCode(codes, rainfall);

  return {
    condition: code == null ? null : { ...conditionForCode(code), code },
    airTemperatureC: round1(mean(temperature)),
    airTemperatureRangeC: [round1(Math.min(...temperature)), round1(Math.max(...temperature))],
    humidityPct: humidity.length > 0 ? Math.round(mean(humidity)) : null,
    windSpeedKmh: windSpeed.length > 0 ? round1(mean(windSpeed)) : null,
    windDirectionDeg: windDegrees == null ? null : Math.round(windDegrees),
    windCompass: windDegrees == null ? null : compassPoint(windDegrees),
    precipitationMm: precipitation.length > 0 ? round1(rainfall) : null,
    cloudCoverPct: cloud.length > 0 ? Math.round(mean(cloud)) : null,
    hoursRead: temperature.length,
  };
}

const cache = new Map(); // `${lat},${lon},${date},${from}-${to}` -> summary

/**
 * The race window's weather, or null when the archive has nothing to say.
 * `lookup` = { latitude, longitude, timezone, date (YYYY-MM-DD), fromHour,
 * toHour, venue }. Results are cached for the life of the process: a past
 * day's weather doesn't change.
 */
export async function getRaceWeather(lookup, { fetchImpl = fetch } = {}) {
  const { latitude, longitude, timezone, date, fromHour, toHour } = lookup ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !date) return null;
  const key = `${latitude},${longitude},${date},${fromHour}-${toHour}`;
  if (cache.has(key)) return cache.get(key);

  const url = new URL(ARCHIVE_URL);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('start_date', date);
  url.searchParams.set('end_date', date);
  url.searchParams.set('hourly', HOURLY.join(','));
  url.searchParams.set('timezone', timezone ?? 'auto');

  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  const payload = await response.json();
  const summary = summariseWeather(payload.hourly, { fromHour, toHour });
  const result = summary && {
    ...summary,
    venue: lookup.venue ?? null,
    window: {
      date,
      from: `${String(fromHour).padStart(2, '0')}:00`,
      to: `${String(toHour).padStart(2, '0')}:00`,
      timezone: payload.timezone_abbreviation ?? timezone ?? null,
    },
    source: { name: 'Open-Meteo historical weather', url: 'https://open-meteo.com' },
  };
  cache.set(key, result);
  return result;
}

export function clearRaceWeatherCache() {
  cache.clear();
}
