// Battle Radar - full-width section showing current race dynamics.
// Shows each driver's gap to the car ahead and the pace advantage needed
// to close it — the real number that matters for an overtake.
function overtakeAdvice(entry) {
  if (entry.position === 1) return 'In clear air — setting the pace';
  if (entry.gapToAhead == null || entry.gapToAhead <= 0) return 'Collecting telemetry\u2026';

  if (entry.lastLapTime != null && entry.aheadLastLapTime != null) {
    const paceAdv = entry.aheadLastLapTime - entry.lastLapTime;
    if (paceAdv > 0.1) {
      const lapsToCatch = Math.ceil(entry.gapToAhead / paceAdv);
      if (entry.gapToAhead < 1.0) {
        return `Right behind — ${paceAdv.toFixed(1)}s faster per lap`;
      }
      return `${paceAdv.toFixed(1)}s faster per lap — ~${lapsToCatch} laps to catch`;
    }
    if (paceAdv < -0.1) {
      return `Losing ${Math.abs(paceAdv).toFixed(1)}s per lap — gap widening`;
    }
    return 'Matching pace — gap steady';
  }

  return `Need +${entry.gapToAhead.toFixed(1)}s/lap advantage to catch`;
}

function BattleRadar({ leaderboard }) {
  if (leaderboard.length === 0) {
    return (
      <div className="card battle-radar-section">
        <div className="card-head">
          <div>
            <div className="card-title">Battle Radar</div>
            <div className="card-title-sub">Front, midfield, and back action</div>
          </div>
          <span className="pill pill-blue">Race dynamics</span>
        </div>
        <div className="battle-radar-empty">
          Load and sync a race to see battle dynamics.
        </div>
      </div>
    );
  }

  // Build a lookup for the driver ahead so each entry knows the car in front's pace.
  const driverByPosition = new Map(leaderboard.map((d) => [d.position, d]));

  const totalDrivers = leaderboard.length;
  const entriesAtPositions = (positions) => positions
    .map((position) => {
      const entry = leaderboard.find((e) => e.position === position);
      if (!entry) return null;
      const ahead = position > 1 ? driverByPosition.get(position - 1) : null;
      return {
        ...entry,
        aheadDriverName: ahead?.driverName ?? null,
        aheadLastLapTime: ahead?.lastLapTime ?? null,
      };
    })
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
    <div className="card battle-radar-section">
      <div className="card-head">
        <div>
          <div className="card-title">Battle Radar</div>
          <div className="card-title-sub">Gap to car ahead and pace needed to overtake</div>
        </div>
        <span className="pill pill-blue">Race dynamics</span>
      </div>

      <div className="battle-radar-grid">
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
                  <span>Gap to{entry.aheadDriverName ? ` ${entry.aheadDriverName.split(' ').pop()}` : ' ahead'}</span>
                  <strong className={entry.gapToAhead != null && entry.gapToAhead > 0 ? 'radar-gap' : ''}>
                    {entry.position === 1
                      ? 'LEADER'
                      : entry.gapToAhead != null && entry.gapToAhead > 0
                        ? `+${entry.gapToAhead.toFixed(1)}s`
                        : '--'}
                  </strong>
                </div>
                <div className="radar-metric-row">
                  <span>Tyre</span>
                  <strong>{entry.tyreCompound ?? '--'}</strong>
                </div>
                <div className="radar-advice">{overtakeAdvice(entry)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BattleRadar;
