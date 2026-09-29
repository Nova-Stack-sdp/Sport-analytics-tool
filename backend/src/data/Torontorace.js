export const torontorace = {
  raceSlug: 'toronto-2025',
  eventName: 'Ontario Honda Dealers Indy Toronto',
  venue: 'Exhibition Place, Toronto',
  paceAndStrategy: {
    headline: 'Pace & Strategy Intelligence',
    subtitle: 'Current race rhythm, tire strategy, and pressure points',
    weather: {
      note: 'Dry race conditions with quick grip evolution; the track ramps up rapidly from warm-up into green.',
      grip: 'The field settles into rhythm quickly, making small pace gains and carefully managed tire life more valuable than raw top speed.',
    },
    strategySignals: [
      {
        label: 'Track evolution',
        value: 'Grip compresses the field',
        detail: 'As the circuit cleans up, the front group becomes more sensitive to tire window and pit timing.',
      },
      {
        label: 'Tire window',
        value: 'Manage tire life',
        detail: 'The harder compound offers better life, but the true advantage sits in the precise stint window before degradation hits.',
      },
      {
        label: 'Stop timing',
        value: 'Under/overcut window',
        detail: 'Toronto is a race where defending position and perfect stop timing can make or break a strategy cycle.',
      },
    ],
  },
  narrative: 'Toronto is a street circuit where tire life, braking discipline, and pit timing matter as much as top speed. The most valuable live insight is usually the relative pace between the front group and the cars on fresh tires, not just the leader’s lap time.',
  events: [
    {
      id: 'toronto-2025-crash-lap-37',
      type: 'crash',
      lap: 37,
      drivers: ['Abel', 'Malukas', 'Foster', 'Newgarden', 'DeFrancesco', 'Armstrong', 'Siegel', 'Kirkwood'],
      confidence: 'medium',
      detail: 'Multi-car pileup at turn 1 during the restart.',
    },
    {
      id: 'toronto-2025-crash-lap-89',
      type: 'crash',
      lap: 89,
      drivers: ['Rosenqvist', 'Siegel'],
      confidence: 'medium',
      detail: 'Rosenqvist loses the rear and Siegel collides at turn 10.',
    },
  ],
};

export function getTorontoraceContext() {
  return {
    ...torontorace,
    paceAndStrategy: {
      ...torontorace.paceAndStrategy,
    },
  };
}
