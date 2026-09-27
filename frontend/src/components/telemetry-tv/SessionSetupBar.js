function raceLabel(race) {
  const parsedYear = race.sessionDate ? new Date(race.sessionDate).getFullYear() : NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  return [race.eventName, year].filter(Boolean).join(' · ') || race.slug;
}

function SessionSetupBar({ races, selectedSlug, onSelectRace, loading }) {
  return (
    <div className="session-setup-bar">
      <div className="setup-bar-content">
        <div className="setup-bar-header">
          <span>Session Setup & Sync</span>
          <span className="step-indicator">1. select race - 2. sync clock</span>
        </div>

        <div className="setup-bar-inputs">
          <div className="setup-field">
            <label htmlFor="race-select" className="setup-label">Race</label>
            <select
              id="race-select"
              className="setup-input"
              value={selectedSlug}
              onChange={(e) => onSelectRace(e.target.value)}
              disabled={loading || races.length === 0}
            >
              {races.length === 0 && (
                <option value="">{loading ? 'Loading races…' : 'No races available'}</option>
              )}
              {races.map((race) => (
                <option key={race.slug} value={race.slug}>
                  {raceLabel(race)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionSetupBar;
