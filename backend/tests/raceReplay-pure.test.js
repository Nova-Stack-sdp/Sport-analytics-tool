import { indexReplayContext, computeStateAtLap, buildLapSeries, safetyCarStateAt } from '../src/routes/raceReplay.js';

// A tiny, fully synthetic two-driver, three-lap session — enough to exercise
// every branch of computeStateAtLap without touching Prisma or the DB.
function buildFixtureEvents() {
  const session = {
    id: 's1',
    type: 'Race',
    meeting: { name: 'Test Grand Prix', circuit: { name: 'Test Circuit' } },
  };

  const entries = [
    { id: 'e1', driver: { driverNumber: 44, name: 'Driver A' }, team: { name: 'Team A' } },
    { id: 'e2', driver: { driverNumber: 1, name: 'Driver B' }, team: { name: 'Team B' } },
  ];

  const events = [
    // Driver A starts on pole, Driver B second.
    { eventType: 'grid_position', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:00:00Z', payload: { position: 1 } },
    { eventType: 'grid_position', entryId: 'e2', lapNumber: null, occurredAt: '2024-01-01T00:00:00Z', payload: { position: 2 } },

    // Lap 1 completes: A then B.
    { eventType: 'lap_completed', entryId: 'e1', lapNumber: 1, occurredAt: '2024-01-01T00:02:00Z', payload: { lap_time_ms: 90000 } },
    { eventType: 'lap_completed', entryId: 'e2', lapNumber: 1, occurredAt: '2024-01-01T00:02:05Z', payload: { lap_time_ms: 95000 } },

    // Lap 2: B overtakes A.
    { eventType: 'position_change', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:03:30Z', payload: { from_position: 1, to_position: 2 } },
    { eventType: 'position_change', entryId: 'e2', lapNumber: null, occurredAt: '2024-01-01T00:03:30Z', payload: { from_position: 2, to_position: 1 } },
    { eventType: 'lap_completed', entryId: 'e1', lapNumber: 2, occurredAt: '2024-01-01T00:04:00Z', payload: { lap_time_ms: 91000 } },
    { eventType: 'lap_completed', entryId: 'e2', lapNumber: 2, occurredAt: '2024-01-01T00:03:55Z', payload: { lap_time_ms: 90000 } },

    // Tyre stints: both start on soft, A pits onto hard after lap 1.
    { eventType: 'tyre_stint', entryId: 'e1', lapNumber: 1, occurredAt: '2024-01-01T00:00:00Z', payload: { compound: 'SOFT', stint_number: 1, start_lap: 1 } },
    { eventType: 'tyre_stint', entryId: 'e1', lapNumber: 2, occurredAt: '2024-01-01T00:00:00Z', payload: { compound: 'HARD', stint_number: 2, start_lap: 2 } },
    { eventType: 'tyre_stint', entryId: 'e2', lapNumber: 1, occurredAt: '2024-01-01T00:00:00Z', payload: { compound: 'SOFT', stint_number: 1, start_lap: 1 } },

    // Lap 3 (final): B wins.
    { eventType: 'lap_completed', entryId: 'e1', lapNumber: 3, occurredAt: '2024-01-01T00:06:00Z', payload: { lap_time_ms: 91500 } },
    { eventType: 'lap_completed', entryId: 'e2', lapNumber: 3, occurredAt: '2024-01-01T00:05:50Z', payload: { lap_time_ms: 91300 } },
    { eventType: 'classification', entryId: 'e1', lapNumber: null, occurredAt: '2024-01-01T00:06:10Z', payload: { final_position: 2, points: 18, status: 'finished' } },
    { eventType: 'classification', entryId: 'e2', lapNumber: null, occurredAt: '2024-01-01T00:06:00Z', payload: { final_position: 1, points: 25, status: 'finished' } },

    // A safety car period flagged on lap 2.
    { eventType: 'flag_event', entryId: null, lapNumber: 2, occurredAt: '2024-01-01T00:03:00Z', payload: { flag: 'safety_car' } },

    // Before lap 1's completion timestamp (00:02:00-00:02:05Z), so it's
    // already "in the past" by the time lap 1 finishes.
    { eventType: 'weather_snapshot', entryId: null, lapNumber: null, occurredAt: '2024-01-01T00:01:30Z', payload: { air_temp: 25, track_temp: 40, humidity: 50, rainfall: 0, wind_speed: 3 } },
  ];

  return { session, entries, events };
}

describe('computeStateAtLap', () => {
  test('before any lap completes, positions fall back to the grid', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 0);

    expect(state.leaderboard.map((d) => d.entryId)).toEqual(['e1', 'e2']); // grid order: A then B
    expect(state.atEnd).toBe(false);
  });

  test('reflects a position change once its lap has completed', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 2);

    expect(state.leaderboard[0].entryId).toBe('e2'); // B is now leading
    expect(state.leaderboard[0].tyreCompound).toBe('SOFT');
    expect(state.leaderboard[1].entryId).toBe('e1');
    expect(state.leaderboard[1].tyreCompound).toBe('HARD'); // A pitted after lap 1
  });

  test('surfaces the safety car flag once its lap is reached', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const before = computeStateAtLap(context, 1);
    expect(before.recentRaceControl).toHaveLength(0);

    const after = computeStateAtLap(context, 2);
    expect(after.recentRaceControl).toHaveLength(1);
    expect(after.recentRaceControl[0].flag).toBe('safety_car');
    expect(before.safetyCar).toBeNull();
    expect(after.safetyCar).toBe('SC');
  });

  test('uses real classification for the final positions once the last lap is reached', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 3);

    expect(state.atEnd).toBe(true);
    expect(state.leaderboard[0]).toMatchObject({ entryId: 'e2', position: 1, status: 'finished' });
    expect(state.leaderboard[1]).toMatchObject({ entryId: 'e1', position: 2, status: 'finished' });
  });

  test('clamps a lap number past the end of the session to the last lap', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 999);

    expect(state.lap).toBe(3);
    expect(state.atEnd).toBe(true);
  });

  test('never fabricates x/y position — always null, since no telemetry is synced', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 2);
    for (const driver of state.leaderboard) {
      expect(driver.x).toBeNull();
      expect(driver.y).toBeNull();
    }
  });

  test('carries the latest weather snapshot as of the cutoff', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const state = computeStateAtLap(context, 1);
    expect(state.weather).toMatchObject({ airTemperature: 25, trackTemperature: 40 });
  });
});

describe('buildLapSeries', () => {
  test('carries one column per lap, indexed by lap - 1', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const series = buildLapSeries(context);
    const a = series.drivers.find((d) => d.entryId === 'e1');

    expect(series.totalLaps).toBe(3);
    expect(a.lapTimeSeconds).toEqual([90, 91, 91.5]);
    // The position change lands on lap 2, and the classification replaces
    // every position at the flag — lap 3 is the only lap read from it.
    expect(a.position).toEqual([1, 2, 2]);
    expect(a.compound).toEqual(['SOFT', 'HARD', 'HARD']);
    expect(a.stintNumber).toEqual([1, 2, 2]);
    // The interval to the car ahead is null for whoever leads that lap — e1
    // on lap 1, e2 afterwards; behind the leader it is the two lap records'
    // own timestamps subtracted.
    expect(a.gapToAhead).toEqual([null, 5, 10]);
    expect(a.status).toBe('finished');
  });

  test('holds exactly what /state answers for the same lap', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const series = buildLapSeries(context);
    const state = computeStateAtLap(context, 2);

    for (const driver of series.drivers) {
      const onLap = state.leaderboard.find((d) => d.entryId === driver.entryId);
      expect(driver.lapTimeSeconds[1]).toBe(onLap.lastLapTime);
      expect(driver.position[1]).toBe(onLap.position);
      expect(driver.compound[1]).toBe(onLap.tyreCompound);
      expect(driver.stintNumber[1]).toBe(onLap.stintNumber);
      expect(driver.gapToAhead[1]).toBe(onLap.gapToAhead);
    }
  });

  test('lists the drivers in the order they finished', () => {
    const { session, entries, events } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, events);

    const series = buildLapSeries(context);

    expect(series.drivers.map((d) => d.entryId)).toEqual(['e2', 'e1']);
    expect(series.sessionId).toBe('s1');
  });

  test('leaves a lap a driver has no record of null rather than filling it in', () => {
    const session = {
      id: 's2',
      type: 'Race',
      meeting: { name: 'Test Grand Prix', circuit: { name: 'Test Circuit' } },
    };
    const entries = [
      { id: 'e1', driver: { driverNumber: 1, name: 'Driver A' }, team: { name: 'Team A' } },
    ];
    // Lap 2 is simply absent from the log — nothing about it can be reported.
    const events = [
      { eventType: 'lap_completed', entryId: 'e1', lapNumber: 1, occurredAt: '2024-01-01T00:02:00Z', payload: { lap_time_ms: 90000 } },
      { eventType: 'lap_completed', entryId: 'e1', lapNumber: 3, occurredAt: '2024-01-01T00:06:00Z', payload: { lap_time_ms: 92000 } },
    ];
    const context = indexReplayContext(session, entries, events);

    const series = buildLapSeries(context);

    expect(series.totalLaps).toBe(3);
    expect(series.drivers[0].lapTimeSeconds).toEqual([90, null, 92]);
  });

  test('gives every driver empty columns when no lap was ever completed', () => {
    const { session, entries } = buildFixtureEvents();
    const context = indexReplayContext(session, entries, []);

    const series = buildLapSeries(context);

    expect(series.totalLaps).toBe(0);
    expect(series.drivers).toHaveLength(2);
    for (const driver of series.drivers) {
      expect(driver.lapTimeSeconds).toEqual([]);
      expect(driver.status).toBeNull();
    }
  });
});

describe('safetyCarStateAt', () => {
  const msg = (lapNumber, text) => ({ eventType: 'race_control_message', lapNumber, payload: { category: 'SafetyCar', message_text: text } });
  const flag = (lapNumber, f) => ({ eventType: 'flag_event', lapNumber, payload: { flag: f } });
  const raceControl = [
    msg(10, 'SAFETY CAR DEPLOYED'),
    flag(11, 'green'), // a sector clear is stored as green and must not end the period
    msg(13, 'SAFETY CAR IN THIS LAP'),
    msg(30, 'VIRTUAL SAFETY CAR DEPLOYED'),
    msg(31, 'VIRTUAL SAFETY CAR ENDING'),
    flag(40, 'safety_car'),
    flag(44, 'red'),
  ];

  test.each([
    [9, null],
    [10, 'SC'],
    [12, 'SC'],
    [13, null], // not still shown because the deploy message is among the last five
    [30, 'VSC'],
    [31, null],
    [42, 'SC'],
    [44, null],
  ])('at lap %i the state is %p', (lap, expected) => {
    expect(safetyCarStateAt(raceControl, lap)).toBe(expected);
  });
});

