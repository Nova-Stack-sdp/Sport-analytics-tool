import { jest } from '@jest/globals';
import {
  apiSports,
  apiSportsCacheDurations,
  clearApiSportsCache,
} from '../src/lib/apiSports.js';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('API-Sports response cache', () => {
  beforeEach(() => {
    clearApiSportsCache();
    process.env.API_SPORTS_KEY = 'test-key';
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    delete process.env.API_SPORTS_KEY;
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('caches a successful response and uses direct API-Sports authentication', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({ response: [{ id: 1 }] }));

    await expect(apiSports('/teams')).resolves.toEqual([{ id: 1 }]);
    await expect(apiSports('/teams')).resolves.toEqual([{ id: 1 }]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://v1.formula-1.api-sports.io/teams',
      { headers: { 'x-apisports-key': 'test-key' } },
    );
  });

  test('shares one in-flight request between concurrent callers', async () => {
    let finishRequest;
    global.fetch = jest.fn(() => new Promise((resolve) => { finishRequest = resolve; }));

    const first = apiSports('/drivers');
    const second = apiSports('/drivers');
    finishRequest(response({ response: [{ number: 1 }] }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ number: 1 }],
      [{ number: 1 }],
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('refreshes a successful response after 24 hours', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ response: [{ id: 1 }] }))
      .mockResolvedValueOnce(response({ response: [{ id: 2 }] }));

    await expect(apiSports('/teams')).resolves.toEqual([{ id: 1 }]);
    Date.now.mockReturnValue(1_000 + apiSportsCacheDurations.successMs + 1);
    await expect(apiSports('/teams')).resolves.toEqual([{ id: 2 }]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('serves stale data and backs off when a refresh fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ response: [{ id: 1 }] }))
      .mockResolvedValueOnce(response({}, 503));

    await apiSports('/teams');
    Date.now.mockReturnValue(1_000 + apiSportsCacheDurations.successMs + 1);

    await expect(apiSports('/teams')).resolves.toEqual([{ id: 1 }]);
    await expect(apiSports('/teams')).resolves.toEqual([{ id: 1 }]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('rejects provider errors returned with HTTP 200 and backs off retries', async () => {
    global.fetch = jest.fn().mockResolvedValue(response({
      errors: { requests: 'Daily request limit reached' },
      response: [],
    }));

    await expect(apiSports('/teams')).rejects.toThrow('Daily request limit reached');
    await expect(apiSports('/teams')).rejects.toThrow('Daily request limit reached');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects requests when the API key is missing', async () => {
    delete process.env.API_SPORTS_KEY;
    global.fetch = jest.fn();

    await expect(apiSports('/teams')).rejects.toThrow('API_SPORTS_KEY is not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
