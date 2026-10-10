import { lapNarrationCandidates, raceStateContext } from './lapNarration';

// Three cars over five laps. Car 2 takes the lead on lap 3; a caution covers
// laps 3-4, and car 1 stops under it on lap 4, rejoining P3; car 3 passes
// car 1 for P2 on lap 4 and, on the lap-5 restart, car 1 passes car 3 back.
// A crash is logged on lap 3 for Cy Cole, who was running P3.
const RACE = {
  session: { totalLaps: 5 },
  classification: [
    { CarNumber: '1', DriverName: 'Ann Able', PositionStart: 1, PositionFinish: 2 },
    { CarNumber: '2', DriverName: 'Ben Best', PositionStart: 2, PositionFinish: 1 },
    { CarNumber: '3', DriverName: 'Cole, Cy', PositionStart: 3, PositionFinish: 3 },
  ],
  lapChart: {
    positions: {
      1: { 1: '1', 2: '2', 3: '3' },
      2: { 1: '1', 2: '2', 3: '3' },
      3: { 1: '2', 2: '1', 3: '3' },
      4: { 1: '2', 2: '3', 3: '1' },
      5: { 1: '2', 2: '1', 3: '3' },
    },
  },
  leaders: [
    { car: '1', driver: 'Ann Able', from: 1, to: 2, laps: 2 },
    { car: '2', driver: 'Ben Best', from: 3, to: 5, laps: 3 },
  ],
  leaderLaps: [{ lap: 3, car: '2', diff: '00:01.2340' }],
  cautions: [{ from: 3, to: 4, laps: 2 }],
  pitStops: [{ car: '1', driver: 'Ann Able', stops: [{ raceLap: 4 }] }],
  events: [{ type: 'crash', lap: 3, drivers: ['Cy Cole'] }],
};

const find = (candidates, type, at) => candidates.find((c) => c.type === type && c.at === at);

describe('each moment says what happened, then why it matters', () => {
  const candidates = lapNarrationCandidates(RACE, { lap: 5, isFinished: false });

  test('the start: who leads the field away, and how many', () => {
    expect(find(candidates, 'green_flag', 1)).toMatchObject({
      text: 'Race start: Lap 1.',
      context: 'Ann Able leads the field away · 3 cars running',
    });
  });

  test('a lead change: who lost it and for how long, which change it is, the grid, the gap', () => {
    expect(find(candidates, 'lead_change', 3)).toMatchObject({
      text: 'Lead change: Ben Best takes the lead from Ann Able.',
      context: 'Ann Able had led since lap 1 · first lead change of the race · Best started P2 · leads by 1.2s',
    });
  });

  test('a crash: where the car was running and the caution it brought out', () => {
    expect(find(candidates, 'crash', 3)).toMatchObject({
      text: 'Crash on lap 3: Cy Cole.',
      context: 'Cy Cole was running P3 · brings out the first caution (laps 3–4)',
    });
  });

  test('a pit stop: from where, which stop, under caution, and where the car rejoined', () => {
    expect(find(candidates, 'pit_stop', 4)).toMatchObject({
      text: 'Pit stop: Ann Able stops on lap 4.',
      context: 'from P2 · first stop · under caution — the cheap stop · rejoins P3',
    });
  });

  test('an overtake: where the mover came from, the grid, and where the passed car drops', () => {
    expect(find(candidates, 'overtake', 4)).toMatchObject({
      text: 'Overtake: Cy Cole moves ahead of Ann Able for P2.',
      context: 'up from P3 last lap · 1 place gained since starting P3 · Ann Able drops to P3',
    });
    // The pass back on lap 5 comes straight after the caution: a restart.
    expect(find(candidates, 'overtake', 5).context).toMatch(/^on the restart · up from P3 last lap/);
  });

  test('every candidate has its own id, so nothing is said twice', () => {
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
  });
});

test('the finish: the winner, from where, laps led, and the race in numbers', () => {
  const finished = lapNarrationCandidates(RACE, { lap: 5, isFinished: true });
  expect(find(finished, 'finish', 5)).toMatchObject({
    text: 'Race finished: Ben Best wins.',
    context: 'from P2 on the grid · led 3 laps · 1 lead change · 1 caution',
  });
});

test('nothing from beyond the cursor; no race, no candidates', () => {
  expect(lapNarrationCandidates(RACE, { lap: 2 }).some((c) => c.type === 'lead_change')).toBe(false);
  expect(lapNarrationCandidates(null, { lap: 3 })).toEqual([]);
  expect(lapNarrationCandidates(RACE, { lap: 0 })).toEqual([]);
});

test('a broadcast event gains where the race stood on its lap', () => {
  expect(raceStateContext(RACE, 4)).toBe('Lap 4 of 5 · Ben Best leads · caution out');
  expect(raceStateContext(RACE, 2)).toBe('Lap 2 of 5 · Ann Able leads');
  expect(raceStateContext(RACE, null)).toBeNull();
});
