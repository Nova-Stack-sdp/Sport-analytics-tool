import { memo } from 'react';

// Renders the synchronized leaderboard and tyre strategy.
const Masterboard = memo(function Masterboard({ leaderboard, error }) {
  // Show simplified empty state if no data
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

      <table className="masterboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Driver</th>
            <th>Team</th>
            <th>Speed</th>
            <th>Tire</th>
            <th>Stint</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row) => (
            <tr key={row.driverNumber}>
              <td className="mono position-cell">{row.position}</td>
              <td><div className="driver-meta"><span>{row.driverName ?? `Driver ${row.driverNumber}`}</span></div></td>
              <td className="mono">{row.teamName ?? '--'}</td>
              <td className="mono">{row.speedKph == null ? '--' : `${Math.round(row.speedKph)} km/h`}</td>
              <td><span className="tire-pill">{row.tyreCompound ?? '--'}</span></td>
              <td className="mono">{row.stintNumber ?? '--'}</td>
              <td className="mono momentum-cell">
                {row.positionChange == null ? '--' : row.positionChange === 0 ? '0m/s' : `${row.positionChange > 0 ? '+' : ''}${row.positionChange}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default Masterboard;