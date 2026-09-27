import { memo } from 'react';

const LEADER_COLORS = ['#f5c451', '#69c3a5', '#e8745d', '#81a9e8', '#dc8bc0', '#b2c96b'];

const RaceTimeline = memo(function RaceTimeline({ race, lap }) {
  if (!race) return null;

  const totalLaps = Number(race.session?.totalLaps) || 1;
  const leaders = race.leaders ?? [];
  const cautions = race.cautions ?? [];
  const pitStops = (race.pitStops ?? []).flatMap((entry) => (
    (entry.stops ?? []).map((stop) => ({ ...stop, car: entry.car, driver: entry.driver }))
  ));
  const cursor = `${((lap - 0.5) / totalLaps) * 100}%`;

  return (
    <section className="card race-timeline-card" aria-label="Race sequence">
      <div className="card-head">
        <div>
          <div className="card-title">Race Sequence</div>
          <div className="card-title-sub">Leader runs and caution periods by lap</div>
        </div>
        <span className="pill pill-gray">Lap {lap} of {totalLaps}</span>
      </div>

      <div className="timeline-row-label">Race leader</div>
      <div
        className="race-timeline-track leader-track"
        role="img"
        aria-label={leaders.map((entry) => `${entry.driver}, laps ${entry.from} to ${entry.to}`).join('; ')}
      >
        {leaders.map((entry, index) => {
          const left = ((Number(entry.from) - 1) / totalLaps) * 100;
          const width = (Number(entry.laps ?? (entry.to - entry.from + 1)) / totalLaps) * 100;
          return (
            <span
              key={`${entry.car}-${entry.from}`}
              className="leader-run"
              title={`${entry.driver} (#${entry.car}), laps ${entry.from}-${entry.to}`}
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: LEADER_COLORS[index % LEADER_COLORS.length] }}
            >
              {width > 8 ? `#${entry.car}` : ''}
            </span>
          );
        })}
        <span className="timeline-cursor" style={{ left: cursor }} />
      </div>
      <div className="leader-timeline-legend">
        {leaders.map((entry, index) => (
          <div className="leader-legend-item" key={`${entry.car}-${entry.from}`}>
            <span
              className="leader-legend-swatch"
              style={{ backgroundColor: LEADER_COLORS[index % LEADER_COLORS.length] }}
            />
            <span>{entry.driver}</span>
            <span className="leader-legend-laps">L{entry.from}–{entry.to}</span>
          </div>
        ))}
      </div>

      <div className="timeline-row-label">Cautions</div>
      <div
        className="race-timeline-track caution-track"
        role="img"
        aria-label={cautions.length
          ? cautions.map((entry) => `Yellow, laps ${entry.from} to ${entry.to}`).join('; ')
          : 'No cautions recorded'}
      >
        {cautions.map((entry) => {
          const left = ((Number(entry.from) - 1) / totalLaps) * 100;
          const width = (Number(entry.laps ?? (entry.to - entry.from + 1)) / totalLaps) * 100;
          return (
            <span
              key={`${entry.from}-${entry.to}`}
              className="caution-run"
              title={`Yellow, laps ${entry.from}-${entry.to}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
        <span className="timeline-cursor" style={{ left: cursor }} />
      </div>
      <div className="timeline-row-label">Pit stops</div>
      <div
        className="race-timeline-track pit-track"
        role="img"
        aria-label={pitStops.length
          ? pitStops.map((stop) => `${stop.driver}, lap ${stop.raceLap ?? stop.lap}`).join('; ')
          : 'Lap-level pit-stop records unavailable'}
      >
        {pitStops.map((stop, index) => {
          const stopLap = Number(stop.raceLap ?? stop.lap);
          const left = ((stopLap - 1) / totalLaps) * 100;
          return (
            <span
              key={`${stop.car}-${stop.stop}-${index}`}
              className="pit-stop-marker"
              title={`${stop.driver} (#${stop.car}), lap ${stopLap}`}
              style={{ left: `${left}%` }}
            />
          );
        })}
        <span className="timeline-cursor" style={{ left: cursor }} />
      </div>
      {pitStops.length === 0 && (
        <div className="pit-data-note">Lap-level pit-stop records unavailable in this report.</div>
      )}
      <div className="timeline-axis"><span>Lap 1</span><span>Lap {totalLaps}</span></div>
    </section>
  );
});

export default RaceTimeline;