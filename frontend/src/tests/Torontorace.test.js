import { buildTorontoraceIntelligence } from '../features/telemetry-tv/Torontorace';

describe('Torontorace intelligence', () => {
  test('builds a race battle summary and strategy insights for Toronto 2025', () => {
    const lapState = {
      lap: 42,
      isFinished: false,
      leaderboard: [
        { position: 1, driverName: 'Pato O\'Ward', carNumber: '5', gapToAhead: 0, lastLapTime: 64.2, tyreCompound: 'Black' },
        { position: 2, driverName: 'Alex Palou', carNumber: '10', gapToAhead: 0.8, lastLapTime: 64.7, tyreCompound: 'Black' },
        { position: 3, driverName: 'Scott Dixon', carNumber: '9', gapToAhead: 1.3, lastLapTime: 65.1, tyreCompound: 'Green' },
        { position: 4, driverName: 'Kyle Kirkwood', carNumber: '27', gapToAhead: 0.6, lastLapTime: 65.8, tyreCompound: 'Black' },
        { position: 5, driverName: 'Will Power', carNumber: '12', gapToAhead: 1.7, lastLapTime: 66.7, tyreCompound: 'Green' },
        { position: 6, driverName: 'Josef Newgarden', carNumber: '2', gapToAhead: 2.4, lastLapTime: 67.2, tyreCompound: 'Black' }
      ]
    };

    const intelligence = buildTorontoraceIntelligence({ lapState, selectedSlug: 'toronto-2025' });

    expect(intelligence.raceSlug).toBe('toronto-2025');
    expect(intelligence.battleRadar.columns.map((column) => column.label)).toEqual(['Lead battle', 'Midfield pressure', 'Strategy']);
    expect(intelligence.weather.note).toContain('dry');
    expect(intelligence.strategySignals[0].label).toMatch(/track|tire|pacing/i);
    expect(intelligence.narrative).toMatch(/Toronto|track|tire|pace/i);
  });
});
