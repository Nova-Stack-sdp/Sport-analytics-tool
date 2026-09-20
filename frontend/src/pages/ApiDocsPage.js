import { Link } from 'react-router-dom';

function ApiDocsPage() {
  return (
    <div className="page" id="page-api-docs">
      <div className="pagehead">
        <div className="section-eyebrow">Developer → API documentation</div>
        <div className="section-title">API Documentation</div>
        <div className="section-desc">
          A hand-written REST API in front of Prisma/PostgreSQL — no BaaS-generated surface. Everything below is live and unauthenticated unless noted otherwise.
        </div>
      </div>

      <div className="content">
        <Link to="/developer" className="btn btn-ghost" style={{ marginBottom: 16, display: 'inline-block' }}>
          ← Back to Developer
        </Link>

        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Current status:</b> Overview, Statistics, Fixtures/Events, and Time-Travel are live and read from real, derived data. Submissions, Datasets, and Admin are still static UI — there's no write endpoint yet.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">Architecture</div>
          </div>
          <p className="card-note" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 14 }}>
            An Express app (<span className="mono">backend/src/app.js</span>) deployed on Northflank sits in front of Prisma, reading from a PostgreSQL database hosted on Neon. The frontend talks to it over <span className="mono">REACT_APP_API_URL</span>.
          </p>
          <div className="pipeline-steps">
            <div className="pstep done"><div className="n">1</div><div className="t">Browser (Netlify)</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">2</div><div className="t">Express (Northflank)</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">3</div><div className="t">Prisma</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">4</div><div className="t">PostgreSQL (Neon)</div></div>
          </div>
          <div className="card-note">
            Step 2 fans out to four route groups — Overview, Statistics, Fixtures, and Time-Travel — each querying Prisma independently before the response reaches the browser.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">Live endpoints</div>
            <span className="card-title-sub">All responses are JSON · read-only · no auth required yet</span>
          </div>
          <table className="results">
            <thead>
              <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/, /health</td>
                <td>Health check — both return <span className="mono">200 {'{ status: "ok" }'}</span>. Northflank's health check points at <span className="mono">/health</span>.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/overview</td>
                <td>Dashboard summary: fixture/session counts, pending submissions, events in the last 24h, current-season leaderboard (top 5) and team comparison (top 2), latest session with its 5 most recent events, and the 5 most recent submissions.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/statistics?view=season|career|fixture</td>
                <td>
                  Driver statistics, three ways. <span className="mono">season</span> (default) is one row per driver for a given <span className="mono">?season=</span>, defaulting to the most recent season with data. <span className="mono">career</span> aggregates totals across every season a driver has raced. <span className="mono">fixture</span> gives per-driver results for one <span className="mono">?sessionId=</span>, defaulting to the most recent session.
                </td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/fixtures</td>
                <td>Every session (fixture), newest first, each flagged with <span className="mono">hasCorrections</span> — derived by checking whether any of its events have been superseded, not a stored column.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/fixtures/:sessionId/events</td>
                <td>The full chronological event log for one fixture (capped at 200 rows), plus a count of how many entries have derived stats for it. This is the raw record everything else is derived from.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/timetravel/context?sessionId=</td>
                <td>Powers the Time-Travel page's selectors: a session's real submission history as checkpoints (one per submission that ever touched the session, in ingestion order) and its driver entries.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/timetravel/changelog?entryId=</td>
                <td>Every classification event ever written for one entry, in ingestion order — the audit trail for a driver's final position/points, including any later corrections.</td>
              </tr>
              <tr>
                <td><span className="method get">GET</span></td>
                <td className="mono">/api/timetravel/asof?sessionId=&entryId=&date=</td>
                <td>Reconstructs one entry's session stats as they'd have appeared as of a given date — counting only events from submissions made at or before the cutoff, using the same derivation math as the live stats.</td>
              </tr>
            </tbody>
          </table>
          <div className="card-note">
            Anything under <span className="mono">/api</span> that doesn't match a route returns <span className="mono">404 {'{ error: "Not found" }'}</span>. Unhandled errors are caught centrally, logged server-side, and returned as a generic <span className="mono">500 {'{ error: "Internal server error" }'}</span> — no stack traces leak to the client. CORS is controlled by the <span className="mono">FRONTEND_ORIGIN</span> env var (comma-separated for multiple origins); it falls back to <span className="mono">*</span> if unset, which is fine locally but shouldn't be relied on in production.
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Authentication</div>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 0 }}>
              The frontend authenticates directly against Firebase (sign up, sign in, Google/GitHub OAuth), gating Submissions, Datasets, Developer, and Admin client-side.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              On the backend, <span className="mono">requireAuth</span> middleware verifies a Firebase ID token (<span className="mono">Authorization: Bearer &lt;token&gt;</span>) via <span className="mono">firebase-admin</span>. It's written and ready, but <b>not yet applied to any route</b> — every current endpoint is read-only and open.
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">User roles</div>
              <span className="card-title-sub">Confirmed with the client, 2026-08-14</span>
            </div>
            <div className="kv"><span>Viewer — no login</span><span className="pill pill-green">Live</span></div>
            <div className="kv"><span>Approved submitter — must log in to submit</span><span className="pill pill-amber">Frontend gate only</span></div>
            <div className="kv"><span>API consumer — login for traceability</span><span className="pill pill-red">Not enforced</span></div>
            <div className="card-note">
              The frontend gate for approved submitters already exists (<span className="mono">RequireAuth</span> on Submissions/Datasets); the write endpoint it would call doesn't exist yet.
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">External API integration — OpenF1</div>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 0 }}>
            Real F1 data — sessions, meetings, circuits, lap times, pit stops, tyre stints, position changes, starting grid, race control messages, weather, and session results — is pulled from the <a href="https://openf1.org/" target="_blank" rel="noreferrer">OpenF1 API</a> to seed our own event data.
          </p>
          <div className="pipeline-steps">
            <div className="pstep done"><div className="n">1</div><div className="t">openf1-sync.js</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">2</div><div className="t">syncDimensions()</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">3</div><div className="t">collectEvents()</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">4</div><div className="t">Submission + batch insert</div></div>
            <div className="pline"></div>
            <div className="pstep done"><div className="n">5</div><div className="t">runDerivationForSession()</div></div>
          </div>
          <div className="card-note" style={{ marginBottom: 14 }}>
            Stats are live in the API immediately after a sync completes.
          </div>
          <table className="results">
            <thead>
              <tr><th>Limitation</th><th>Workaround</th></tr>
            </thead>
            <tbody>
              <tr><td className="secondary"><span className="mono">/laps</span> has no <span className="mono">position</span> field</td><td>Left null on <span className="mono">lap_completed</span>; position comes from <span className="mono">/position</span> as <span className="mono">position_change</span> events instead</td></tr>
              <tr><td className="secondary"><span className="mono">/pit</span> gives one timestamp, not entry/exit</td><td>Exit time approximated as <span className="mono">entry_time + pit_duration</span></td></tr>
              <tr><td className="secondary">OpenF1 doesn't label what caused a position change</td><td><span className="mono">position_change.cause</span> always defaults to <span className="mono">on_track</span></td></tr>
              <tr><td className="secondary">No clean OpenF1 source for session status</td><td><span className="mono">session_status_change</span> events aren't populated yet</td></tr>
              <tr><td className="secondary">No dedicated slot for Sprint Qualifying/Shootout</td><td>Both map to <span className="mono">SessionType.Q</span></td></tr>
              <tr><td className="secondary"><span className="mono">/starting_grid</span> only populated under the qualifying session key</td><td>Sync looks up the meeting's qualifying session and queries against that, not the race session</td></tr>
            </tbody>
          </table>
          <div className="card-note">
            Evaluating additional external APIs (e.g. weather-at-circuit) where they'd add real analytical value, rather than as a token integration — nothing further has been added yet.
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Not connected yet</div>
          </div>
          <div className="kv"><span>Manual submission (<span className="mono">POST</span>)</span><span className="pill pill-gray">No endpoint yet</span></div>
          <div className="kv"><span>Submissions / Datasets / Admin pages</span><span className="pill pill-gray">Static UI</span></div>
          <div className="kv"><span>Write-side auth enforcement</span><span className="pill pill-gray">Nothing to protect yet</span></div>
          <div className="card-note">
            Once there's a write surface as well as the current read-only endpoints, we're planning to generate an interactive reference from an OpenAPI/Swagger spec instead of maintaining this page by hand. Until then, this is the source of truth.
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiDocsPage;