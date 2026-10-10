import { jest } from '@jest/globals';

const mockPrisma = {};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/openf1/races/barcelona-2026/raw', () => {
  test('bundles untouched OpenF1 records needed by the derivation pipeline', async () => {
    const payloads = {
      sessionsByKey: [{
        session_key: 11307,
        session_type: 'Race',
        session_name: 'Race',
        meeting_key: 1287,
      }],
      meetings: [{ meeting_key: 1287, meeting_name: 'Barcelona-Catalunya Grand Prix' }],
      drivers: [{ session_key: 11307, driver_number: 63, full_name: 'George Russell' }],
      laps: [{ session_key: 11307, driver_number: 63, lap_number: 1, lap_duration: 81.2 }],
      pit: [{ session_key: 11307, driver_number: 63, lap_number: 20 }],
      stints: [{ session_key: 11307, driver_number: 63, stint_number: 1 }],
      position: [{ session_key: 11307, driver_number: 63, position: 1 }],
      car_data: [{ session_key: 11307, driver_number: 63, speed: 287 }],
      race_control: [{ session_key: 11307, category: 'Flag', flag: 'GREEN' }],
      weather: [{ session_key: 11307, air_temperature: 26 }],
      session_result: [{ session_key: 11307, driver_number: 63, position: 1 }],
      meetingSessions: [
        { session_key: 11303, session_name: 'Qualifying', meeting_key: 1287 },
        { session_key: 11307, session_name: 'Race', meeting_key: 1287 },
      ],
      starting_grid: [{ session_key: 11303, driver_number: 63, position: 1 }],
    };

    global.fetch.mockImplementation(async (url) => {
      const resource = url.pathname.split('/').pop();
      let payload;
      if (resource === 'sessions' && url.searchParams.has('session_key')) {
        payload = payloads.sessionsByKey;
      } else if (resource === 'sessions') {
        payload = payloads.meetingSessions;
      } else {
        payload = payloads[resource];
      }
      return { status: 200, text: async () => JSON.stringify(payload) };
    });

    const response = await request(createApp()).get('/api/openf1/races/barcelona-2026/raw');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      session_key: 11307,
      session: payloads.sessionsByKey,
      meeting: payloads.meetings,
      drivers: payloads.drivers,
      laps: payloads.laps,
      pit: payloads.pit,
      stints: payloads.stints,
      position: payloads.position,
      car_data: payloads.car_data,
      race_control: payloads.race_control,
      weather: payloads.weather,
      session_result: payloads.session_result,
      starting_grid: payloads.starting_grid,
    });
    expect(response.body).not.toHaveProperty('stats');

    const sessionUrl = global.fetch.mock.calls[0][0];
    expect(sessionUrl.toString()).toBe(
      'https://api.openf1.org/v1/sessions?session_key=11307'
    );

    const gridUrl = global.fetch.mock.calls
      .map(([url]) => url)
      .find((url) => url.pathname.endsWith('/starting_grid'));
    expect(gridUrl.searchParams.get('session_key')).toBe('11303');

    const carDataUrl = global.fetch.mock.calls
      .map(([url]) => url)
      .find((url) => url.pathname.endsWith('/car_data'));
    expect(carDataUrl.searchParams.get('session_key')).toBe('11307');
  });

  test('passes through OpenF1 authentication errors without making a bundle', async () => {
    const errorPayload = { detail: 'Authentication required' };
    global.fetch.mockResolvedValue({
      status: 401,
      text: async () => JSON.stringify(errorPayload),
    });

    const response = await request(createApp()).get('/api/openf1/races/barcelona-2026/raw');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorPayload);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns 502 for invalid JSON upstream payloads', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      text: async () => '{not valid json',
    });

    const response = await request(createApp()).get('/api/openf1/races/barcelona-2026/raw');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'OpenF1 returned an invalid JSON response' });
  });

  test('rejects non-race session types before any bundle is built', async () => {
    global.fetch.mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify([{ session_key: 11307, session_type: 'Practice', session_name: 'Practice 1', meeting_key: 1287 }]),
    });

    const response = await request(createApp()).get('/api/openf1/races/barcelona-2026/raw');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'The requested session is not a race' });
  });
});

describe('fetchSessionTrackTelemetryRaw (location data for track outlines)', () => {
  const session = { session_key: 11731, date_start: '2026-10-04T07:00:00+00:00', date_end: '2026-10-04T09:00:00+00:00' };
  // A race that started late: laps run after the scheduled end.
  const laps = Array.from({ length: 9 }, (_, i) => ({
    driver_number: 1,
    lap_number: i + 1,
    date_start: new Date(Date.parse('2026-10-04T08:33:00Z') + i * 100_000).toISOString(),
    lap_duration: 100,
  })).concat([{ driver_number: 4, lap_number: 1, date_start: '2026-10-04T08:33:01Z' }]);
  const onTrack = (start) => Array.from({ length: 30 }, (_, i) => ({
    driver_number: 1, date: new Date(Date.parse(start) + i * 1000).toISOString(), x: 100 + i, y: 7,
  }));

  test('fetches one lap of one car, by its real lap times, with date> / date<', async () => {
    const { fetchSessionTrackTelemetryRaw } = await import('../src/routes/openf1.js');
    global.fetch.mockImplementation(async (url) => {
      const resource = url.pathname.split('/').pop();
      const payload = resource === 'location' ? onTrack(url.searchParams.get('date>')) : { sessions: [session], laps }[resource];
      return { status: 200, text: async () => JSON.stringify(payload) };
    });

    const result = await fetchSessionTrackTelemetryRaw(11731);

    const locationUrls = global.fetch.mock.calls.map(([url]) => url).filter((url) => url.pathname.endsWith('/location'));
    expect(locationUrls).toHaveLength(1);
    const [url] = locationUrls;
    expect(url.searchParams.has('date_start')).toBe(false);
    expect(url.searchParams.get('driver_number')).toBe('1');
    // Lap 4 (a third of 9 laps) — after the scheduled 09:00 end.
    expect(url.searchParams.get('date>')).toBe('2026-10-04T08:38:00.000Z');
    expect(url.searchParams.get('date<')).toBe('2026-10-04T08:39:40.000Z');
    expect(result.location).toHaveLength(30);
  });

  test('moves on to the next lap when one has no location samples', async () => {
    const { fetchSessionTrackTelemetryRaw } = await import('../src/routes/openf1.js');
    let locationCalls = 0;
    global.fetch.mockImplementation(async (url) => {
      const resource = url.pathname.split('/').pop();
      if (resource === 'location') {
        locationCalls += 1;
        if (locationCalls === 1) return { status: 404, text: async () => JSON.stringify({ detail: 'No results found.' }) };
        return { status: 200, text: async () => JSON.stringify(onTrack(url.searchParams.get('date>'))) };
      }
      return { status: 200, text: async () => JSON.stringify({ sessions: [session], laps }[resource]) };
    });

    const result = await fetchSessionTrackTelemetryRaw(11731);
    expect(locationCalls).toBe(2);
    expect(result.location).toHaveLength(30);
  });

  test('buildWindowUrl writes the window as OpenF1 comparison filters', async () => {
    const { buildWindowUrl } = await import('../src/routes/openf1.js');
    const url = buildWindowUrl('car_data', 11307, Date.parse('2026-06-14T13:00:00Z'), Date.parse('2026-06-14T13:10:01Z'));
    expect(url.toString()).toBe(
      'https://api.openf1.org/v1/car_data?session_key=11307&date%3E=2026-06-14T13%3A00%3A00.000Z&date%3C=2026-06-14T13%3A10%3A01.000Z'
    );
  });
});

describe('representativeLapWindows', () => {
  test('a third of the way in, then later laps, then earlier ones, for the car with the most laps', async () => {
    const { representativeLapWindows } = await import('../src/routes/openf1.js');
    const laps = Array.from({ length: 6 }, (_, i) => ({ driver_number: 81, lap_number: i + 1, date_start: `2026-10-04T08:0${i}:00Z` }))
      .concat([{ driver_number: 1, lap_number: 1, date_start: '2026-10-04T08:00:00Z' }, { driver_number: 1, lap_number: 2, date_start: null }]);
    const windows = representativeLapWindows(laps);
    expect(windows.map((w) => w.lapNumber)).toEqual([3, 4, 5, 2, 1]);
    expect(windows.every((w) => w.driverNumber === 81)).toBe(true);
    expect(windows[0]).toMatchObject({ start: Date.parse('2026-10-04T08:02:00Z'), end: Date.parse('2026-10-04T08:03:00Z') });
  });

  test('no usable lap timing gives no windows', async () => {
    const { representativeLapWindows } = await import('../src/routes/openf1.js');
    expect(representativeLapWindows([])).toEqual([]);
    expect(representativeLapWindows({ detail: 'error' })).toEqual([]);
    expect(representativeLapWindows([{ driver_number: 1, lap_number: 1, date_start: null }])).toEqual([]);
  });
});
