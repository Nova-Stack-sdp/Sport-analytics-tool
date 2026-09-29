import { memo } from 'react';

function formatLapTime(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const [minutes, remainder] = Number(seconds).toFixed(3).split('.');
  const totalSeconds = Number(minutes);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}.${remainder}`;
}

function currentRaceCards(lapState) {
  const currentLeader = lapState.leaderboard[0];
  const biggestMove = lapState.leaderboard
    .filter((driver) => driver.lapDelta != null)
    .sort((first, second) => Math.abs(second.lapDelta) - Math.abs(first.lapDelta))[0];
  const raceSoFar = lapState.raceSoFar;

  return [
    {
      label: 'Race Leader',
      value: currentLeader ? `${currentLeader.driverName} (#${currentLeader.carNumber})` : '--',
      sub: raceSoFar.leaderChangedThisLap ? 'Took the lead this lap' : 'Leader at selected lap',
      accent: 'green',
    },
    {
      label: 'Lead Changes',
      value: raceSoFar.leadChanges,
      sub: `through lap ${lapState.lap}`,
      accent: 'amber',
    },
    {
      label: 'Caution Laps',
      value: raceSoFar.cautionLaps,
      sub: `through lap ${lapState.lap}`,
      accent: 'red',
    },
    {
      label: 'Biggest Move',
      value: biggestMove?.driverName ?? '--',
      sub: biggestMove
        ? `${biggestMove.lapDelta > 0 ? '+' : ''}${biggestMove.lapDelta} vs previous lap`
        : 'No prior lap to compare',
      accent: 'blue',
    },
    {
      label: 'Lap Status',
      value: lapState.leaderLap?.flag ?? '--',
      sub: lapState.leaderLap
        ? `Leader ${lapState.leaderLap.lapTime} · ${lapState.leaderLap.speed == null ? '--' : `${Number(lapState.leaderLap.speed).toFixed(1)} mph`}`
        : 'Leader timing unavailable',
      accent: 'purple',
    },
  ];
}

// Shows cumulative race-so-far stats until the selected lap is the finish.
const RacePulse = memo(function RacePulse({ race, lapState }) {
  if (!race) return null;
  const stats = race.stats ?? {};
  const bestLap = stats.bestLap ?? {};
  const mostLapsLed = stats.mostLapsLed ?? {};
  const cautionLaps = stats.cautionLaps;
  const isFinished = lapState.isFinished;
  const cards = isFinished ? [
    {
      label: 'Race Average',
      value: stats.avgSpeedMph == null ? '--' : `${Number(stats.avgSpeedMph).toFixed(1)} mph`,
      sub: 'official average speed',
      accent: 'blue',
    },
    {
      label: 'Fastest Lap',
      value: formatLapTime(bestLap.sec),
      sub: bestLap.driver ? `${bestLap.driver} · lap ${bestLap.lap ?? '--'}` : 'official race report',
      accent: 'green',
    },
    {
      label: 'Lead Changes',
      value: stats.leadChangesOfficial ?? '--',
      sub: `${stats.leadDriversOfficial ?? '--'} drivers led`,
      accent: 'amber',
    },
    {
      label: 'Cautions',
      value: stats.cautionCount ?? race.cautions?.length ?? '--',
      sub: `${cautionLaps ?? '--'} lap${cautionLaps === 1 ? '' : 's'} under yellow`,
      accent: 'red',
    },
    {
      label: 'Position Passes',
      value: stats.passes?.position ?? '--',
      sub: `${stats.passes?.total ?? '--'} total passes`,
      accent: 'purple',
    },
    {
      label: 'Most Laps Led',
      value: mostLapsLed.driver ?? '--',
      sub: `${mostLapsLed.laps ?? '--'} lap${mostLapsLed.laps === 1 ? '' : 's'} · car ${mostLapsLed.car ?? '--'}`,
      accent: 'blue',
    },
  ] : currentRaceCards(lapState);

  return (
    <div className="card race-pulse-card">
      <div className="card-head">
        <div>
          <div className="card-title">{isFinished ? 'Race Analysis' : 'Race So Far'}</div>
          <div className="card-title-sub">
            {isFinished ? 'Official final classification and race statistics' : `Current state through lap ${lapState.lap}`}
          </div>
        </div>
        <span className={`pill ${isFinished ? 'pill-gray' : 'pill-green'}`}>
          {isFinished ? 'Final' : `Lap ${lapState.lap}`}
        </span>
      </div>
      <div className="race-pulse-grid">
        {cards.map((card) => (
          <div key={card.label} className={`pulse-stat ${card.accent}`}>
            <div className="pulse-stat-label">{card.label}</div>
            <div className="pulse-stat-value">{card.value}</div>
            <div className="pulse-stat-sub">{card.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default RacePulse;
