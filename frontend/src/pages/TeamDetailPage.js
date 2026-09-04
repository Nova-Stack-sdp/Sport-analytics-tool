import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeam } from '../api/client';

function TeamDetailPage() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTeam(id)
      .then((result) => {
        if (!cancelled) setTeam(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="page page-team"><div className="content"><p className="secondary">Loading team…</p></div></div>;
  if (error) return <div className="page page-team"><div className="content"><div className="rationale"><span className="ic">⚠</span><div><b>Couldn't load team:</b> {error}</div></div></div></div>;
  if (!team) return null;

  return (
    <div className="page page-team">
      <div className="content">
        <div className="tag">Constructor profile</div>
        <div className="td-hero" style={{ '--tc': team.color }}>
          {team.logoUrl && <img className="td-logo" src={team.logoUrl} alt={team.name} />}
          <h1>{team.name}</h1>
          <div className="td-drivers-row">
            {team.drivers.map((d) => (
              <Link key={d.id} to={`/driver/${d.id}`} className="td-driver-chip">
                {d.number} · {d.name}
              </Link>
            ))}
          </div>
        </div>

        <h3 className="gallery-title">Drivers</h3>
        <div className="td-roster-grid">
          {team.drivers.map((d) => (
            <Link key={d.id} to={`/driver/${d.id}`} className="driver-cell" style={{ '--tc': team.color }}>
              <div className="driver-photo">
                {d.imageUrl ? (
                  <img src={d.imageUrl} alt={d.name} />
                ) : (
                  <span className="driver-num">{d.number}</span>
                )}
              </div>
              <div className="driver-strip">
                <div>
                  <div className="driver-name">{d.name}</div>
                  <div className="driver-team">#{d.number}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="td-two-col">
          <div className="stat-list">
            <h3>{team.season} season</h3>
            <div className="stat-row"><span>Position</span><b>—</b></div>
            <div className="stat-row"><span>Points</span><b>{team.seasonStats?.points ?? 0}</b></div>
            <div className="stat-row"><span>Wins</span><b>{team.seasonStats?.wins ?? 0}</b></div>
            <div className="stat-row"><span>Pole positions</span><b>{team.polePositions ?? 0}</b></div>
            <div className="stat-row"><span>Fastest laps</span><b>{team.fastestLaps ?? 0}</b></div>
          </div>
          <div className="stat-list">
            <h3>Team summary — all time</h3>
            <div className="stat-row"><span>Grands Prix entered</span><b>{team.firstTeamEntry ? `${team.firstTeamEntry}–present` : '—'}</b></div>
            <div className="stat-row"><span>World championships</span><b>{team.worldChampionships ?? 0}</b></div>
            <div className="stat-row"><span>Highest race finish</span><b>{team.highestRaceFinish ? `P${team.highestRaceFinish.position} (${team.highestRaceFinish.number}x)` : '—'}</b></div>
            <div className="stat-row"><span>Pole positions</span><b>{team.polePositions ?? 0}</b></div>
            <div className="stat-row"><span>Fastest laps</span><b>{team.fastestLaps ?? 0}</b></div>
          </div>
        </div>

        <div className="td-profile">
          <div className="td-facts">
            <div className="fact"><span>Base</span><span>{team.base || '—'}</span></div>
            <div className="fact"><span>Team chief</span><span>{team.director || '—'}</span></div>
            <div className="fact"><span>Chassis</span><span>{team.chassis || '—'}</span></div>
            <div className="fact"><span>Power unit</span><span>{team.engine || '—'}</span></div>
            <div className="fact"><span>First entry</span><span>{team.firstTeamEntry || '—'}</span></div>
          </div>
          <div className="bio">
            {team.name} is a Formula 1 constructor based in {team.base || 'an undisclosed location'}.
            The team has competed since {team.firstTeamEntry || 'its debut'} and has won {team.worldChampionships ?? 0} World Constructors' Championships.
            Current chassis: {team.chassis || '—'}. Power unit: {team.engine || '—'}.
          </div>
        </div>

        <h3 className="gallery-title">Gallery</h3>
        <div className="gallery-row" style={{ '--tc': team.color }}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="gallery-cell" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default TeamDetailPage;
