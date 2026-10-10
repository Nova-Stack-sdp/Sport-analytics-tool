import { memo } from 'react';

// Leader identity colours: the page's four broadcast tones at full strength
// (RaceSync's F1 red, pit-call green and blue, the medium tyre's yellow), each
// paired with the ink that keeps the car number legible on it, plus two deeper
// variants so a race with many leaders never runs out of distinct stripes.
// Identity, not meaning — the legend names whose run each stripe is.
const LEADER_COLORS = [
  { fill: '#E10600', ink: '#FFFFFF' },
  { fill: '#00A650', ink: '#FFFFFF' },
  { fill: '#FFD12E', ink: '#1F1602' },
  { fill: '#0A84FF', ink: '#FFFFFF' },
  { fill: '#00843F', ink: '#FFFFFF' },
  { fill: '#A80400', ink: '#FFFFFF' },
];

const RaceTimeline = memo(function RaceTimeline({ race, lapState }) {
  if (!race) return null;

  const { lap, totalLaps, isFinished, visibleLeaderRuns, visibleCautions, visiblePitStops } = lapState;
  const timelineLaps = isFinished ? totalLaps : lap;
  const leaders = visibleLeaderRuns ?? [];
  const cautions = visibleCautions ?? [];
  const allPitStops = (race.pitStops ?? []).flatMap((entry) => (
    (entry.stops ?? []).map((stop) => ({ ...stop, car: entry.car, driver: entry.driver }))
  ));
  const pitStops = (visiblePitStops ?? []).flatMap((entry) => (
    (entry.stops ?? []).map((stop) => ({ ...stop, car: entry.car, driver: entry.driver }))
  ));
  // Curated stop lists carry a basis label; when they cover fewer stops than
  // the official classification recorded, say so instead of pretending the
  // markers are the full picture.
  const curatedStops = allPitStops.some((stop) => stop.basis);
  const officialStops = (race.classification ?? []).reduce(
    (total, entry) => total + (Number(entry.PitStops) || 0),
    0
  );
  const coverageNote = curatedStops && officialStops > allPitStops.length
    ? `Broadcast-called stops only (${allPitStops.length} of ${officialStops}).`
    : null;

  return (
    <section className="card race-timeline-card" aria-label="Race sequence">
      <div className="card-head">
        <div>
          <div className="card-title">Race Sequence</div>
          <div className="card-title-sub">
            {isFinished ? 'Complete race history' : `History through lap ${lap}`}
          </div>
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
          const left = ((Number(entry.from) - 1) / timelineLaps) * 100;
          const width = (Number(entry.laps) / timelineLaps) * 100;
          const color = LEADER_COLORS[index % LEADER_COLORS.length];
          return (
            <span
              key={`${entry.car}-${entry.from}`}
              className="leader-run"
              title={`${entry.driver} (#${entry.car}), laps ${entry.from}-${entry.to}`}
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color.fill, color: color.ink }}
            >
              {width > 8 ? `#${entry.car}` : ''}
            </span>
          );
        })}
        <span className="timeline-cursor" style={{ left: '100%' }} />
      </div>
      <div className="leader-timeline-legend">
        {leaders.map((entry, index) => {
          const color = LEADER_COLORS[index % LEADER_COLORS.length];
          return (
            <div className="leader-legend-item" key={`${entry.car}-${entry.from}`}>
              <span
                className="leader-legend-swatch"
                style={{ backgroundColor: color.fill }}
              />
              <span>{entry.driver}</span>
              <span className="leader-legend-laps">L{entry.from}–{entry.to}</span>
            </div>
          );
        })}
      </div>

      <div className="timeline-row-label">Cautions</div>
      <div
        className="race-timeline-track caution-track"
        role="img"
        aria-label={cautions.length
          ? cautions.map((entry) => `Yellow, laps ${entry.from} to ${entry.to}`).join('; ')
          : isFinished ? 'No cautions recorded' : 'No cautions through selected lap'}
      >
        {cautions.map((entry) => {
          const left = ((Number(entry.from) - 1) / timelineLaps) * 100;
          const width = (Number(entry.laps) / timelineLaps) * 100;
          return (
            <span
              key={`${entry.from}-${entry.to}`}
              className="caution-run"
              title={`Yellow, laps ${entry.from}-${entry.to}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
        <span className="timeline-cursor" style={{ left: '100%' }} />
      </div>
      <div className="timeline-row-label">Pit stops</div>
      <div
        className="race-timeline-track pit-track"
        role="img"
        aria-label={pitStops.length
          ? pitStops.map((stop) => `${stop.driver}, lap ${stop.raceLap ?? stop.lap}`).join('; ')
          : allPitStops.length
            ? `No pit stops through lap ${lap}`
            : 'Lap-level pit-stop records unavailable'}
      >
        {pitStops.map((stop, index) => {
          const stopLap = Number(stop.raceLap ?? stop.lap);
          const left = ((stopLap - 1) / timelineLaps) * 100;
          return (
            <span
              key={`${stop.car}-${stop.stop}-${index}`}
              className="pit-stop-marker"
              title={`${stop.driver} (#${stop.car}), lap ${stopLap}`}
              style={{ left: `${left}%` }}
            />
          );
        })}
        <span className="timeline-cursor" style={{ left: '100%' }} />
      </div>
      {pitStops.length === 0 ? (
        <div className="pit-data-note">
          {allPitStops.length
            ? `No pit stops through lap ${lap}.`
            : 'Lap-level pit-stop records unavailable in this report.'}
        </div>
      ) : coverageNote ? (
        <div className="pit-data-note">{coverageNote}</div>
      ) : null}
      <div className="timeline-axis"><span>Lap 1</span><span>Lap {timelineLaps}</span></div>
    </section>
  );
});

export default RaceTimeline;