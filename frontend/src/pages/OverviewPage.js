import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../api/client';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusPillClass(status) {
  switch (status) {
    case 'accepted':
      return 'pill pill-green';
    case 'rejected':
      return 'pill pill-red';
    case 'partially_accepted':
      return 'pill pill-amber';
    case 'pending':
    default:
      return 'pill pill-amber';
  }
}

function sessionStatusPillClass(status) {
  if (status === 'live') return 'pill pill-red live-blink';
  if (status === 'finished') return 'pill pill-gray';
  return 'pill pill-blue';
}

function OverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getOverview()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = data?.stats;
  const latestSession = data?.latestSession;
  const recentEvents = data?.recentEvents ?? [];
  const leaderboard = data?.leaderboard ?? [];
  const teamComparison = data?.teamComparison ?? [];
  const submissionQueue = data?.submissionQueue ?? [];

  const [teamA, teamB] = teamComparison;
  const teamAShare =
    teamA && teamB && teamA.points + teamB.points > 0
      ? Math.round((teamA.points / (teamA.points + teamB.points)) * 100)
      : null;

  return (
    <div className="page" id="page-overview">
      <div className="pagehead">
        <div className="section-eyebrow">Home</div>
        <div className="section-title">Overview</div>
        <div className="section-desc">
          A single glance at what the platform is doing right now: the latest fixture, current standings, and anything in the queue that needs attention.
        </div>
      </div>
      <div className="content">
        {error && (
          <div className="rationale">
            <span className="ic">⚠</span>
            <div>
              <b>Couldn't reach the backend:</b> {error}. Check that the API is running and that
              REACT_APP_API_URL is set correctly.
            </div>
          </div>
        )}

        {loading && <p className="secondary">Loading overview…</p>}

        {!loading && !error && (
          <>
            <div className="grid grid-4" style={{ marginBottom: 16 }}>
              <div className="stat-mini">
                <div className="l">Fixtures tracked</div>
                <div className="v">{stats.fixturesTracked}</div>
              </div>
              <div className="stat-mini">
                <div className="l">Events ingested (24h)</div>
                <div className="v">{stats.eventsLast24h.toLocaleString()}</div>
              </div>
              <div className="stat-mini">
                <div className="l">Pending submissions</div>
                <div className={`v ${stats.pendingSubmissions > 0 ? 'warn' : ''}`}>
                  {stats.pendingSubmissions}
                </div>
              </div>
              <div className="stat-mini">
                <div className="l">Sessions finished</div>
                <div className="v accent">{stats.sessionsFinished}</div>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">
                      {latestSession ? latestSession.meetingName : 'No sessions yet'}
                    </div>
                    <div className="card-title-sub">
                      {latestSession
                        ? `${latestSession.circuitName}, ${latestSession.country} · ${latestSession.type} · ${formatDateTime(latestSession.startTime)}`
                        : 'Run the OpenF1 sync job, or upload a submission, to populate this.'}
                    </div>
                  </div>
                  {latestSession && (
                    <span className={sessionStatusPillClass(latestSession.status)}>
                      {latestSession.status}
                    </span>
                  )}
                </div>

                {latestSession && (
                  <div className="log-ticker">
                    {recentEvents.length === 0 && (
                      <div className="log-row">
                        <span className="secondary">No events recorded for this session yet.</span>
                      </div>
                    )}
                    {recentEvents.map((event) => (
                      <div className="log-row" key={event.id}>
                        <span className="log-time">{formatDateTime(event.occurredAt)}</span>
                        <span className="mono secondary">{event.eventType}</span>
                        <span className="secondary">
                          {event.lapNumber != null ? `Lap ${event.lapNumber}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Link to="/fixtures" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                  Open fixture
                </Link>
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title leaderboard-title">
                    Driver leaderboard{data.season ? ` — ${data.season}` : ''}
                  </div>
                </div>
                {leaderboard.length === 0 ? (
                  <p className="secondary">No driver stats derived yet for this season.</p>
                ) : (
                  <table>
                    <tbody>
                      <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        <th>Wins</th>
                        <th>Pts</th>
                      </tr>
                      {leaderboard.map((driver, i) => (
                        <tr key={driver.driverId}>
                          <td>{i + 1}</td>
                          <td>{driver.name}</td>
                          <td className="secondary">{driver.wins}</td>
                          <td className={i === 0 ? 'mono' : 'mono secondary'}>{driver.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Link to="/statistics" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                  View full leaderboard
                </Link>
              </div>
            </div>

            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Team performance</div>
                  <span className="card-title-sub">
                    {data.season ? `Season ${data.season}` : 'Season to date'}
                  </span>
                </div>
                {teamComparison.length < 2 ? (
                  <p className="secondary">Not enough team stats derived yet to compare.</p>
                ) : (
                  <>
                    <div className="split-labels">
                      <span>
                        {teamA.name} · {teamAShare}%
                      </span>
                      <span>
                        {teamB.name} · {100 - teamAShare}%
                      </span>
                    </div>
                    <div className="split-bar">
                      <div style={{ width: `${teamAShare}%` }}></div>
                      <div style={{ width: `${100 - teamAShare}%` }}></div>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Points scored</span>
                      <div className="metric-vals">
                        <span>{teamA.points}</span>
                        <span>{teamB.points}</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Wins</span>
                      <div className="metric-vals">
                        <span>{teamA.wins}</span>
                        <span>{teamB.wins}</span>
                      </div>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Reliability rate</span>
                      <div className="metric-vals">
                        <span>{teamA.reliabilityRate ?? '—'}</span>
                        <span>{teamB.reliabilityRate ?? '—'}</span>
                      </div>
                    </div>
                  </>
                )}
                <Link to="/statistics" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                  View full comparison
                </Link>
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title">Submission queue</div>
                </div>
                {submissionQueue.length === 0 ? (
                  <p className="secondary">No submissions yet.</p>
                ) : (
                  <table>
                    <tbody>
                      <tr>
                        <th>Source</th>
                        <th>Submitted</th>
                        <th>Status</th>
                      </tr>
                      {submissionQueue.map((submission) => (
                        <tr key={submission.id}>
                          <td className="secondary">{submission.source}</td>
                          <td className="secondary">{formatDateTime(submission.submittedAt)}</td>
                          <td>
                            <span className={statusPillClass(submission.status)}>
                              {submission.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Link to="/submissions" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                  Open submissions
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default OverviewPage;