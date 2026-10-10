import { memo } from 'react';

// Who led when: one segment per official lead stretch, laid across the race
// distance, with caution windows shaded. The driver who led the most laps is
// picked out in red; the rest read as neutral bars so the shape of the race
// — long control vs brief interchanges — is the story. While the replay is
// still running the stretches are clipped to the current lap and the header
// strip carries the running lead-change and yellow-lap counts (the old Race
// So Far card's two live numbers, folded in here where they belong).
const LeadBattle = memo(function LeadBattle({ leadBattle, lap, isFinished }) {
  if (!leadBattle || leadBattle.stretches.length === 0) return null;

  const { stretches, cautions, totalLaps, lapsLed, raceSoFar } = leadBattle;
  const spanPercent = (fromLap, toLap) => ({
    left: `${(((fromLap - 0.5) / totalLaps) * 100).toFixed(3)}%`,
    width: `${((((toLap - fromLap + 1) / totalLaps)) * 100).toFixed(3)}%`,
  });

  return (
    <section className="card lead-battle-card" aria-label="Lead battle">
      <div className="card-head">
        <div>
          <div className="card-title">Lead Battle</div>
          <div className="card-title-sub">
            {isFinished
              ? `Official lead stretches${totalLaps ? ` across ${totalLaps} laps` : ''}`
              : `Lead stretches through lap ${lap} of ${totalLaps}`}
          </div>
        </div>
        <span className="pill pill-gray">
          {lapsLed.length} {lapsLed.length === 1 ? 'leader' : 'leaders'}
        </span>
      </div>

      {!isFinished && raceSoFar && (
        <div className="lead-battle-sofar">
          <span className="lead-battle-sofar-chip">
            <strong>{raceSoFar.leadChanges}</strong>
            {` lead change${raceSoFar.leadChanges === 1 ? '' : 's'}`}
          </span>
          <span className="lead-battle-sofar-chip is-yellow">
            <strong>{raceSoFar.cautionLaps}</strong>
            {` lap${raceSoFar.cautionLaps === 1 ? '' : 's'} under yellow`}
          </span>
        </div>
      )}

      <div
        className="lead-battle-chart"
        role="img"
        aria-label={`Lead stretches across ${totalLaps} laps, ${lapsLed.length} different leader${lapsLed.length === 1 ? '' : 's'}`}
      >
        {stretches.map((stretch, index) => (
          <span
            key={`${stretch.car ?? stretch.driver}-${stretch.fromLap}-${index}`}
            className={`lead-battle-segment${stretch.isLeader ? ' is-leader' : ''}`}
            style={spanPercent(stretch.fromLap, stretch.toLap)}
            title={[
              stretch.driver ? `${stretch.driver} · #${stretch.car}` : `Car #${stretch.car}`,
              `led laps ${stretch.fromLap}–${stretch.toLap}`,
              stretch.laps != null ? `(${stretch.laps} ${stretch.laps === 1 ? 'lap' : 'laps'})` : null,
            ].filter(Boolean).join(' ')}
          />
        ))}
        {cautions.map((caution, index) => (
          <span
            key={`caution-${caution.fromLap}-${index}`}
            className="lead-battle-caution"
            style={spanPercent(caution.fromLap, caution.toLap)}
            title={`Caution: laps ${caution.fromLap}–${caution.toLap}`}
          />
        ))}
      </div>

      <div className="lead-battle-scale" aria-hidden="true">
        <span>Lap 1</span>
        <span>Lap {totalLaps}</span>
      </div>

      <div className="lead-battle-legend">
        {lapsLed.map((entry) => (
          <span
            key={entry.car ?? entry.driver}
            className={`lead-battle-chip${entry.laps === leadBattle.leaderLaps ? ' is-leader' : ''}`}
          >
            <span className="lead-battle-chip-name">
              {entry.driver ?? `Car #${entry.car}`}
            </span>
            <span className="lead-battle-chip-laps mono">
              {entry.laps} {entry.laps === 1 ? 'lap' : 'laps'}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
});

export default LeadBattle;
