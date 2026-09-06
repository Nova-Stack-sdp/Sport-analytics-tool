// Groups the current race order into a compact state board.
function RaceStateBoard({ leaderboard }) {
  const totalDrivers = leaderboard.length;
  const entriesAtPositions = (positions) => positions
    .map((position) => leaderboard.find((entry) => entry.position === position))
    .filter(Boolean);
  const columns = [
    { label: 'Front', accent: 'accent', entries: entriesAtPositions([1, 2, 3]) },
    {
      label: 'Midfield',
      accent: 'amber',
      entries: entriesAtPositions([Math.floor(totalDrivers / 2), Math.floor(totalDrivers / 2) + 1, Math.floor(totalDrivers / 2) + 2]),
    },
    { label: 'Back', accent: 'red', entries: entriesAtPositions([totalDrivers, totalDrivers - 1, totalDrivers - 2]) },
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
        {columns.map((column) => (
          <div key={column.label} className={`radar-column ${column.accent}`}>
            <div className="radar-column-header">{column.label}</div>
            {column.entries.length === 0 && <div className="radar-column-empty">No drivers in this range.</div>}
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
                  <strong>{entry.positionChange == null ? '--' : entry.positionChange === 0 ? '0m/s' : `${entry.positionChange > 0 ? '+' : ''}${entry.positionChange}`}</strong>
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