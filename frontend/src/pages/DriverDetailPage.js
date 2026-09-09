import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getDriver } from '../api/client';

function position(value) {
  return value != null ? `P${value}` : '—';
}

function points(value) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
}

function gap(value) {
  if (value == null) return '—';
  if (value === 0 || value === '0') return 'Winner';
  return String(value).startsWith('+') ? value : `+${value}`;
}

function DriverDetailPage() {
  const { id } = useParams();
  const [driver, setDriver] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDriver(id)
      .then((result) => {
        if (!cancelled) setDriver(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="page page-driver"><div className="content"><p className="secondary">Loading driver…</p></div></div>;
  if (error) return <div className="page page-driver"><div className="content"><div className="rationale"><span className="ic">⚠</span><div><b>Couldn't load driver:</b> {error}</div></div></div></div>;
  if (!driver) return null;

  const stats = driver.seasonStats || {};
  const history = driver.trackedHistoryStats || {};

  return (
    <div className="page page-driver">
      <div className="content">
        <div className="tag">Driver profile</div>
        <div className="dd-hero" style={{ '--tc': driver.teamColor }}>
          <div className="dd-photo">
            {driver.imageUrl ? (
              <img src={driver.imageUrl} alt={driver.name} />
            ) : (
              <span>{driver.number}</span>
            )}
          </div>
          <div>
            <div className="dd-team">{driver.teamName}</div>
            <h1 className="dd-name">{driver.name}</h1>
            {(driver.broadcastName || driver.acronym) && (
              <div className="dd-broadcast">{[driver.broadcastName, driver.acronym].filter(Boolean).join(' · ')}</div>
            )}
            <div className="dd-meta">
              <div><div>Nationality</div><strong>{driver.flag} {driver.nationality}</strong></div>
              <div><div>Born</div><strong>{driver.birthdate || '—'}</strong></div>
              <div><div>Season poles</div><strong>{stats.poles ?? 0}</strong></div>
              <div><div>Season wins</div><strong>{stats.wins ?? 0}</strong></div>
            </div>
            <div className="dd-barrow">
              <div><div className="dd-bar-label">Season starts</div><div className="dd-bar-val">{stats.starts ?? 0}</div></div>
              <div><div className="dd-bar-label">Season points</div><div className="dd-bar-val" style={{ color: driver.teamColor }}>{points(stats.points)}</div></div>
              <div><div className="dd-bar-label">Season podiums</div><div className="dd-bar-val">{stats.podiums ?? 0}</div></div>
              <div><div className="dd-bar-label">Average finish</div><div className="dd-bar-val">{position(stats.averageFinish)}</div></div>
            </div>
          </div>
        </div>

        <p className="dd-source-note">Season totals are calculated from tracked Race and Sprint results enriched with OpenF1.</p>
        <div className="dd-cards">
          <div className="dd-card">
            <h4>Overview</h4>
            <div className="dd-row"><span>Number</span><b>{driver.number}</b></div>
            <div className="dd-row"><span>Team</span><b>{driver.teamName}</b></div>
            <div className="dd-row"><span>Driver code</span><b>{driver.acronym || '—'}</b></div>
            <div className="dd-row"><span>Season</span><b>{driver.season}</b></div>
          </div>
          <div className="dd-card">
            <h4>{driver.season} season</h4>
            <div className="dd-row"><span>Points</span><b>{points(stats.points)}</b></div>
            <div className="dd-row"><span>Podiums</span><b>{stats.podiums ?? 0}</b></div>
            <div className="dd-row"><span>Best finish</span><b>{position(stats.highestRaceFinish?.position)}</b></div>
            <div className="dd-row"><span>DNFs</span><b>{stats.dnfCount ?? 0}</b></div>
            <div className="dd-row"><span>DNF rate</span><b>{stats.starts ? `${Math.round(((stats.dnfCount || 0) / stats.starts) * 100)}%` : '0%'}</b></div>
          </div>
          <div className="dd-card">
            <h4>Tracked history</h4>
            <div className="dd-row"><span>Race & sprint starts</span><b>{history.starts ?? 0}</b></div>
            <div className="dd-row"><span>Points</span><b>{points(history.points)}</b></div>
            <div className="dd-row"><span>Wins / podiums</span><b>{history.wins ?? 0} / {history.podiums ?? 0}</b></div>
            <div className="dd-row"><span>Best finish</span><b>{position(history.highestRaceFinish?.position)}</b></div>
            <div className="dd-row"><span>Average finish</span><b>{position(history.averageFinish)}</b></div>
          </div>
        </div>

        {driver.results?.length > 0 && (
          <div className="dd-results-wrap">
            <div className="dd-results-head">
              <h2>Tracked results</h2>
              <span>{driver.results.length} Race / Sprint sessions</span>
            </div>
            <div className="dd-results-scroll">
              <table className="results">
                <thead>
                  <tr><th>Race</th><th>Grid</th><th>Finish</th><th>Status</th><th>Laps</th><th>Gap</th><th>Points</th></tr>
                </thead>
                <tbody>
                  {driver.results.map((result) => (
                    <tr key={result.sessionId}>
                      <td>{result.meetingName} · {result.type}</td>
                      <td>{position(result.qualified)}</td>
                      <td>{position(result.result)}</td>
                      <td>{result.status}</td>
                      <td>{result.laps ?? '—'}</td>
                      <td>{gap(result.gapToLeader)}</td>
                      <td>{points(result.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverDetailPage;
