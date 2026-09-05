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

});
