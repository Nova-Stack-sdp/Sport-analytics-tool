import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOverview } from '../api/client';
import { useDateTimeFormat } from '../context/PreferencesContext';
import { eventTypeLabel, percent, sessionLabel, submissionSourceLabel } from '../utils/eventLabels';

const fixtureLink = (sessionId) => `/fixtures?session=${encodeURIComponent(sessionId)}`;

function sessionStatusPillClass(status) {
  if (status === 'live') return 'pill pill-red live-blink';
  if (status === 'finished') return 'pill pill-gray';
  return 'pill pill-blue';
}

function OverviewPage() {
  // Follows the clock / time zone choices in Profile → Settings.
  const { formatDateTime } = useDateTimeFormat();
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
  const recentUpdates = data?.recentUpdates ?? [];

  const [teamA, teamB] = teamComparison;
  // Each team's share of the two teams' combined points. With no points
  // yet there is no share to show, so the bar is split evenly and the
  // labels say so.
  const teamAShare =
    teamA && teamB && teamA.points + teamB.points > 0
      ? Math.round((teamA.points / (teamA.points + teamB.points)) * 100)
      : null;
  const shareLabel = (share) => (share === null ? 'no points yet' : `${share}%`);

  return (
    <div className="page" id="page-overview">
      <div className="pagehead">
        <div className="section-eyebrow">At a glance</div>
        <div className="section-title">Overview</div>
        <div className="section-desc">
          The latest synced session, the top of this season's drivers' standings, the two leading constructors, and the most recent data added to the platform.
        </div>
      </div>
      <div className="content">
        {error && (
          <div className="rationale">
            <span className="ic">⚠</span>
            <div>
              <b>Couldn't load the overview:</b> {error}. Please try again in a moment.
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
                <div className="l">Seasons covered</div>
                <div className="v">{stats.seasonsCovered}</div>
              </div>
              <div className="stat-mini">
                <div className="l">Uploads awaiting review</div>
                <div className={`v ${stats.pendingSubmissions > 0 ? 'warn' : ''}`}>
                  {stats.pendingSubmissions}
                </div>
              </div>
              <div className="stat-mini">
                <div className="l">Last data update</div>
                <div className="v accent">{stats.lastDataUpdate ? formatDateTime(stats.lastDataUpdate) : '—'}</div>
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
                        : 'No sessions have been synced yet.'}
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
                        <span>{eventTypeLabel(event.eventType)}</span>
                        <span className="secondary">
                          {[event.driverName, event.lapNumber != null ? `Lap ${event.lapNumber}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {latestSession ? (
                  <Link to={fixtureLink(latestSession.id)} className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                    Open this fixture
                  </Link>
                ) : (
                  <Link to="/fixtures" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                    Browse fixtures
                  </Link>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title leaderboard-title">
                    Drivers' standings{data.season ? ` — ${data.season}` : ''}
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
                  View full standings
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
                        {teamA.name} · {shareLabel(teamAShare)}
                      </span>
                      <span>
                        {teamB.name} · {shareLabel(teamAShare === null ? null : 100 - teamAShare)}
                      </span>
                    </div>
                    <div className="split-bar">
                      <div style={{ width: `${teamAShare ?? 50}%` }}></div>
                      <div style={{ width: `${100 - (teamAShare ?? 50)}%` }}></div>
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
                        <span>{percent(teamA.reliabilityRate)}</span>
                        <span>{percent(teamB.reliabilityRate)}</span>
                      </div>
                    </div>
                  </>
                )}
                <Link to="/statistics?view=constructors" className="btn btn-ghost btn-full" style={{ marginTop: 14 }}>
                  View constructors' standings
                </Link>
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title">Recent data updates</div>
                  <span className="card-title-sub">OpenF1 syncs and accepted uploads</span>
                </div>
                {recentUpdates.length === 0 ? (
                  <p className="secondary">No data has been published yet.</p>
                ) : (
                  <table>
                    <tbody>
                      <tr>
                        <th>Published</th>
                        <th>Session</th>
                        <th>Source</th>
                        <th>Events</th>
                      </tr>
                      {recentUpdates.map((update) => (
                        <tr key={update.id}>
                          <td className="secondary">{formatDateTime(update.publishedAt)}</td>
                          <td>
                            {update.session ? (
                              <Link to={fixtureLink(update.session.id)}>{sessionLabel(update.session)}</Link>
                            ) : '—'}
                          </td>
                          <td className="secondary">{submissionSourceLabel(update.source)}</td>
                          <td className="mono secondary">
                            {update.eventsAdded != null ? `+${update.eventsAdded.toLocaleString()}` : '—'}
                            {update.eventsCorrected ? ` (${update.eventsCorrected} corrected)` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default OverviewPage;