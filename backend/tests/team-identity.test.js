import { NEUTRAL_TEAM_COLOR, teamIdentity, teamKey } from '../src/lib/teamIdentity.js';

test('every naming of a team maps to the same key', () => {
  expect(teamKey('Oracle Red Bull Racing')).toBe('redbull');
  expect(teamKey('Red Bull Racing')).toBe('redbull');
  expect(teamKey('Visa Cash App RB F1 Team')).toBe('racingbulls');
  expect(teamKey('Racing Bulls')).toBe('racingbulls');
  expect(teamKey('Haas F1 Team')).toBe('haas');
});

test('known teams get their colour and code; the whole grid is covered, not three teams', () => {
  expect(teamIdentity('McLaren')).toEqual({ color: '#FF8000', code: 'MCL' });
  expect(teamIdentity('Aston Martin')).toEqual({ color: '#229971', code: 'AMR' });
  expect(teamIdentity('Kick Sauber')).toEqual({ color: '#52E252', code: 'SAU' });
  for (const name of ['Williams', 'Alpine', 'Haas F1 Team', 'Racing Bulls', 'Ferrari', 'Mercedes', 'Red Bull Racing']) {
    expect(teamIdentity(name).color).not.toBe(NEUTRAL_TEAM_COLOR);
  }
});

test('a team without a known colour is grey rather than a guessed colour', () => {
  expect(teamIdentity('Cadillac')).toEqual({ color: NEUTRAL_TEAM_COLOR, code: 'CAD' });
  expect(teamIdentity('Brand New Racing Team')).toEqual({ color: NEUTRAL_TEAM_COLOR, code: 'BNR' });
  expect(teamIdentity(null)).toEqual({ color: NEUTRAL_TEAM_COLOR, code: null });
});
