import { memo } from 'react';

function formatLapTime(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const [minutes, remainder] = Number(seconds).toFixed(3).split('.');
  const totalSeconds = Number(minutes);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}.${remainder}`;
}

// Compact official race statistics, not live estimates.
const RacePulse = memo(function RacePulse({ race }) {
  if (!race) return null;
  const stats = race.stats ?? {};
  const bestLap = stats.bestLap ?? {};
  const mostLapsLed = stats.mostLapsLed ?? {};
  const cautionLaps = stats.cautionLaps;
  const cards = [
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
  ];

  return (
    <div className="card race-pulse-card">
      <div className="card-head">
        <div>
          <div className="card-title">Race Statistics</div>
          <div className="card-title-sub">Official classification and race reports</div>
        </div>
        <span className="pill pill-gray">Final</span>
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
