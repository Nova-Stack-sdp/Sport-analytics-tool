import { memo } from 'react';
import { formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

const VISIBLE_ROWS = 12;

// Official per-driver classification numbers that the page never showed:
// best lap, average speed, laps led, pit stops, points and retirement reason.
const DriverStatsPanel = memo(function DriverStatsPanel({ driverStats }) {
  if (!driverStats || driverStats.rows.length === 0) return null;

  const rows = driverStats.rows.slice(0, VISIBLE_ROWS);

  return (
    <div className="card driver-stats-card">
      <div className="card-head">
        <div>
          <div className="card-title">Official Driver Stats</div>
          <div className="card-title-sub">
            Final classification · top {rows.length} of {driverStats.rows.length}
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
                </td>
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
