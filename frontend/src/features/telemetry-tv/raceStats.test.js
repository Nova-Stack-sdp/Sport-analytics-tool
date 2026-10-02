import { buildLeadBattle, buildRaceOverview, driverDisplayName } from './raceStats';

describe('driverDisplayName', () => {
  it('flips "LastName, FirstName" into display order', () => {
    expect(driverDisplayName('Kirkwood, Kyle')).toBe('Kyle Kirkwood');
  });

  it('passes plain names through untouched', () => {
    expect(driverDisplayName('Kyle Kirkwood')).toBe('Kyle Kirkwood');
  });

  it('returns null for missing or blank values', () => {
    expect(driverDisplayName(null)).toBeNull();
    expect(driverDisplayName(undefined)).toBeNull();
    expect(driverDisplayName('   ')).toBeNull();
  });
});

describe('buildRaceOverview', () => {
  // Shaped on the real Long Beach bundle: the summary carries the race-level
  // numbers, stats carries the official versions that must win.
  const race = {
    session: { totalLaps: 85 },
    eventSummary: {
      raceTime: '01:43:17',
      avgSpeed: 97.171,
      passes: { total: 253, position: 142 },
      greenLaps: 78,
      cautionLaps: 7,
      leadChanges: 6,
      leadDrivers: 4,
    },
    stats: {
      bestLap: { sec: 67.9469, lap: 70, driver: 'Kirkwood, Kyle', mph: 104.27 },
      cautionCount: 2,
      leadChangesOfficial: 8,
      leadDriversOfficial: 4,
      mostLapsLed: { car: '27', driver: 'Kyle Kirkwood', laps: 53 },
    },
    podium: [{ pos: 1, car: '27', driver: 'Kirkwood, Kyle', team: 'Andretti', started: 1 }],
    pole: { car: '27', driver: 'Kirkwood, Kyle' },
  };

  it('reports winner, pole and most-laps-led in display order', () => {
    const overview = buildRaceOverview(race);
    expect(overview.winner).toEqual({
      driver: 'Kyle Kirkwood',
      car: '27',
      team: 'Andretti',
      started: 1,
    });
    expect(overview.pole).toEqual({ driver: 'Kyle Kirkwood', car: '27' });
    expect(overview.mostLapsLed).toEqual({ driver: 'Kyle Kirkwood', car: '27', laps: 53 });
    expect(overview.totalLaps).toBe(85);
  });

  it('keeps the fastest lap with its lap, driver and speed', () => {
    const overview = buildRaceOverview(race);
    expect(overview.fastestLap).toEqual({
      seconds: 67.9469,
      lap: 70,
      driver: 'Kyle Kirkwood',
      speedMph: 104.27,
    });
  });

  it('prefers the official stats over the event summary', () => {
    const overview = buildRaceOverview(race);
    expect(overview.leadChanges).toBe(8);
    expect(overview.leaderCount).toBe(4);
    expect(overview.cautions).toEqual({ count: 2, laps: 7 });
    expect(overview.greenLaps).toBe(78);
    expect(overview.passes).toEqual({ total: 253, position: 142 });
    expect(overview.averageSpeedMph).toBe(97.171);
    expect(overview.raceTime).toBe('01:43:17');
  });

  it('falls back to the event summary when official stats are absent', () => {
    const overview = buildRaceOverview({ eventSummary: race.eventSummary });
    expect(overview.leadChanges).toBe(6);
    expect(overview.leaderCount).toBe(4);
    expect(overview.cautions).toEqual({ count: null, laps: 7 });
  });

  it('returns null-safe tiles when the payload lacks the facts', () => {
    const overview = buildRaceOverview({ classification: [] });
    expect(overview.winner).toBeNull();
    expect(overview.pole).toBeNull();
    expect(overview.fastestLap).toBeNull();
    expect(overview.averageSpeedMph).toBeNull();
    expect(overview.raceTime).toBeNull();
    expect(overview.leadChanges).toBeNull();
    expect(overview.cautions).toEqual({ count: null, laps: null });
    expect(overview.passes).toBeNull();
    expect(overview.mostLapsLed).toBeNull();
  });

  it('handles a missing race entirely', () => {
    const overview = buildRaceOverview(null);
    expect(overview.winner).toBeNull();
    expect(overview.totalLaps).toBeNull();
  });
});

describe('buildLeadBattle', () => {
  const race = {
    leaders: [
      { car: '27', driver: 'Kirkwood, Kyle', from: 1, to: 22, laps: 22 },
      { car: '26', driver: 'Herta, Colton', from: 23, to: 30, laps: 8 },
      { car: '27', driver: 'Kirkwood, Kyle', from: 31, to: 85, laps: 55 },
    ],
    cautions: [
      { from: 50, to: 51, laps: 2 },
      { from: 10, to: 12, laps: 3 },
    ],
  };

  it('orders stretches by lap and totals laps led per driver', () => {
    const battle = buildLeadBattle(race);
    expect(battle.stretches.map((stretch) => stretch.fromLap)).toEqual([1, 23, 31]);
    expect(battle.totalLaps).toBe(85);
    expect(battle.lapsLed).toEqual([
      { car: '27', driver: 'Kyle Kirkwood', laps: 77 },
      { car: '26', driver: 'Colton Herta', laps: 8 },
    ]);
    expect(battle.leaderCar).toBe('27');
    expect(battle.leaderLaps).toBe(77);
  });

  it('marks only the most-laps-led driver on their stretches', () => {
    const battle = buildLeadBattle(race);
    const leaderStretches = battle.stretches.filter((stretch) => stretch.isLeader);
    expect(leaderStretches.map((stretch) => stretch.fromLap)).toEqual([1, 31]);
    expect(battle.stretches.find((stretch) => stretch.car === '26').isLeader).toBe(false);
  });

  it('keeps caution windows in lap order', () => {
    const battle = buildLeadBattle(race);
    expect(battle.cautions).toEqual([
      { fromLap: 10, toLap: 12 },
      { fromLap: 50, toLap: 51 },
    ]);
  });

  it('drops malformed stretches and cautions instead of guessing', () => {
    const battle = buildLeadBattle({
      leaders: [
        { car: '27', driver: 'Kirkwood, Kyle', from: 5, to: 1 },
        { car: '26', driver: 'Herta, Colton', from: 1, to: 4 },
      ],
      cautions: [{ from: null, to: 2 }],
    });
    expect(battle.stretches).toHaveLength(1);
    expect(battle.cautions).toHaveLength(0);
  });

  it('returns null when the payload has no lead stretches', () => {
    expect(buildLeadBattle({ leaders: [] })).toBeNull();
    expect(buildLeadBattle({})).toBeNull();
    expect(buildLeadBattle(null)).toBeNull();
  });
});
