import { memo } from 'react';
import { formatDurationSeconds, formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

// End-of-race panel: podium, pole, the fastest lap of the race, and every
// retirement with its official reason. Shown once the lap cursor reaches the
// checkered flag.
const RaceFinishCard = memo(function RaceFinishCard({ finishSummary, totalLaps }) {
  if (!finishSummary) return null;
  const { podium, pole, winner, fastestLap, finishedCount, retirements } = finishSummary;
  if (podium.length === 0 && !pole && !fastestLap && retirements.length === 0) return null;

  return (
    <section className="card race-finish-card" aria-label="Finish summary">
      <div className="card-head">
        <div>
          <div className="card-title">Finish Summary</div>
          <div className="card-title-sub">
            Official classification · {finishedCount} classified finishers
            {totalLaps ? ` over ${totalLaps} laps` : ''}
          </div>
        </div>
        <span className="pill pill-green">Official</span>
      </div>

      <div className="finish-grid">
        <div className="finish-podium">
          {podium.length === 0 && <div className="finish-empty">Podium unavailable in this report.</div>}
          {podium.map((entry) => (
            <div className="podium-row" key={`${entry.position}-${entry.carNumber}`}>
              <span className="podium-pos">P{entry.position ?? '--'}</span>
              <div className="podium-copy">
                <span className="podium-name">{entry.driverName ?? '--'}</span>
                <span className="podium-team">{entry.teamName ?? '--'}</span>
              </div>
              <span className="podium-detail">
                {[
                  entry.started == null ? null : `started P${entry.started}`,
                  entry.lapsLed > 0 ? `led ${entry.lapsLed} laps` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>

        <div className="finish-stats">
          <div className="finish-stat">
            <span className="finish-stat-label">Pole</span>
            <span className="finish-stat-value">{pole?.driverName ?? '--'}</span>
            <span className="finish-stat-sub">{pole ? `car ${pole.carNumber}` : 'grid unavailable'}</span>
          </div>
          <div className="finish-stat">
            <span className="finish-stat-label">Fastest lap</span>
            <span className="finish-stat-value mono">{formatLapSeconds(fastestLap?.seconds)}</span>
            <span className="finish-stat-sub">
              {fastestLap
                ? `${fastestLap.driverName}${fastestLap.speedMph == null ? '' : ` · ${fastestLap.speedMph.toFixed(1)} mph`}`
                : 'timing unavailable'}
            </span>
          </div>
          <div className="finish-stat">
            <span className="finish-stat-label">Winner's time</span>
            <span className="finish-stat-value mono">{formatDurationSeconds(winner?.elapsedSeconds)}</span>
            <span className="finish-stat-sub">{winner ? winner.driverName : 'race duration'}</span>
          </div>
        </div>

        {retirements.length > 0 && (
          <div className="finish-retirements">
            <div className="finish-retirements-title">Retirements</div>
            <div className="finish-retirements-list">
              {retirements.map((row) => (
                <div className="retirement-row" key={row.carNumber}>
                  <span className="mono retirement-car">#{row.carNumber}</span>
                  <span className="retirement-name">{row.driverName}</span>
                  <span className="retirement-reason">
                    {row.dnfReason ?? 'Retired'}
                    {row.lapsComplete != null ? ` · lap ${row.lapsComplete}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

export default RaceFinishCard;
