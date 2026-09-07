import { useState } from 'react';

function SessionSetupBar({ onFindRace }) {
  const [season, setSeason] = useState('');
  const [gpName, setGpName] = useState('');

  const handleFindRace = () => {
    if (onFindRace) {
      onFindRace({ season, gpName });
    }
  };

  return (
    <div className="session-setup-bar">
      <div className="setup-bar-content">
        <div className="setup-bar-inputs">
          <div className="setup-field">
            <label htmlFor="season-input" className="setup-label">Season</label>
            <input
              id="season-input"
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g. 2024"
              className="setup-input"
            />
          </div>

          <div className="setup-field">
            <label htmlFor="gp-input" className="setup-label">Grand Prix name contains</label>
            <input
              id="gp-input"
              type="text"
              value={gpName}
              onChange={(e) => setGpName(e.target.value)}
              placeholder="e.g. Monaco"
              className="setup-input"
            />
          </div>

          <button className="setup-button" onClick={handleFindRace}>
            Find race
          </button>
        </div>

        <div className="setup-bar-helper">
          <p className="helper-text">
            Sync happens automatically when you hit play.
          </p>
        </div>

        <div className="setup-bar-steps">
          <span className="step-indicator">1. find race · 2. sync clock</span>
        </div>
      </div>
    </div>
  );
}

export default SessionSetupBar;
