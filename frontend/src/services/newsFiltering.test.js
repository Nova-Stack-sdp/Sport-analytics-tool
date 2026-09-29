import { filterNewsItems } from './newsFiltering';

const catalog = {
  drivers: [{ id: 'norris', name: 'Lando Norris' }],
  teams: [{ id: 'ferrari', name: 'Scuderia Ferrari' }],
};

const stories = [
  { id: '1', title: 'Norris targets another podium', summary: '' },
  { id: '2', title: 'Ferrari reveal their latest upgrade', summary: '' },
  { id: '3', title: 'Barcelona prepares for the Spanish Grand Prix', summary: '' },
  { id: '4', title: 'Formula 1 changes its technical regulations', summary: '' },
  { id: '5', title: 'Azerbaijan GP qualifying results', summary: '' },
];

const preferences = {
  followedDriverIds: ['norris'],
  followedTeamIds: ['ferrari'],
};

describe('newsFiltering', () => {
  test('builds For You from followed drivers, teams and races', () => {
    expect(filterNewsItems(stories, 'for-you', preferences, catalog).map((item) => item.id))
      .toEqual(['1', '2']);
  });

  test('supports driver and team preference filters plus current race coverage', () => {
    expect(filterNewsItems(stories, 'drivers', preferences, catalog).map((item) => item.id))
      .toEqual(['1']);
    expect(filterNewsItems(stories, 'teams', preferences, catalog).map((item) => item.id))
      .toEqual(['2']);
    expect(filterNewsItems(stories, 'races', preferences, catalog).map((item) => item.id))
      .toEqual(['3', '5']);
  });
});
