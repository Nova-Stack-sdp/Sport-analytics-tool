import {
  OFFICIAL_2026_DRIVERS,
  OFFICIAL_2026_TEAMS,
  preferenceCatalog,
} from './f1Catalog';

describe('f1Catalog', () => {
  test('contains the full 2026 grid shown by the driver and team pages', () => {
    expect(OFFICIAL_2026_DRIVERS).toHaveLength(22);
    expect(OFFICIAL_2026_TEAMS).toHaveLength(11);
    expect(OFFICIAL_2026_DRIVERS).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Lando Norris', teamName: 'McLaren' }),
      expect.objectContaining({ name: 'Valtteri Bottas', teamName: 'Cadillac' }),
    ]));
  });

  test('uses stable preference ids for a live catalogue', () => {
    expect(preferenceCatalog(
      [{ id: 'database-id', name: 'Red Bull Racing' }],
      OFFICIAL_2026_TEAMS,
      'team'
    )).toEqual([expect.objectContaining({ id: 'team-red-bull-racing' })]);
  });
});
