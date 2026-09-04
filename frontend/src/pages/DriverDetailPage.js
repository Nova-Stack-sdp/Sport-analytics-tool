import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDriver } from '../api/client';

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
            <div className="dd-meta">
              <div><div>Nationality</div><strong>{driver.flag} {driver.nationality}</strong></div>
              <div><div>Born</div><strong>{driver.birthdate || '—'}</strong></div>
              <div><div>Poles</div><strong>{driver.highestGridPosition === 1 ? driver.highestRaceFinish?.number || '—' : '—'}</strong></div>
              <div><div>Wins</div><strong>{stats.wins ?? 0}</strong></div>
            </div>
            <div className="dd-barrow">
              <div><div className="dd-bar-label">Championships</div><div className="dd-bar-val">{driver.worldChampionships}</div></div>
              <div><div className="dd-bar-label">Podiums</div><div className="dd-bar-val">{driver.podiums}</div></div>
              <div><div className="dd-bar-label">GPs entered</div><div className="dd-bar-val">{driver.grandsPrixEntered}</div></div>
              <div><div className="dd-bar-label">Career points</div><div className="dd-bar-val" style={{ color: driver.teamColor }}>{driver.careerPoints}</div></div>
            </div>
          </div>
        </div>

        <div className="dd-cards">
          <div className="dd-card">
            <h4>Overview</h4>
            <div className="dd-row"><span>Number</span><b>{driver.number}</b></div>
            <div className="dd-row"><span>Team</span><b>{driver.teamName}</b></div>
            <div className="dd-row"><span>DNF rate</span><b>{stats.dnfCount ? `${Math.round((stats.dnfCount / Math.max(driver.grandsPrixEntered, 1)) * 100)}%` : '0%'}</b></div>
            <div className="dd-row"><span>Season</span><b>{driver.season}</b></div>
          </div>
          <div className="dd-card">
            <h4>Totals</h4>
            <div className="dd-row"><span>Points</span><b>{stats.points ?? 0}</b></div>
            <div className="dd-row"><span>Podiums</span><b>{stats.podiums ?? 0}</b></div>
            <div className="dd-row"><span>DNFs</span><b>{stats.dnfCount ?? 0}</b></div>
            <div className="dd-row"><span>Wins</span><b>{stats.wins ?? 0}</b></div>
          </div>
          <div className="dd-card">
            <h4>Career</h4>
            <div className="dd-row"><span>Championships</span><b>{driver.worldChampionships}</b></div>
            <div className="dd-row"><span>Career points</span><b>{driver.careerPoints}</b></div>
            <div className="dd-row"><span>GPs entered</span><b>{driver.grandsPrixEntered}</b></div>
            <div className="dd-row"><span>Highest finish</span><b>{driver.highestRaceFinish ? `P${driver.highestRaceFinish.position}` : '—'}</b></div>
          </div>
        </div>

        {driver.results?.length > 0 && (
          <table className="results">
            <thead>
              <tr><th>Race</th><th>Qualified</th><th>Result</th><th>DNF</th><th>Fastest lap</th><th>Points</th></tr>
            </thead>
            <tbody>
              {driver.results.map((r) => (
                <tr key={r.sessionId}>
                  <td>{r.meetingName} · {r.type}</td>
                  <td>{r.qualified ? `${r.qualified}th` : '—'}</td>
                  <td>{r.result ? `${r.result}th` : '—'}</td>
                  <td>{r.dnf ? 'Yes' : '—'}</td>
                  <td>{r.fastestLap ? 'Yes' : '—'}</td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DriverDetailPage;
