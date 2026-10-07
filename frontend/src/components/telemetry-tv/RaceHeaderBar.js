import { memo } from 'react';
import ConditionsIcon from './ConditionsIcon';

// The broadcast's own upper-case flag wording. The DOM strings differ from
// the report's ("Green"/"Yellow") so the track-state badge in Race Control
// and this pill never collide in tests or on screen.
const FLAG_LABELS = {
  Green: 'GREEN',
  Yellow: 'YELLOW',
  Checker: 'CHECKERED',
};

// The band that names the broadcast: event, the conditions glyph the curator's
// note stands behind, live field size, and where the race stands right now.
// Rendered as soon as a race is picked — before the green flag it reads
// STANDBY, and once the report lands it answers to the same leader-lap flag and
// lap cursor the dashboards use.
const RaceHeaderBar = memo(function RaceHeaderBar({ race, lapLabel, flag, fieldSize, conditions }) {
  if (!race) return null;

  const flagClass = flag ? `flag-${String(flag).toLowerCase()}` : 'flag-standby';

  return (
    <section className="card race-header-bar" aria-label="Race header">
      <div className="race-header-main">
        <div className="race-header-titles">
          <div className="race-header-title">{race.eventName}</div>
          <div className="race-header-sub">{`Live • ${fieldSize ?? '--'} cars`}</div>
        </div>
        <ConditionsIcon conditions={conditions} />
      </div>
      <div className="race-header-stats">
        <span className="race-header-lap mono">{lapLabel}</span>
        <span className={`race-header-flag ${flagClass}`}>{FLAG_LABELS[flag] ?? 'STANDBY'}</span>
      </div>
    </section>
  );
});

export default RaceHeaderBar;
