// Renders the synchronized leaderboard and tyre strategy.
function Masterboard({ leaderboard, error }) {
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
          {leaderboard.length === 0 ? (
            <tr>
              <td colSpan="7" className="watch-live-empty-cell">{error ?? 'No playback data available.'}</td>
            </tr>
          ) : leaderboard.map((row) => (
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
}

export default Masterboard;