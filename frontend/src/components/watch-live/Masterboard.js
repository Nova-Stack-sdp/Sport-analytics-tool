import { memo } from 'react';

function formatLapTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '--';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return min > 0
    ? `${min}:${sec.toFixed(3).padStart(6, '0')}`
    : `${sec.toFixed(3)}`;
}

function formatGap(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--';
  const sign = seconds >= 0 ? '+' : '';
  return `${sign}${seconds.toFixed(1)}s`;
}

function gridDeltaClass(delta) {
  if (delta == null) return '';
  if (delta > 0) return 'grid-up';
  if (delta < 0) return 'grid-down';
  return '';
}

function gridDeltaLabel(delta) {
  if (delta == null) return '--';
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}

// Renders the synchronized leaderboard and tyre strategy.
const Masterboard = memo(function Masterboard({ leaderboard, error }) {
  if (leaderboard.length === 0) {
    return (
      <div className="card masterboard-card">
        <div className="card-head">
          <div>
            <div className="card-title leaderboard-title">Masterboard</div>
            <div className="card-title-sub">Current race order, speed, strategy, and momentum</div>
          </div>
          <span className="pill pill-gray">Playback time</span>
        </div>

        <div className="masterboard-empty-state">
          Find a race above, load its telemetry, then sync the clock.
        </div>
      </div>
    );
  }

  return (
    <div className="card masterboard-card">
      <div className="card-head">
        <div>
          <div className="card-title leaderboard-title">Masterboard</div>
          <div className="card-title-sub">Current race order, speed, strategy, and momentum</div>
        </div>
        <span className="pill pill-gray">Playback time</span>
      </div>

      <div className="masterboard-scroll">
        <table className="masterboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Lap</th>
              <th>Gap</th>
              <th>Speed</th>
              <th>Tire</th>
              <th>Grid</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr key={row.driverNumber}>
                <td className="mono position-cell">{row.position}</td>
                <td><div className="driver-meta"><span>{row.driverName ?? `Driver ${row.driverNumber}`}</span></div></td>
                <td className="mono">{row.teamName ?? '--'}</td>
                <td className="mono">{formatLapTime(row.lastLapTime)}</td>
                <td className="mono gap-cell">{row.position === 1 ? 'LEADER' : formatGap(row.gapToAhead)}</td>
                <td className="mono">{row.speedKph == null ? '--' : `${Math.round(row.speedKph)} km/h`}</td>
                <td><span className="tire-pill">{row.tyreCompound ?? '--'}</span></td>
                <td className={`mono grid-cell ${gridDeltaClass(row.gridDelta)}`}>{gridDeltaLabel(row.gridDelta)}</td>
                <td className="mono momentum-cell">
                  {row.positionChange == null ? '--' : row.positionChange === 0 ? '0' : `${row.positionChange > 0 ? '+' : ''}${row.positionChange}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default Masterboard;
