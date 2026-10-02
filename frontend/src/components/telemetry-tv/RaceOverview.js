import { memo } from 'react';
import { formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

function Tile({ label, value, sub, accent }) {
  if (value == null || value === '') return null;
  return (
    <div className={`overview-tile${accent ? ' is-accent' : ''}`}>
      <span className="overview-tile-label">{label}</span>
      <span className="overview-tile-value">{value}</span>
      {sub ? <span className="overview-tile-sub">{sub}</span> : null}
    </div>
  );
}

// The broadcast "race centre" band: the official race-level numbers — winner,
// pole, fastest lap, pace, distance and action — in one scannable strip.
// Tiles the payload cannot support are omitted rather than faked.
const RaceOverview = memo(function RaceOverview({ overview }) {
  if (!overview) return null;

  const cautionCount = overview.cautions?.count;
  const cautionLaps = overview.cautions?.laps;

  return (
    <section className="card race-overview-card" aria-label="Race overview">
      <div className="card-head">
        <div>
          <div className="card-title">Race Overview</div>
          <div className="card-title-sub">
            Official race report{overview.totalLaps ? ` · ${overview.totalLaps} laps` : ''}
          </div>
        </div>
        <span className="pill pill-gray">INDYCAR</span>
      </div>

      <div className="overview-grid">
        <Tile
          label="Winner"
          value={overview.winner?.driver}
          sub={[overview.winner?.team, overview.winner?.car ? `#${overview.winner.car}` : null]
            .filter(Boolean).join(' · ')}
          accent
        />
        <Tile
          label="Pole position"
          value={overview.pole?.driver}
          sub={overview.pole?.car ? `#${overview.pole.car}` : null}
        />
        <Tile
          label="Fastest lap"
          value={overview.fastestLap ? formatLapSeconds(overview.fastestLap.seconds) : null}
          sub={[overview.fastestLap?.driver, overview.fastestLap?.lap ? `lap ${overview.fastestLap.lap}` : null]
            .filter(Boolean).join(' · ')}
        />
        <Tile
          label="Average speed"
          value={overview.averageSpeedMph == null ? null : `${overview.averageSpeedMph.toFixed(1)} mph`}
        />
        <Tile label="Race time" value={overview.raceTime} />
        <Tile
          label="Lead changes"
          value={overview.leadChanges == null ? null : String(overview.leadChanges)}
          sub={overview.leaderCount != null ? `${overview.leaderCount} leaders` : null}
        />
        <Tile
          label="Cautions"
          value={cautionCount == null ? null : String(cautionCount)}
          sub={cautionLaps != null ? `${cautionLaps} ${cautionLaps === 1 ? 'lap' : 'laps'}` : null}
        />
        <Tile
          label="Green-flag laps"
          value={overview.greenLaps == null ? null : String(overview.greenLaps)}
        />
        <Tile
          label="Passes"
          value={overview.passes?.total == null ? null : String(overview.passes.total)}
          sub={overview.passes?.position != null ? `${overview.passes.position} for position` : null}
        />
        <Tile
          label="Most laps led"
          value={overview.mostLapsLed?.driver}
          sub={overview.mostLapsLed?.laps != null
            ? `${overview.mostLapsLed.laps} ${overview.mostLapsLed.laps === 1 ? 'lap' : 'laps'}`
            : null}
        />
      </div>
    </section>
  );
});

export default RaceOverview;
