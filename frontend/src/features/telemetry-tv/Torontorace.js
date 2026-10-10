export const torontorace = {
  raceSlug: 'toronto-2025',
  eventName: 'Ontario Honda Dealers Indy Toronto',
  headline: 'Race Intelligence',
  subtitle: 'Lead battle, midfield pressure and the strategy picture',
  weather: {
    note: 'dry race conditions with quick grip evolution; no rain calls and the circuit ramps up quickly from warm-up into green.',
    grip: 'Track tempo gets faster quickly in the opening stint, so under/overcut timing matters more than raw pace alone.',
  },
  strategySignals: [
    {
      label: 'Track evolution',
      value: 'Grip compresses the field',
      detail: 'As the track cleans up, the pace gap between stints narrows and the front cars become harder to pull away from.',
    },
    {
      label: 'Tire window',
      value: 'Manage tire life',
      detail: 'The harder compound can hold longer, but the real advantage comes from hitting the sweet spot before the rear tires fall off.',
    },
    {
      label: 'Stop timing',
      value: 'Pace vs pit window',
      detail: 'Toronto rewards precise timing because a good stop can flip a race in a single cycle when the field is close.',
    },
  ],
};

function buildBattleRadarColumns(leaderboard) {
  const entries = Array.isArray(leaderboard) ? leaderboard : [];
  if (entries.length === 0) {
    return [];
  }

  const takeFromEnd = (count) => [...entries].slice(-count).reverse();

  const front = entries.slice(0, 3);
  const midpoint = Math.max(0, Math.floor(entries.length / 2) - 1);
  const midfield = entries.slice(midpoint, midpoint + 3);
  const back = takeFromEnd(3);

  return [
    { label: 'Lead battle', tone: 'lead', entries: front },
    { label: 'Midfield pressure', tone: 'caution', entries: midfield },
    { label: 'Strategy', tone: 'strategy', entries: back },
  ];
}

export function buildTorontoraceIntelligence({ lapState, selectedSlug }) {
  const leaderboard = Array.isArray(lapState?.leaderboard) ? lapState.leaderboard : [];
  const battleRadar = {
    columns: buildBattleRadarColumns(leaderboard),
    leaderboard,
  };

  const narrative = selectedSlug === 'toronto-2025'
    ? 'Toronto rewards hard braking, clean exits, and a disciplined tire life plan. The battle radar should prioritize the front group, the midfield bunch, and the back markers on fresh tires because a single cycle can change the race picture quickly.'
    : 'Race rhythm and stop timing are driving the current battle.';

  return {
    raceSlug: selectedSlug ?? torontorace.raceSlug,
    weather: torontorace.weather,
    strategySignals: torontorace.strategySignals,
    narrative,
    battleRadar,
    context: {
      headline: torontorace.headline,
      subtitle: torontorace.subtitle,
      weather: torontorace.weather,
    },
  };
}
