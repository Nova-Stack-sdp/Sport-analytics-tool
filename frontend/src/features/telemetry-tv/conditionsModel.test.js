import { buildConditionsModel } from './conditionsModel';

// The two conditions notes the backend actually serves today.
const TORONTO = {
  weather: {
    note: 'Dry race conditions with quick grip evolution; no rain calls and the circuit ramps up quickly from warm-up into green.',
    grip: 'The field settles into rhythm quickly, making small pace gains and carefully managed tire life more valuable than raw top speed.',
  },
};

const LONG_BEACH = {
  weather: {
    note: 'A dry 85-lap run through the Long Beach streets, decided by tire life and pit timing around two cautions.',
    grip: 'The alternate tire hits a performance cliff after about 17 laps; the crossover to primaries lands 5-7 laps after the lap-26 restart.',
  },
};

describe('buildConditionsModel', () => {
  test('reads the served Toronto note as dry with building grip', () => {
    const conditions = buildConditionsModel(TORONTO);

    expect(conditions.sky).toEqual({ key: 'dry', label: 'Dry' });
    expect(conditions.gripTrend).toEqual({ key: 'rising', label: 'Grip building' });
    expect(conditions.source).toBe('Curator read');
    // The note's own text is carried through: the glyph summarises it, it
    // never replaces it.
    expect(conditions.note).toBe(TORONTO.weather.note);
  });

  test('does not let a ruled-out rain call turn a dry race wet', () => {
    expect(buildConditionsModel(TORONTO).sky.key).toBe('dry');
    expect(buildConditionsModel({
      weather: { note: 'A dry afternoon with no showers expected before the flag.' },
    }).sky.key).toBe('dry');
  });

  test("does not read the tyre cliff in the grip paragraph as the track losing grip", () => {
    const conditions = buildConditionsModel(LONG_BEACH);

    expect(conditions.sky.key).toBe('dry');
    expect(conditions.gripTrend).toBeNull();
    expect(conditions.heat).toBeNull();
  });

  test('classifies a wet broadcast and a showery one honestly', () => {
    // Rain named and a dry track in the same sentence is a mixed day, not a
    // wet one: the note has to name rain for the glyph to leave the sun.
    expect(buildConditionsModel({
      weather: { note: 'Showers early on, then a dry afternoon for the run to the flag.' },
    }).sky.key).toBe('mixed');
    expect(buildConditionsModel({
      weather: { note: 'Heavy rain, standing water at turn 5.' },
    }).sky.key).toBe('wet');
    expect(buildConditionsModel({
      weather: { note: 'Rain arrived on lap 30 and the track never fully dried.' },
    }).sky.key).toBe('wet');
  });

  test('names a temperature swing only when the note states one', () => {
    expect(buildConditionsModel({
      weather: { note: 'A dry, humid afternoon with track temperatures climbing.' },
    }).heat).toEqual({ key: 'hot', label: 'Hot day' });
    expect(buildConditionsModel({
      weather: { note: 'A dry but cool run through the streets.' },
    }).heat).toEqual({ key: 'cool', label: 'Cool day' });
  });

  test('says "not stated" rather than guessing a sky from unclassified words', () => {
    const conditions = buildConditionsModel({
      weather: { note: 'Conditions were reported stable through the middle stint.' },
    });

    expect(conditions.sky.key).toBe('unknown');
    expect(conditions.summary).toBe('Not stated');
  });

  test('summarises only the facts it actually derived', () => {
    expect(buildConditionsModel(TORONTO).summary).toBe('Dry · Grip building');
  });

  test('returns null when the bundle ships no conditions text at all', () => {
    expect(buildConditionsModel(null)).toBeNull();
    expect(buildConditionsModel({})).toBeNull();
    expect(buildConditionsModel({ weather: null })).toBeNull();
    expect(buildConditionsModel({ weather: { note: '   ', grip: '' } })).toBeNull();
  });
});
