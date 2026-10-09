// Client helpers for approved code (public API + admin removal).
function loadClient() {
  let client;
  jest.isolateModules(() => {
    client = require('./client');
  });
  return client;
}

const ok = (body) => ({ ok: true, status: 200, json: jest.fn().mockResolvedValue(body) });

describe('approved code client helpers', () => {
  const originalApiUrl = process.env.REACT_APP_API_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.REACT_APP_API_URL = 'https://api.example.test';
    global.fetch = jest.fn().mockResolvedValue(ok({ data: [] }));
  });

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.REACT_APP_API_URL;
    else process.env.REACT_APP_API_URL = originalApiUrl;
    global.fetch = originalFetch;
  });

  test('public list and detail call the v1 code endpoints', async () => {
    const client = loadClient();
    await client.listPublicCode();
    await client.listPublicCode({ language: 'Python', tag: 'pits' });
    await client.getPublicCode('average-pit-loss');

    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/v1/code',
      'https://api.example.test/api/v1/code?language=Python&tag=pits',
      'https://api.example.test/api/v1/code/average-pit-loss',
    ]);
  });

  test('publicCodeUrl turns an endpoint into the full address to call', () => {
    const client = loadClient();
    expect(client.publicCodeUrl('/api/v1/code/average-pit-loss')).toBe('https://api.example.test/api/v1/code/average-pit-loss');
  });

  test('admin list and removal call the admin endpoints', async () => {
    const client = loadClient();
    await client.listPublishedCode();
    await client.removePublishedCode('vc 1');

    expect(global.fetch.mock.calls.map(([url, opts]) => [url, opts.method ?? 'GET'])).toEqual([
      ['https://api.example.test/api/admin/verified-code', 'GET'],
      ['https://api.example.test/api/admin/verified-code/vc%201', 'DELETE'],
    ]);
  });
});
