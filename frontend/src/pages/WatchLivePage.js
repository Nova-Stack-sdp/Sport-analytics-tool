const masterBoardRows = [
  { position: 1, driver: 'Max Verstappen', team: 'RBR', speed: '218.6 km/h', tire: 'Soft', momentum: '+0.42s' },
  { position: 2, driver: 'Lando Norris', team: 'MCL', speed: '217.9 km/h', tire: 'Soft', momentum: '+0.18s' },
  { position: 3, driver: 'Charles Leclerc', team: 'FER', speed: '216.8 km/h', tire: 'Medium', momentum: '+0.12s' },
  { position: 4, driver: 'Carlos Sainz', team: 'FER', speed: '215.4 km/h', tire: 'Medium', momentum: '+0.06s' },
  { position: 5, driver: 'Oscar Piastri', team: 'MCL', speed: '214.7 km/h', tire: 'Soft', momentum: '-0.08s' },
  { position: 6, driver: 'George Russell', team: 'MER', speed: '213.9 km/h', tire: 'Hard', momentum: '-0.16s' },
];

const radarColumns = [
  {
    label: 'Front',
    accent: 'accent',
    entries: [
      { name: 'Verstappen', delta: '+0.42s', braking: '8.1', advice: 'Attack window open' },
      { name: 'Norris', delta: '+0.18s', braking: '7.6', advice: 'Tighten exits' },
    ],
  },
  {
    label: 'Midfield',
    accent: 'amber',
    entries: [
      { name: 'Leclerc', delta: '+0.12s', braking: '7.0', advice: 'Late-brake risk' },
      { name: 'Sainz', delta: '+0.06s', braking: '6.8', advice: 'Stay in DRS train' },
    ],
  },
  {
    label: 'Back',
    accent: 'red',
    entries: [
      { name: 'Russell', delta: '-0.16s', braking: '5.8', advice: 'Need more front bite' },
      { name: 'Piastri', delta: '-0.08s', braking: '6.2', advice: 'Wait for tire lift' },
    ],
  },
];

const tickerEvents = [
  { time: '12:14', text: 'Verstappen opens a 0.42s gap on the exit of Turn 9.', tone: 'positive' },
  { time: '12:17', text: 'Norris logs a faster middle sector, but tire wear is rising.', tone: 'neutral' },
  { time: '12:20', text: 'Leclerc is gaining on the last 2 corners with sharper brake points.', tone: 'positive' },
  { time: '12:23', text: 'Russell loses a tenth under braking after a late apex on Turn 4.', tone: 'negative' },
  { time: '12:27', text: 'Piastri is now within 0.08s of the top six pack.', tone: 'neutral' },
];

function WatchLivePage() {
  return (
    <div className="page" id="page-watch-live">
      <div className="pagehead">
        <div className="section-eyebrow">Live</div>
        <div className="section-title">Watch Live</div>
        <div className="section-desc">
          <h1>Watch Live</h1>
          <p>Follow the session as it happens.</p>
        </div>
      </div>

      <div className="content">
        <div className="watch-live-grid">
          <div className="watch-live-primary">
            <div className="card video-panel">
              <div className="card-head live-panel-head">
                <div>
                  <div className="card-title">Barcelona Session</div>
                  <div className="card-title-sub">Race simulation feed</div>
                </div>
                <span className="pill pill-green">Live</span>
              </div>

              <div className="video-embed">
                <iframe
                  src="https://www.youtube.com/embed/O3oYzBXzAIs?si=LDYbi9zAYU7namuA&start=5"
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>

              <div className="video-meta">
                <div>
                  <span className="label-soft">Race mode</span>
                  <strong>Track evolution</strong>
                </div>
                <div>
                  <span className="label-soft">Lap</span>
                  <strong>24 / 66</strong>
                </div>
                <div>
                  <span className="label-soft">Weather</span>
                  <strong>28°C / Dry</strong>
                </div>
              </div>
            </div>

            <div className="card radar-panel">
              <div className="card-head">
                <div>
                  <div className="card-title">BattleRadarBoard</div>
                  <div className="card-title-sub">Closing speed & late-brake pressure</div>
                </div>
                <span className="pill pill-blue">Auto analysis</span>
              </div>

              <div className="battle-radar-grid">
                {radarColumns.map((column) => (
                  <div key={column.label} className={`radar-column ${column.accent}`}>
                    <div className="radar-column-header">{column.label}</div>
                    {column.entries.map((entry) => (
                      <div key={entry.name} className="radar-entry">
                        <div className="radar-driver-row">
                          <span className="driver-dot" />
                          <span>{entry.name}</span>
                        </div>
                        <div className="radar-metric-row">
                          <span>Gap</span>
                          <strong>{entry.delta}</strong>
                        </div>
                        <div className="radar-metric-row">
                          <span>Brake</span>
                          <strong>{entry.braking}</strong>
                        </div>
                        <div className="radar-advice">{entry.advice}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card masterboard-card">
            <div className="card-head">
              <div>
                <div className="card-title leaderboard-title">Masterboard</div>
                <div className="card-title-sub">Race order & momentum</div>
              </div>
              <span className="pill pill-gray">Whole race</span>
            </div>

            <table className="masterboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Driver</th>
                  <th>Speed</th>
                  <th>Tire</th>
                  <th>Momentum</th>
                </tr>
              </thead>
              <tbody>
                {masterBoardRows.map((row) => (
                  <tr key={row.driver}>
                    <td className="mono position-cell">{row.position}</td>
                    <td>
                      <div className="driver-meta">
                        <span className={`team-badge ${row.team.toLowerCase()}`}>{row.team}</span>
                        <span>{row.driver}</span>
                      </div>
                    </td>
                    <td className="mono">{row.speed}</td>
                    <td>
                      <span className="tire-pill">{row.tire}</span>
                    </td>
                    <td className="mono momentum-cell">{row.momentum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card ticker-card">
          <div className="card-head">
            <div>
              <div className="card-title">Live text ticker</div>
              <div className="card-title-sub">Narrative feed</div>
            </div>
            <span className="pill pill-red">Moment-to-moment</span>
          </div>

          <div className="live-ticker">
            {tickerEvents.map((event) => (
              <div key={`${event.time}-${event.text}`} className={`ticker-row ${event.tone}`}>
                <span className="ticker-time">{event.time}</span>
                <span className="ticker-point" />
                <span>{event.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WatchLivePage;
