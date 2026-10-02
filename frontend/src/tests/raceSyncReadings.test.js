import {
  chartDomain,
  compoundChip,
  driverSummary,
  formatDelta,
  formatGap,
  formatLapTime,
  lapTraces,
  paceRows,
  pitStops,
  plottedValue,
  readingsCsv,
  readingsCsvFilename,
  stintSegments,
  stopCounts,
} from '../components/race-sync/raceSyncReadings';

// One driver's series columns, in the shape the backend's lap series returns
// them: one measure per array, indexed by lap - 1.
function driver(overrides = {}) {
  return {
    entryId: 'e1',
    driverName: 'Max VERSTAPPEN',
    teamName: 'Red Bull Racing',
    lapTimeSeconds: [90, 90.2, 90.4, 90.6],
    position: [1, 1, 1, 1],
    compound: ['SOFT', 'SOFT', 'SOFT', 'SOFT'],
    stintNumber: [1, 1, 1, 1],
    ...overrides,
  };
}

describe('the readings the panels draw', () => {
  describe('formatting', () => {
    test('lap times read as a timing screen reads them', () => {
      expect(formatLapTime(92.456)).toBe('1:32.456');
      expect(formatLapTime(125.4)).toBe('2:05.400');
      // A lap under a minute keeps the seconds form rather than a 0: prefix.
      expect(formatLapTime(59.5)).toBe('59.500');
      expect(formatLapTime(60)).toBe('1:00.000');
    });

    test('a reading the data cannot support is a dash, not a zero', () => {
      expect(formatLapTime(null)).toBe('—');
      expect(formatLapTime(NaN)).toBe('—');
      expect(formatDelta(undefined)).toBe('—');
      expect(formatGap(null)).toBe('—');
    });

    test('a change is signed, a gap between two cars is not', () => {
      expect(formatDelta(0.412)).toBe('+0.412');
      expect(formatDelta(-1.234)).toBe('-1.234');
      expect(formatGap(-3.5)).toBe('3.500');
    });
  });

  describe('compounds', () => {
    test('a known compound reads as its letter', () => {
      expect(compoundChip('soft')).toEqual({ key: 'soft', letter: 'S', label: 'Soft' });
      // Whatever casing the sync wrote.
      expect(compoundChip('MEDIUM')).toEqual({ key: 'medium', letter: 'M', label: 'Medium' });
      expect(compoundChip(' Wet ')).toEqual({ key: 'wet', letter: 'W', label: 'Wet' });
    });

    test('an unknown compound is shown as itself rather than hidden', () => {
      expect(compoundChip('hypersoft')).toEqual({ key: 'other', letter: 'H', label: 'hypersoft' });
    });

    test('a lap with no compound logged has no chip', () => {
      expect(compoundChip(null)).toBeNull();
      expect(compoundChip('')).toBeNull();
    });
  });

  describe('tyre stints', () => {
    test('a run of laps on one set is one stint, with its own wear', () => {
      const [segment] = stintSegments(driver(), 4);
      expect(segment).toMatchObject({
        compound: 'SOFT',
        stintNumber: 1,
        fromLap: 1,
        toLap: 4,
        laps: 4,
        timedLaps: 4,
      });
      expect(segment.average).toBeCloseTo(90.3, 5);
      // The laps get 0.1s a lap slower, read between the two halves' midpoints.
      expect(segment.wearPerLap).toBeCloseTo(0.2, 5);
    });

    test('a stop ends a run even when the compound stays the same', () => {
      const segments = stintSegments(
        driver({ compound: ['MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM'], stintNumber: [1, 1, 2, 2] }),
        4
      );
      expect(segments.map((segment) => [segment.fromLap, segment.toLap])).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    test('a stint only reaches as far as the playhead', () => {
      const segments = stintSegments(driver(), 2);
      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({ fromLap: 1, toLap: 2, laps: 2 });
    });

    test('an untimed lap stays a gap rather than being filled in', () => {
      const [segment] = stintSegments(driver({ lapTimeSeconds: [90, null, 90.4, 90.6] }), 4);
      expect(segment.laps).toBe(4);
      expect(segment.timedLaps).toBe(3);
      expect(segment.average).toBeCloseTo((90 + 90.4 + 90.6) / 3, 5);
      // Too few timed laps on one side of the divide to measure anything.
      expect(segment.wearPerLap).toBeNull();
    });

    test('a stint too short to have two halves shows no trend at all', () => {
      expect(stintSegments(driver(), 2)[0].wearPerLap).toBeNull();
    });
  });

  describe('pit stops', () => {
    // A stop on lap 3: two laps on softs, then two on hards, one place won.
    const stopped = driver({
      compound: ['SOFT', 'SOFT', 'HARD', 'HARD'],
      stintNumber: [1, 1, 2, 2],
      position: [3, 3, 1, 1],
    });

    test('a stop is read where the new set appears, with the places it covered', () => {
      expect(pitStops(stopped, 4)).toEqual([
        {
          lap: 3,
          from: 'SOFT',
          to: 'HARD',
          positionBefore: 3,
          positionAfter: 1,
          places: 2,
        },
      ]);
    });

    test('a stop the playhead has not reached does not exist yet', () => {
      expect(pitStops(stopped, 2)).toEqual([]);
    });

    test('a driver who has not changed tyres has no stops', () => {
      expect(pitStops(driver(), 4)).toEqual([]);
      const counts = stopCounts([driver(), { ...stopped, entryId: 'e2' }], 4);
      expect(counts.get('e1')).toBe(0);
      expect(counts.get('e2')).toBe(1);
    });
  });

  describe('pace', () => {
    const quick = driver({ entryId: 'e1', lapTimeSeconds: [90, 90.5, 91] });
    const slower = driver({
      entryId: 'e2',
      driverName: 'Lewis HAMILTON',
      teamName: 'Mercedes',
      lapTimeSeconds: [89.8, 92, 91],
    });

    test('the rows read best and median, quickest first', () => {
      const rows = paceRows([quick, slower], 3);
      expect(rows.map((row) => row.entryId)).toEqual(['e2', 'e1']);
      expect(rows[0]).toMatchObject({ best: 89.8, median: 91, laps: 3, gapToBest: 0 });
      expect(rows[1]).toMatchObject({ best: 90, median: 90.5, laps: 3 });
      expect(rows[1].gapToBest).toBeCloseTo(0.2, 5);
    });

    test('the playhead is the only thing that decides how much has been run', () => {
      const rows = paceRows([quick], 2);
      expect(rows[0]).toMatchObject({ best: 90, median: 90.25, laps: 2 });
    });

    test('a driver without a timed lap sorts last with nothing to show', () => {
      const rows = paceRows(
        [quick, driver({ entryId: 'e2', lapTimeSeconds: [null, null, null] })],
        3
      );
      expect(rows.map((row) => row.entryId)).toEqual(['e1', 'e2']);
      expect(rows[1]).toMatchObject({ best: null, median: null, gapToBest: null, laps: 0 });
    });
  });

  describe('lap charts', () => {
    test('a trace carries one point per timed lap, and the reference is the quickest lap drawn', () => {
      const { traces, reference } = lapTraces(
        [
          driver({ lapTimeSeconds: [90, null, 91] }),
          driver({ entryId: 'e2', lapTimeSeconds: [89.5, 90, 92] }),
        ],
        3
      );
      expect(reference).toBe(89.5);
      expect(traces[0].points).toEqual([
        { lap: 1, seconds: 90 },
        { lap: 3, seconds: 91 },
      ]);
      expect(traces[0].best).toBe(90);
      expect(traces[1].points).toHaveLength(3);
    });

    test('a point is plotted as the lap time or as the distance off the reference', () => {
      const point = { lap: 2, seconds: 91.4 };
      expect(plottedValue(point, { mode: 'pace', reference: 90 })).toBe(91.4);
      expect(plottedValue(point, { mode: 'delta', reference: 90 })).toBeCloseTo(1.4, 5);
    });

    test('the delta band starts at zero and the lap-time band wraps the field', () => {
      const traces = lapTraces([driver({ lapTimeSeconds: [90, 90.2] })], 2).traces;

      const deltaDomain = chartDomain({ traces, reference: 90, mode: 'delta' });
      expect(deltaDomain.min).toBe(0);
      expect(deltaDomain.max).toBeCloseTo(0.224, 5);

      const paceDomain = chartDomain({ traces, reference: 90, mode: 'pace' });
      expect(paceDomain.min).toBeCloseTo(89.976, 5);
      expect(paceDomain.max).toBeCloseTo(90.224, 5);
    });

    test('a field all on the same pace still gets a band to draw in', () => {
      const traces = lapTraces([driver({ lapTimeSeconds: [90, 90] })], 2).traces;
      const domain = chartDomain({ traces, reference: 90, mode: 'pace' });
      expect(domain.max).toBeGreaterThan(domain.min);
    });

    test('nothing to plot has no domain', () => {
      expect(chartDomain({ traces: [{ points: [] }], reference: null, mode: 'pace' })).toBeNull();
    });
  });

  // A stopped race writes one huge interval into the log — the Monza fixture
  // carries 1955.709 seconds where a lap belongs — and no reading may wear it
  // as a lap time (see LAP_TIME_CEILING_SECONDS).
  describe('stoppages in the log', () => {
    const stopped = driver({
      lapTimeSeconds: [90, 1955.709, 90.4, 90.6, 91, 91.4],
      compound: Array(6).fill('SOFT'),
      stintNumber: Array(6).fill(1),
    });

    test('an interval a car cannot have driven is counted, not plotted', () => {
      const { traces, reference, stoppageLaps } = lapTraces([stopped], 6);
      expect(stoppageLaps).toBe(1);
      expect(traces[0].points).toEqual([
        { lap: 1, seconds: 90 },
        { lap: 3, seconds: 90.4 },
        { lap: 4, seconds: 90.6 },
        { lap: 5, seconds: 91 },
        { lap: 6, seconds: 91.4 },
      ]);
      // The reference and the best are real laps — a pause cannot set the pace.
      expect(reference).toBe(90);
      expect(traces[0].best).toBe(90);
    });

    test('a stoppage is not a lap of the pace comparison', () => {
      const rows = paceRows([stopped], 6);
      expect(rows[0]).toMatchObject({ best: 90, median: 90.6, laps: 5 });
    });

    test('a stoppage sits in neither a stint average nor its wear', () => {
      const [segment] = stintSegments(stopped, 6);
      expect(segment).toMatchObject({ laps: 6, timedLaps: 5 });
      expect(segment.average).toBeCloseTo((90 + 90.4 + 90.6 + 91 + 91.4) / 5, 5);
      // Five timed laps: halves of two, their midpoints three laps apart.
      expect(segment.wearPerLap).toBeCloseTo((91.2 - 90.2) / 3, 5);
    });

    test('the band: a ten-minute lap is a lap, anything longer is not', () => {
      const long = driver({ lapTimeSeconds: [600, 600.5] });
      const { traces, stoppageLaps } = lapTraces([long], 2);
      expect(stoppageLaps).toBe(1);
      expect(traces[0].points).toEqual([{ lap: 1, seconds: 600 }]);
    });
  });

  // The Driver Analysis card's summary: the honest version of the mockup's
  // tiles. Average pace and its gap to the field's best average, the best lap
  // and the lap it happened on, the latest stint's wear read against that
  // stint's own pace, stint lengths, and takeaways — each a true sentence
  // about the numbers, never an inferred cause.
  describe('driver summary', () => {
    test('no driver at all has no summary', () => {
      expect(driverSummary(null, [], 4)).toBeNull();
    });

    test('the playhead decides how much of the race there is to summarise', () => {
      const summary = driverSummary(driver(), [driver()], 0);
      expect(summary).toMatchObject({
        laps: 0,
        average: null,
        averageGap: null,
        best: null,
        bestLap: null,
        degradation: null,
        stopCount: 0,
      });
      expect(summary.stintLengths).toEqual([]);
      expect(summary.takeaways).toEqual([]);
    });

    test('average pace, its gap to the best average, the best lap and its number', () => {
      const quick = driver({ entryId: 'e1', lapTimeSeconds: [90, 90.5, 91] });
      const slower = driver({
        entryId: 'e2',
        driverName: 'Lewis HAMILTON',
        lapTimeSeconds: [91, 91.5, 92],
      });
      const summary = driverSummary(slower, [quick, slower], 3);
      expect(summary.laps).toBe(3);
      expect(summary.average).toBeCloseTo(91.5, 5);
      expect(summary.averageGap).toBeCloseTo(1, 5);
      expect(summary.best).toBe(91);
      expect(summary.bestLap).toBe(1);
    });

    test('a field of one has nothing to gap against', () => {
      expect(driverSummary(driver(), [driver()], 4).averageGap).toBe(0);
      expect(driverSummary(driver(), [], 4).averageGap).toBeNull();
    });

    test('degradation is the latest stint wear read against that stint pace', () => {
      // [90, 90.2, 90.4, 90.6] wears 0.2 s/lap on a 90.3 s average stint.
      const summary = driverSummary(driver(), [driver()], 4);
      expect(summary.degradation).toBeCloseTo((0.2 / 90.3) * 100, 5);
      expect(summary.takeaways).toContain(
        `Latest stint: tyres losing ${summary.degradation.toFixed(2)}% of pace per lap`
      );
    });

    test('improving tyres read as improving, not as wear', () => {
      const summary = driverSummary(driver({ lapTimeSeconds: [90.6, 90.4, 90.2, 90] }), [], 4);
      expect(summary.degradation).toBeCloseTo((-0.2 / 90.3) * 100, 5);
      expect(summary.takeaways).toContain('Latest stint: tyres improving 0.22% per lap');
    });

    test('a dead-even stint reports no measurable wear rather than zero', () => {
      const summary = driverSummary(driver({ lapTimeSeconds: [90, 90, 90, 90] }), [], 4);
      expect(summary.degradation).toBe(0);
      expect(summary.takeaways).toContain('Latest stint: no measurable tyre wear yet');
    });

    test('a stint too short to split in two has no degradation to show', () => {
      const summary = driverSummary(driver(), [driver()], 2);
      expect(summary.stintLengths).toEqual([2]);
      expect(summary.degradation).toBeNull();
    });

    test('stint lengths count each stint to the playhead, with the stop count', () => {
      const stopped = driver({
        compound: ['SOFT', 'SOFT', 'HARD', 'HARD'],
        stintNumber: [1, 1, 2, 2],
        position: [3, 3, 1, 1],
      });
      const summary = driverSummary(stopped, [stopped], 4);
      expect(summary.stintLengths).toEqual([2, 2]);
      expect(summary.stopCount).toBe(1);
    });

    test('takeaways say what the numbers say: the stop, the best lap, the wear', () => {
      const stopped = driver({
        compound: ['SOFT', 'SOFT', 'HARD', 'HARD'],
        stintNumber: [1, 1, 2, 2],
        position: [3, 3, 1, 1],
      });
      const summary = driverSummary(stopped, [stopped], 4);
      // Stints of two laps cannot measure wear, so only the stop and the
      // best lap have anything true to say.
      expect(summary.takeaways).toEqual([
        'Gained +2 over the stop on L3',
        'Best lap L1 — 1:30.000',
      ]);
    });

    test('a stoppage interval is not a lap of the summary either', () => {
      const summary = driverSummary(
        driver({ lapTimeSeconds: [90, 1955.709, 90.4, 90.6] }),
        [],
        4
      );
      expect(summary.laps).toBe(3);
      expect(summary.best).toBe(90);
      expect(summary.average).toBeCloseTo((90 + 90.4 + 90.6) / 3, 5);
    });
  });

  // The export the caption row offers: the same readings, the same playhead
  // cut, as a file. Screens interpret; an export reports.
  describe('CSV export', () => {
    test('one row per driver per lap, cut at the playhead', () => {
      const csv = readingsCsv([driver()], 2);
      expect(csv).toBe(
        [
          'lap,driver,team,position,lap_time_s,compound,stint',
          '1,Max VERSTAPPEN,Red Bull Racing,1,90.000,SOFT,1',
          '2,Max VERSTAPPEN,Red Bull Racing,1,90.200,SOFT,1',
        ].join('\n') + '\n'
      );
    });

    test('a reading the log does not carry stays an empty field', () => {
      const gaps = driver({
        lapTimeSeconds: [88.5, null],
        position: [null, 2],
        compound: [null, 'HARD'],
        stintNumber: [null, 2],
      });
      const rows = readingsCsv([gaps], 2).split('\n');
      expect(rows[1]).toBe('1,Max VERSTAPPEN,Red Bull Racing,,88.500,,');
      expect(rows[2]).toBe('2,Max VERSTAPPEN,Red Bull Racing,2,,HARD,2');
    });

    test('a stoppage interval stands in the file as the log wrote it', () => {
      const stopped = driver({ lapTimeSeconds: [90, 1955.709] });
      expect(readingsCsv([stopped], 2).split('\n')[2]).toBe(
        '2,Max VERSTAPPEN,Red Bull Racing,1,1955.709,SOFT,1'
      );
    });

    test('a name that would break a row is quoted, not mangled', () => {
      const quoted = driver({ driverName: 'Doe, "Johnny"', teamName: 'A & B Racing' });
      expect(readingsCsv([quoted], 1).split('\n')[1]).toBe(
        '1,"Doe, ""Johnny""",A & B Racing,1,90.000,SOFT,1'
      );
    });

    test('the file is named for the race and the lap it was cut at', () => {
      expect(readingsCsvFilename('Italian Grand Prix', 40)).toBe(
        'italian-grand-prix-through-lap-40.csv'
      );
      expect(readingsCsvFilename(null, 0)).toBe('race-through-lap-0.csv');
    });
  });
});
