import { Link } from 'react-router-dom';

function DashboardPage() {
  return (
    <div className="page" id="page-overview">
      <div className="pagehead">
        <div className="section-eyebrow">Home</div>
        <div className="section-title">Overview</div>
        <div className="section-desc">
          A single glance at what the platform is doing right now: the live fixture, current standings, and anything in the queue that needs attention.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the brief doesn't ask for a landing page directly, but every other page here is either an operational tool (submissions) or a deep data view (statistics, datasets). This page pairs the live feed with the standings it's currently producing, so the platform's core promise — live events in, trustworthy stats out — is visible in one glance.
          </div>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-mini"><div className="l">Fixtures tracked</div><div className="v">412</div></div>
          <div className="stat-mini"><div className="l">Events ingested today</div><div className="v">2,451,872</div></div>
          <div className="stat-mini"><div className="l">Pending submissions</div><div className="v warn">3</div></div>
          <div className="stat-mini"><div className="l">API calls (24h)</div><div className="v accent">184,203</div></div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Miami Grand Prix 2026</div>
                <div className="card-title-sub">Lap 42 / 57 · in progress</div>
              </div>
              <span className="pill pill-red live-blink">Live</span>
            </div>
            <div className="video-frame">
              <img src="https://images.unsplash.com/photo-1752884991461-8ac432ad9266?fm=jpg&q=70&w=1000&auto=format&fit=crop" alt="Formula 1 cars at the start of the Monaco Grand Prix" />
              <div className="video-label"><span className="pill pill-red live-blink">Live</span> Broadcast feed</div>
            </div>
            <div className="log-ticker">
              <div className="log-row"><span className="log-time">18:42:16</span><span className="pill status-ingested" style={{ justifySelf: 'start' }}>Ingested</span><span className="log-event">event_984512</span><span className="mono secondary">LAP_COMPLETED</span></div>
              <div className="log-row"><span className="log-time">18:42:16</span><span className="pill status-ingested" style={{ justifySelf: 'start' }}>Ingested</span><span className="log-event">event_984513</span><span className="mono secondary">SECTOR_3</span></div>
              <div className="log-row"><span className="log-time">18:42:17</span><span className="pill status-delayed" style={{ justifySelf: 'start' }}>Delayed</span><span className="log-event">event_984515</span><span className="mono secondary">PIT_STOP</span></div>
              <div className="log-row"><span className="log-time">18:42:18</span><span className="pill status-ingested" style={{ justifySelf: 'start' }}>Ingested</span><span className="log-event">event_984517</span><span className="mono secondary">LAP_COMPLETED</span></div>
            </div>
            <Link to="/fixtures" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>Open fixture</Link>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title leaderboard-title">Driver leaderboard</div></div>
            <table>
              <tbody>
                <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Pts</th></tr>
                <tr><td>1</td><td>Max Verstappen</td><td><span className="team-tag team-redbull" title="Red Bull Racing" aria-label="Red Bull Racing">RB</span></td><td className="mono">186</td></tr>
                <tr><td>2</td><td>Sergio Perez</td><td><span className="team-tag team-redbull" title="Red Bull Racing" aria-label="Red Bull Racing">RB</span></td><td className="mono secondary">100</td></tr>
                <tr><td>3</td><td>Lewis Hamilton</td><td><span className="team-tag team-mercedes" title="Mercedes" aria-label="Mercedes">MER</span></td><td className="mono secondary">94</td></tr>
                <tr><td>4</td><td>George Russell</td><td><span className="team-tag team-mercedes" title="Mercedes" aria-label="Mercedes">MER</span></td><td className="mono secondary">74</td></tr>
                <tr><td>5</td><td>Charles Leclerc</td><td><span className="team-tag team-ferrari" title="Ferrari" aria-label="Ferrari">FER</span></td><td className="mono secondary">65</td></tr>
              </tbody>
            </table>
            <Link to="/statistics" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View full leaderboard</Link>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Team performance</div>
              <span className="card-title-sub">Season to date</span>
            </div>
            <div className="split-labels"><span>Red Bull · 58%</span><span>Mercedes · 42%</span></div>
            <div className="split-bar"><div style={{ width: '58%' }}></div><div style={{ width: '42%' }}></div></div>
            <div className="metric-row"><span className="metric-label">Points scored</span><div className="metric-vals"><span>286</span><span>208</span></div></div>
            <div className="metric-row"><span className="metric-label">Avg. lap time</span><div className="metric-vals"><span>1:16.532</span><span>1:18.912</span></div></div>
            <div className="metric-row"><span className="metric-label">Fastest laps</span><div className="metric-vals"><span>4</span><span>2</span></div></div>
            <div className="metric-row"><span className="metric-label">Pit stop avg (s)</span><div className="metric-vals"><span>2.31</span><span>2.48</span></div></div>
            <Link to="/statistics" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>View full comparison</Link>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Submission queue</div></div>
            <table>
              <tbody>
                <tr><th>Batch</th><th>Submitter</th><th>Status</th></tr>
                <tr><td>Monaco GP 2026</td><td className="secondary">analyst_042</td><td><span className="pill status-reviewing">Reviewing</span></td></tr>
                <tr><td>US GP 2026 telemetry</td><td className="secondary">official_017</td><td><span className="pill status-validating">Validating</span></td></tr>
                <tr><td>Brazil GP 2026</td><td className="secondary">analyst_019</td><td><span className="pill status-rejected">Rejected</span></td></tr>
              </tbody>
            </table>
            <Link to="/submissions" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>Open submissions</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;