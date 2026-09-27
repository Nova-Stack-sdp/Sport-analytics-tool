import { memo } from 'react';

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

// Renders the official running order reconstructed from the selected lap chart.
const Masterboard = memo(function Masterboard({ race, lap, leaderboard, loading, error }) {
  if (!race || leaderboard.length === 0) {
    return (
      <div className="card masterboard-card">
        <div className="card-head">
          <div>
            <div className="card-title leaderboard-title">Running Order</div>
            <div className="card-title-sub">Official order by race lap</div>
          </div>
          <span className="pill pill-gray">Archive</span>
        </div>

        <div className="masterboard-empty-state">
          {error ?? (loading ? 'Loading race report…' : 'No running-order data for this lap.')}
        </div>
      </div>
    );
  }

  return (
    <div className="card masterboard-card">
      <div className="card-head">
        <div>
            <div className="card-title leaderboard-title">Running Order</div>
            <div className="card-title-sub">Official order at lap {lap}</div>
        </div>
        <span className="pill pill-gray">{leaderboard.length} cars</span>
      </div>

      <div className="masterboard-scroll">
        <table className="masterboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Car</th>
              <th>Driver</th>
              <th>Team</th>
              <th>Grid</th>
              <th>Change</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr key={row.carNumber}>
                <td className="mono position-cell">P{row.position}</td>
                <td className="mono">{row.carNumber}</td>
                <td><div className="driver-meta"><span>{row.driverName}</span></div></td>
                <td>{row.teamName ?? '--'}</td>
                <td className="mono">{row.startPosition ?? '--'}</td>
                <td className={`mono grid-cell ${gridDeltaClass(row.gridDelta)}`}>{gridDeltaLabel(row.gridDelta)}</td>
                <td className="mono">{row.finishPosition == null ? '--' : `P${row.finishPosition}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default Masterboard;
