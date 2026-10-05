import { filterNewsItems } from './newsFiltering';

const catalog = {
  drivers: [{
    id: 'driver-lando-norris',
    sourceId: 'norris',
    name: 'Lando Norris',
    teamName: 'McLaren',
  }],
  teams: [{ id: 'team-scuderia-ferrari', sourceId: 'ferrari', name: 'Scuderia Ferrari' }],
};

const stories = [
  { id: '1', title: 'Norris targets another podium', summary: '', publishedAt: '2026-10-03T12:00:00Z' },
  { id: '2', title: 'Ferrari reveal their latest upgrade', summary: '', publishedAt: '2026-10-03T11:00:00Z' },
  { id: '3', title: 'Bahrain Grand Prix in Malaysia preview', summary: 'Teams arrive at Sepang.', publishedAt: '2026-10-03T10:00:00Z' },
  { id: '4', title: 'Formula 1 changes its technical regulations', summary: '', publishedAt: '2026-10-03T09:00:00Z' },
  { id: '5', title: 'Mercedes prepares for Malaysia qualifying', summary: '', publishedAt: '2026-10-02T12:00:00Z' },
  { id: '6', title: 'Azerbaijan GP qualifying results', summary: '', publishedAt: '2026-09-20T12:00:00Z' },
  { id: '7', title: 'McLaren prepare their latest upgrade', summary: '', publishedAt: '2026-09-19T12:00:00Z' },
];

const preferences = {
  followedDriverIds: ['norris'],
  followedTeamIds: ['ferrari'],
};

describe('newsFiltering', () => {
  test('builds For You from followed drivers, their teams, and followed teams', () => {
    expect(filterNewsItems(stories, 'for-you', preferences, catalog).map((item) => item.id))
      .toEqual(['1', '2', '7']);
  });

  test('supports driver and team preference filters', () => {
    expect(filterNewsItems(stories, 'drivers', preferences, catalog).map((item) => item.id))
      .toEqual(['1']);
    expect(filterNewsItems(stories, 'teams', preferences, catalog).map((item) => item.id))
      .toEqual(['2']);
  });
});
