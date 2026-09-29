function RaceWeatherPanel({ raceSlug, weather, strategySignals = [], narrative }) {
  if (!weather && strategySignals.length === 0 && !narrative) return null;

  const trackLabel = raceSlug === 'toronto-2025' ? 'Toronto conditions' : 'Race context';

  const liveChips = [
    { label: 'Track', value: weather?.note ? 'Dry + evolving' : 'Context pending' },
    { label: 'Grip', value: weather?.grip ? 'Ramping quickly' : 'TBD' },
    { label: 'Bias', value: 'Strategy > raw speed' },
  ];

  return (
    <div className="card race-weather-panel">
      <div className="card-head">
        <div>
          <div className="card-title">Pace & Strategy Intelligence</div>
          <div className="card-title-sub">{trackLabel}</div>
        </div>
        <div className="weather-header-badges">
          <span className="pill pill-blue">Live</span>
          <span className="pill pill-gray">Weather</span>
        </div>
      </div>

      <div className="race-weather-grid">
        <div className="weather-main-panel">
          <div className="weather-kicker">Conditions</div>
          <div className="weather-summary">{weather?.note || 'Track and weather context unavailable.'}</div>
          {weather?.grip && (
            <div className="weather-grip">{weather.grip}</div>
          )}
          <div className="weather-chip-row">
            {liveChips.map((chip) => (
              <div key={chip.label} className="weather-chip">
                <span>{chip.label}</span>
                <strong>{chip.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="weather-signals">
          {strategySignals.map((signal) => (
            <div key={signal.label} className="weather-signal-item">
              <div className="weather-signal-label">{signal.label}</div>
              <div className="weather-signal-value">{signal.value}</div>
              <div className="weather-signal-detail">{signal.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {narrative && <div className="weather-narrative">{narrative}</div>}
    </div>
  );
}

export default RaceWeatherPanel;
