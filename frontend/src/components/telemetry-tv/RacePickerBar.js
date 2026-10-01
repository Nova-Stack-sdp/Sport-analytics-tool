import { Link } from 'react-router-dom';

function raceLabel(race) {
  const parsedYear = race.sessionDate ? new Date(race.sessionDate).getFullYear() : NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  return [race.eventName, year].filter(Boolean).join(' · ') || race.slug;
}

// Full-width bar at the top of the replay page: the race catalogue picker on
// the left and the entry point to the F1 broadcast sync flow on the right.
function RacePickerBar({ races, selectedSlug, onSelectRace, loading }) {
  return (
    <div className="race-picker-bar">
      <div className="race-picker">
        <div className="race-picker-copy">
          <span className="race-picker-eyebrow">INDYCAR REPLAY</span>
          <label htmlFor="race-select" className="race-picker-label">Choose a race</label>
        </div>
        <select
          id="race-select"
          className="race-picker-select"
          value={selectedSlug}
          onChange={(event) => onSelectRace(event.target.value)}
          disabled={loading || races.length === 0}
        >
          {races.length === 0 && (
            <option value="">{loading ? 'Loading races…' : 'No races available'}</option>
          )}
          {races.map((raceOption) => (
            <option key={raceOption.slug} value={raceOption.slug}>
              {raceLabel(raceOption)}
            </option>
          ))}
        </select>
      </div>
      <Link className="sync-broadcast-button" to="/sync-f1-broadcast">
        RaceSync
      </Link>
    </div>
  );
}

export default RacePickerBar;
