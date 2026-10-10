import { jest } from '@jest/globals';

const mockPrisma = {
  verifiedCode: { findMany: jest.fn(), findUnique: jest.fn() },
};
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: mockPrisma }));

let createApp;
let request;

beforeAll(async () => {
  ({ createApp } = await import('../src/app.js'));
  ({ default: request } = await import('supertest'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.verifiedCode.findMany.mockResolvedValue([]);
  mockPrisma.verifiedCode.findUnique.mockResolvedValue(null);
});

const row = (extra = {}) => ({
  slug: 'average-pit-loss',
  title: 'Average pit loss',
  description: 'Mean pit-lane time lost per stop, in seconds.',
  language: 'JavaScript',
  code: 'export function avgPitLoss(stops) {\n  return stops.reduce((a, s) => a + s.pit_duration, 0) / stops.length;\n}\n',
  tags: ['pits', 'strategy'],
  verifiedAt: new Date('2026-10-08T12:00:00Z'),
  ...extra,
});

const EXPECTED = {
  slug: 'average-pit-loss',
  name: 'Average pit loss',
  description: 'Mean pit-lane time lost per stop, in seconds.',
  language: 'JavaScript',
  code: 'export function avgPitLoss(stops) {\n  return stops.reduce((a, s) => a + s.pit_duration, 0) / stops.length;\n}\n',
  tags: ['pits', 'strategy'],
  approvedAt: '2026-10-08T12:00:00.000Z',
  endpoint: '/api/v1/code/average-pit-loss',
};

describe('GET /api/v1/code/:slug', () => {
  test('returns the script exactly as submitted, with its description and how to call it', async () => {
    mockPrisma.verifiedCode.findUnique.mockResolvedValue(row());

    const res = await request(createApp()).get('/api/v1/code/average-pit-loss');

    expect(res.status).toBe(200);
    expect(res.headers['api-version']).toBe('1');
    expect(res.body).toEqual({ data: EXPECTED });
    expect(mockPrisma.verifiedCode.findUnique.mock.calls[0][0].where).toEqual({ slug: 'average-pit-loss' });
  });

  test('never exposes who submitted or approved the code', async () => {
    mockPrisma.verifiedCode.findUnique.mockResolvedValue(row());
    await request(createApp()).get('/api/v1/code/average-pit-loss');
    const { select } = mockPrisma.verifiedCode.findUnique.mock.calls[0][0];
    expect(select).not.toHaveProperty('submitterId');
    expect(select).not.toHaveProperty('verifiedBy');
    expect(select).not.toHaveProperty('submitterEmail');
  });

  test('404 for an unknown slug', async () => {
    const res = await request(createApp()).get('/api/v1/code/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Code not found');
  });

  test.each(['Average-Pit-Loss', 'pit--loss', '-pit', 'a'.repeat(81), 'pit_loss'])('400 for a malformed slug %p, without a lookup', async (slug) => {
    const res = await request(createApp()).get(`/api/v1/code/${encodeURIComponent(slug)}`);
    expect(res.status).toBe(400);
    expect(mockPrisma.verifiedCode.findUnique).not.toHaveBeenCalled();
  });

  test('needs no sign-in', async () => {
    mockPrisma.verifiedCode.findUnique.mockResolvedValue(row());
    const res = await request(createApp()).get('/api/v1/code/average-pit-loss');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/code', () => {
  test('lists every approved script, newest first, in the same shape', async () => {
    mockPrisma.verifiedCode.findMany.mockResolvedValue([row(), row({ slug: 'tyre-delta', title: 'Tyre delta', description: null, tags: [] })]);

    const res = await request(createApp()).get('/api/v1/code');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(EXPECTED);
    expect(res.body.data[1]).toMatchObject({ slug: 'tyre-delta', description: null, tags: [], endpoint: '/api/v1/code/tyre-delta' });
    const args = mockPrisma.verifiedCode.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ slug: { not: '' } });
    expect(args.orderBy).toEqual([{ verifiedAt: 'desc' }, { id: 'asc' }]);
  });

  test('filters by language and tag', async () => {
    await request(createApp()).get('/api/v1/code?language=Python&tag=Pits');
    expect(mockPrisma.verifiedCode.findMany.mock.calls[0][0].where).toEqual({
      slug: { not: '' }, language: 'Python', tags: { has: 'pits' },
    });
  });

  test('rejects unknown languages and parameters with the standard 400', async () => {
    const res = await request(createApp()).get('/api/v1/code?language=Rust&author=me');
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({
      language: 'must be one of: JavaScript, Python',
      author: 'is not a supported parameter here',
    });
    expect(mockPrisma.verifiedCode.findMany).not.toHaveBeenCalled();
  });

  test('is listed in the API index', async () => {
    const res = await request(createApp()).get('/api/v1');
    expect(res.body.endpoints).toEqual(expect.arrayContaining(['GET /api/v1/code', 'GET /api/v1/code/:slug']));
  });
});
