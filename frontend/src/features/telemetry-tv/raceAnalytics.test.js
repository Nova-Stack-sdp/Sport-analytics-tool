import {
  buildDriverStats,
  buildFinishSummary,
  buildLapTrend,
  formatDurationSeconds,
  formatGapSeconds,
  formatLapSeconds,
  marginDelta,
  parseDuration,
  parseLapTime,
} from './raceAnalytics';

const TORONTO_RACE = {
  session: { totalLaps: 3 },
  leaderLaps: [
    { lap: 1, car: '26', driver: 'Herta, Colton', lapTime: '01:04.0188', speed: 100.433, diff: '00:01.0451', flag: 'Green' },
    { lap: 2, car: '5', driver: "O'Ward, Pato", lapTime: '01:03.5827', speed: 101.122, diff: '00:01.0583', flag: 'Yellow' },
    { lap: 3, car: '5', driver: "O'Ward, Pato", lapTime: '01:01.6540', speed: 104.285, diff: 'No Time', flag: 'Checker' },
  ],
  classification: [
    {
      CarNumber: '5',
      DriverName: "Pato O'Ward",
      TeamName: 'Arrow McLaren',
      PositionStart: 10,
      PositionFinish: 1,
      ElapsedTime: '01:48:23.9092',
      LapsComplete: 3,
      BestLapTime: '01:02.1675',
      BestSpeed: 103.424,
      SpeedAvg: 88.972,
      LapsLed: 2,
      TimesLed: 1,
      PitStops: 3,
      Status: 'Running',
      PointsEarned: 51,
    },
    {
      CarNumber: '26',
      DriverName: 'Colton Herta',
      TeamName: 'Andretti',
      PositionStart: 1,
      PositionFinish: 2,
      ElapsedTime: '01:48:26.0699',
      LapsComplete: 3,
      BestLapTime: '01:01.6540',
      BestSpeed: 104.285,
      SpeedAvg: 88.942,
      LapsLed: 1,
      TimesLed: 1,
      PitStops: 3,
      Status: 'Running',
      PointsEarned: 34,
    },
    {
      CarNumber: '6',
      DriverName: 'Nolan Siegel',
      TeamName: 'Arrow McLaren',
      PositionStart: 12,
      PositionFinish: 3,
      ElapsedTime: '01:20:00.0000',
      LapsComplete: 1,
      BestLapTime: '01:02.7390',
      BestSpeed: 102.482,
      SpeedAvg: 87.157,
      LapsLed: null,
      TimesLed: null,
      PitStops: 3,
      Status: 'Contact',
      PointsEarned: 12,
    },
  ],
  podium: [
    { pos: 1, car: '5', driver: "Pato O'Ward", team: 'Arrow McLaren', started: 10, lapsLed: 2 },
    { pos: 2, car: '26', driver: 'Colton Herta', team: 'Andretti', started: 1, lapsLed: 1 },
  ],
  pole: { car: '26', driver: 'Colton Herta' },
};

describe('parseLapTime / parseDuration', () => {
  test('parses lap times and gap stamps to seconds', () => {
    expect(parseLapTime('01:03.5827')).toBeCloseTo(63.5827, 3);
    expect(parseLapTime('00:01.0451')).toBeCloseTo(1.0451, 3);
    expect(parseLapTime(63.5)).toBe(63.5);
    expect(parseLapTime('No Time')).toBeNull();
    expect(parseLapTime(null)).toBeNull();
  });

  test('parses h:mm:ss durations', () => {
    expect(parseDuration('01:48:23.9092')).toBeCloseTo(6503.9092, 3);
    expect(parseDuration('00:02:34.0500')).toBeCloseTo(154.05, 3);
    expect(parseDuration('--')).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe('time formatters', () => {
  test('formats lap seconds as m:ss.mmm', () => {
    expect(formatLapSeconds(63.5827)).toBe('1:03.583');
    expect(formatLapSeconds(61.654)).toBe('1:01.654');
    expect(formatLapSeconds(null)).toBe('--');
  });

  test('formats gaps as seconds below a minute and m:ss.s above', () => {
    expect(formatGapSeconds(1.0451)).toBe('1.0s');
    expect(formatGapSeconds(43.9148)).toBe('43.9s');
    expect(formatGapSeconds(75.25)).toBe('1:15.3');
    expect(formatGapSeconds(null)).toBe('--');
  });

  test('formats durations as h:mm:ss', () => {
    expect(formatDurationSeconds(6503.9092)).toBe('1:48:23');
    expect(formatDurationSeconds(null)).toBe('--');
  });
});

describe('buildLapTrend', () => {
  test('returns per-lap pace, flags, and margin with the fastest lap flagged', () => {
    const trend = buildLapTrend(TORONTO_RACE);

    expect(trend.totalLaps).toBe(3);
    expect(trend.records).toHaveLength(3);
    expect(trend.bestLap).toEqual({ lap: 3, seconds: 61.654, speedMph: 104.285 });
    expect(trend.averageLapSeconds).toBeCloseTo((64.0188 + 63.5827 + 61.654) / 3, 3);
    expect(trend.records[1]).toEqual({
      lap: 2,
      lapSeconds: 63.5827,
      speedMph: 101.122,
      gapToLeaderSec: 1.0583,
      flag: 'Yellow',
    });
    expect(trend.records[2].gapToLeaderSec).toBeNull();
  });

  test('sorts records and tolerates a race without timing', () => {
    const unsorted = buildLapTrend({
      leaderLaps: [{ lap: 2, flag: 'Green' }, { lap: 1, lapTime: '01:00.0000' }],
    });
    expect(unsorted.records.map((record) => record.lap)).toEqual([1, 2]);
    expect(unsorted.bestLap).toEqual({ lap: 1, seconds: 60, speedMph: null });
    expect(buildLapTrend(null)).toEqual({
      totalLaps: 0, records: [], averageLapSeconds: null, bestLap: null,
    });
  });
});

describe('marginDelta', () => {
  test('reports the change in the leader margin between consecutive laps', () => {
    const delta = marginDelta(TORONTO_RACE, 2);
    expect(delta.currentGap).toBeCloseTo(1.0583, 3);
    expect(delta.previousGap).toBeCloseTo(1.0451, 3);
    expect(delta.delta).toBeCloseTo(0.0132, 4);
  });

  test('returns null without a previous lap or usable gaps', () => {
    expect(marginDelta(TORONTO_RACE, 1)).toBeNull();
    expect(marginDelta(TORONTO_RACE, 3)).toBeNull();
    expect(marginDelta(TORONTO_RACE, null)).toBeNull();
  });
});

describe('buildDriverStats', () => {
  test('maps official classification fields and sorts by finish position', () => {
    const { rows } = buildDriverStats(TORONTO_RACE);

    expect(rows.map((row) => row.driverName)).toEqual([
      "Pato O'Ward", 'Colton Herta', 'Nolan Siegel',
    ]);
    const winner = rows[0];
    expect(winner.carNumber).toBe('5');
    expect(winner.teamName).toBe('Arrow McLaren');
    expect(winner.bestLapSeconds).toBeCloseTo(62.1675, 3);
    expect(winner.averageSpeedMph).toBe(88.972);
    expect(winner.lapsLed).toBe(2);
    expect(winner.pitStops).toBe(3);
    expect(winner.points).toBe(51);
    expect(winner.finished).toBe(true);
    expect(winner.elapsedSeconds).toBeCloseTo(6503.9092, 3);
  });

  test('flags retirements with a reason and picks the fastest lap overall', () => {
    const stats = buildDriverStats(TORONTO_RACE);

    expect(stats.finishers).toHaveLength(2);
    expect(stats.retirements).toHaveLength(1);
    expect(stats.retirements[0].driverName).toBe('Nolan Siegel');
    expect(stats.retirements[0].dnfReason).toBe('Contact');
    expect(stats.retirements[0].lapsComplete).toBe(1);
    expect(stats.fastest.driverName).toBe('Colton Herta');
  });

  test('skips deleted records and tolerates missing fields', () => {
    const stats = buildDriverStats({
      ...TORONTO_RACE,
      classification: [
        ...TORONTO_RACE.classification,
        { CarNumber: '99', DriverName: 'Ghost Driver', IsDeleted: true },
      ],
    });
    expect(stats.rows).toHaveLength(3);
    expect(buildDriverStats(null).rows).toEqual([]);
  });
});

describe('buildFinishSummary', () => {
  test('composes podium, pole, fastest lap, and retirements', () => {
    const summary = buildFinishSummary(TORONTO_RACE);

    expect(summary.podium).toHaveLength(2);
    expect(summary.podium[0]).toEqual({
      position: 1,
      carNumber: '5',
      driverName: "Pato O'Ward",
      teamName: 'Arrow McLaren',
      started: 10,
      lapsLed: 2,
    });
    expect(summary.pole).toEqual({ carNumber: '26', driverName: 'Colton Herta' });
    expect(summary.fastestLap.driverName).toBe('Colton Herta');
    expect(summary.finishedCount).toBe(2);
    expect(summary.retirements).toHaveLength(1);
  });

  test('derives the pole from the grid when the payload ships no pole entry', () => {
    const summary = buildFinishSummary({ ...TORONTO_RACE, pole: null });
    expect(summary.pole).toEqual({ carNumber: '26', driverName: 'Colton Herta' });
  });
});

