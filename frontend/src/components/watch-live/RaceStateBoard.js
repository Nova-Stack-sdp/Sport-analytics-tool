// Groups the current race order into a compact state board.
function RaceStateBoard({ leaderboard }) {
  const columns = [
    { label: 'Front', accent: 'accent', entries: leaderboard.slice(0, 2) },
    { label: 'Midfield', accent: 'amber', entries: leaderboard.slice(2, 4) },
    { label: 'Back', accent: 'red', entries: leaderboard.slice(4, 6) },
  ];

  return (
    <div className="card radar-panel">
      <div className="card-head">
        <div>
          <div className="card-title">Race state board</div>
          <div className="card-title-sub">Current positions and tyre stints</div>
        </div>
        <span className="pill pill-blue">Synchronized</span>
      </div>

      <div className="battle-radar-grid">
        {leaderboard.length === 0 && <div className="radar-empty-state">No playback data available.</div>}
        {columns.map((column) => column.entries.length > 0 && (
          <div key={column.label} className={`radar-column ${column.accent}`}>
            <div className="radar-column-header">{column.label}</div>
            {column.entries.map((entry) => (
              <div key={entry.driverNumber} className="radar-entry">
                <div className="radar-driver-row">
                  <span className="driver-dot" />
                  <span>{entry.driverName ?? `Driver ${entry.driverNumber}`}</span>
                </div>
                <div className="radar-metric-row">
                  <span>Position</span>
                  <strong>P{entry.position}</strong>
                </div>
                <div className="radar-metric-row">
                  <span>Momentum</span>
                  <strong>{entry.positionChange == null ? '--' : `${entry.positionChange > 0 ? '+' : ''}${entry.positionChange}`}</strong>
                </div>
                <div className="radar-metric-row">
                  <span>Tyre</span>
                  <strong>{entry.tyreCompound ?? '--'}</strong>
                </div>
                <div className="radar-advice">{entry.momentum}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RaceStateBoard;