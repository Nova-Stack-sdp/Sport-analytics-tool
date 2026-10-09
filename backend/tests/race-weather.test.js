import { jest } from '@jest/globals';

const mockPrisma = { externalApiCache: { findMany: jest.fn() } };
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let weather;
let createApp;
let request;

beforeAll(async () => {
  weather = await import('../src/lib/raceWeather.js');
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

// Open-Meteo's hourly shape for one day: 24 hours, every measure an array.
function day({ temperature = 20, humidity = 60, rain = 0, cloud = 50, wind = 10, direction = 180, code = 2 } = {}) {
  const hours = Array.from({ length: 24 }, (_, h) => `2023-04-16T${String(h).padStart(2, '0')}:00`);
  const at = (value) => hours.map((_, h) => (typeof value === 'function' ? value(h) : value));
  return {
    time: hours,
    temperature_2m: at(temperature),
    relative_humidity_2m: at(humidity),
    precipitation: at(rain),
    cloud_cover: at(cloud),
    wind_speed_10m: at(wind),
    wind_direction_10m: at(direction),
    weather_code: at(code),
  };
}
const WINDOW = { fromHour: 12, toHour: 17 };

describe('summariseWeather — the race window, read honestly', () => {
  test('averages only the window hours, and keeps the range', () => {
    // 10°C outside the window, 15..19°C across 12:00-16:00.
    const hourly = day({ temperature: (h) => (h >= 12 && h < 17 ? 15 + (h - 12) : 10) });
    const summary = weather.summariseWeather(hourly, WINDOW);
    expect(summary.hoursRead).toBe(5);
    expect(summary.airTemperatureC).toBe(17);
    expect(summary.airTemperatureRangeC).toEqual([15, 19]);
  });

  test('wind direction is averaged as an angle: 350° and 10° make north, not south', () => {
    const hourly = day({ direction: (h) => (h % 2 === 0 ? 350 : 10) });
    const summary = weather.summariseWeather(hourly, WINDOW);
    // Three hours at 350° and two at 10°: just west of north, nowhere near 180°.
    expect(summary.windDirectionDeg).toBe(358);
    expect(summary.windCompass).toBe('N');
  });

  test('rain is a total over the window, the rest are means', () => {
    const hourly = day({ rain: (h) => (h === 13 ? 1.2 : h === 14 ? 0.4 : 0), humidity: 70, cloud: 90 });
    const summary = weather.summariseWeather(hourly, WINDOW);
    expect(summary.precipitationMm).toBe(1.6);
    expect(summary.humidityPct).toBe(70);
    expect(summary.cloudCoverPct).toBe(90);
  });

  test('a window with no readings has no summary', () => {
    expect(weather.summariseWeather(day(), { fromHour: 30, toHour: 31 })).toBeNull();
    expect(weather.summariseWeather(null, WINDOW)).toBeNull();
  });
});

describe('the window condition', () => {
  test('the most common sky wins; a lone drizzle hour with a dry gauge does not make a wet race', () => {
    expect(weather.windowCode([0, 0, 51, 0, 1], 0.2)).toBe(0);
    expect(weather.conditionForCode(0).label).toBe('Clear');
  });

  test('enough rain makes it the wettest code seen', () => {
    expect(weather.windowCode([3, 3, 61, 63, 3], 1.4)).toBe(63);
    // Rain in the gauge but no wet code reported still reads as rain.
    expect(weather.windowCode([3, 3, 3], 0.8)).toBe(61);
  });

  test('ties go to the more severe sky', () => {
    expect(weather.windowCode([2, 3, 2, 3], 0)).toBe(3);
  });

  test('codes read into the conditions a header names', () => {
    expect(weather.conditionForCode(2)).toEqual({ key: 'partly-cloudy', label: 'Partly cloudy' });
    expect(weather.conditionForCode(3).key).toBe('overcast');
    expect(weather.conditionForCode(45).key).toBe('fog');
    expect(weather.conditionForCode(53).key).toBe('drizzle');
    expect(weather.conditionForCode(63).key).toBe('rain');
    expect(weather.conditionForCode(81).label).toBe('Rain showers');
    expect(weather.conditionForCode(95).key).toBe('storm');
  });

  test('dates come in the reports\' format or ISO', () => {
    expect(weather.isoDate('7/20/2025')).toBe('2025-07-20');
    expect(weather.isoDate('2023-04-16T00:00:00Z')).toBe('2023-04-16');
    expect(weather.isoDate('soon')).toBeNull();
  });
});

describe('GET /api/telemetry-tv/races/:slug/weather', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    weather.clearRaceWeatherCache();
  });

  test("reads the venue's archive for the report's own race date and names the window", async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([
      { key: 'indycar:long-beach-2023-race:v1', payload: { session: { sessionDate: '4/16/2023' } } },
    ]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ timezone_abbreviation: 'GMT-7', hourly: day({ temperature: 17, code: 3 }) }),
    }));
    const res = await request(createApp()).get('/api/telemetry-tv/races/long-beach-2023/weather');
    expect(res.status).toBe(200);
    const asked = new URL(global.fetch.mock.calls[0][0]);
    expect(asked.searchParams.get('start_date')).toBe('2023-04-16');
    expect(asked.searchParams.get('latitude')).toBe('33.765');
    expect(res.body.weather).toMatchObject({
      condition: { key: 'overcast', label: 'Overcast' },
      airTemperatureC: 17,
      venue: 'Streets of Long Beach, California',
      window: { date: '2023-04-16', from: '12:00', to: '17:00', timezone: 'GMT-7' },
      source: { name: 'Open-Meteo historical weather' },
    });
  });

  test('an archive that cannot be reached means no conditions, never a guess', async () => {
    mockPrisma.externalApiCache.findMany.mockResolvedValue([]);
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));
    const res = await request(createApp()).get('/api/telemetry-tv/races/toronto-2025/weather');
    expect(res.status).toBe(200);
    expect(res.body.weather).toBeNull();
  });

  test('a race with no venue lookup has no conditions', async () => {
    global.fetch = jest.fn();
    const res = await request(createApp()).get('/api/telemetry-tv/races/indianapolis-500-2024/weather');
    expect(res.body.weather).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
