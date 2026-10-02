import { memo } from 'react';
import { formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

// Grid slot vs finish: gained places read green (+n), lost places read red
// (-n), and a zero or missing delta stays neutral so the column never
// invents movement the classification does not record.
function deltaCell(row) {
  if (row.startPosition == null || row.finishPosition == null) {
    return <td className="mono stats-delta-flat">--</td>;
  }
  const delta = row.startPosition - row.finishPosition;
  if (delta > 0) return <td className="mono stats-delta-up">+{delta}</td>;
  if (delta < 0) return <td className="mono stats-delta-down">{delta}</td>;
  return <td className="mono stats-delta-flat">0</td>;
}

// The official final classification for the whole field: start slot, movement
// against it, best lap, average speed, laps led, stops, points and status.
const DriverStatsPanel = memo(function DriverStatsPanel({ driverStats }) {
  if (!driverStats || driverStats.rows.length === 0) return null;

  const rows = driverStats.rows;

  return (
    <div className="card driver-stats-card">
      <div className="card-head">
        <div>
          <div className="card-title">Official Driver Stats</div>
          <div className="card-title-sub">
            Final classification · full field of {rows.length}
          </div>
        </div>
        <span className="pill pill-gray">
          {driverStats.retirements.length > 0
            ? `${driverStats.retirements.length} retirements`
            : 'Report'}
        </span>
      </div>

      <div className="driver-stats-scroll">
        <table className="driver-stats-table">
          <thead>
            <tr>
              <th>P</th>
              <th>Driver</th>
              <th>Start</th>
              <th>+/-</th>
              <th>Best lap</th>
              <th>Avg</th>
              <th>Led</th>
              <th>Stops</th>
              <th>Pts</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.carNumber} className={row.finished ? '' : 'stats-dnf-row'}>
                <td className="mono">{row.finishPosition ?? '--'}</td>
                <td>
                  <span className="stats-driver-name">{row.driverName}</span>
                  <span className="stats-car"> #{row.carNumber}</span>
                  {row.teamName ? <span className="stats-team">{row.teamName}</span> : null}
                </td>
                <td className="mono">{row.startPosition ?? '--'}</td>
                {deltaCell(row)}
                <td className="mono">{formatLapSeconds(row.bestLapSeconds)}</td>
                <td className="mono">
                  {row.averageSpeedMph == null ? '--' : row.averageSpeedMph.toFixed(1)}
                </td>
                <td className="mono">{row.lapsLed > 0 ? row.lapsLed : '--'}</td>
                <td className="mono">{row.pitStops ?? '--'}</td>
                <td className="mono">{row.points ?? '--'}</td>
                <td className={row.finished ? 'stats-status-ok' : 'stats-status-out'}>
                  {row.finished ? 'Running' : row.dnfReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default DriverStatsPanel;
