// Renders the synchronized leaderboard and tyre strategy.
function Masterboard({ leaderboard, error }) {
  return (
    <div className="card masterboard-card">
      <div className="card-head">
        <div>
          <div className="card-title leaderboard-title">Masterboard</div>
          <div className="card-title-sub">Current race order and strategy</div>
        </div>
        <span className="pill pill-gray">Playback time</span>
      </div>

      <table className="masterboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Driver</th>
            <th>Team</th>
            <th>Tire</th>
            <th>Stint</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td colSpan="5" className="watch-live-empty-cell">{error ?? 'No playback data available.'}</td>
            </tr>
          ) : leaderboard.map((row) => (
            <tr key={row.driverNumber}>
              <td className="mono position-cell">{row.position}</td>
              <td><div className="driver-meta"><span>{row.driverName ?? `Driver ${row.driverNumber}`}</span></div></td>
              <td className="mono">{row.teamName ?? '--'}</td>
              <td><span className="tire-pill">{row.tyreCompound ?? '--'}</span></td>
              <td className="mono momentum-cell">{row.stintNumber ?? '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Masterboard;