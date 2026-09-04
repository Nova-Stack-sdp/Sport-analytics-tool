import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeams } from '../api/client';

function TeamsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getTeams()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page page-teams">
      <div className="pagehead">
        <div className="tag">Constructors</div>
        <div className="section-title">Teams</div>
        <div className="section-sub">
          Ranked by constructor points, highest first. Each card floats and glows in the team's colour on hover.
        </div>
      </div>
      <div className="content">
        {loading && <p className="secondary">Loading teams…</p>}
        {error && (
          <div className="rationale">
            <span className="ic">⚠</span>
            <div><b>Couldn't load teams:</b> {error}</div>
          </div>
        )}
        {!loading && !error && data?.teams?.length === 0 && (
          <p className="secondary">No teams available yet.</p>
        )}
        {!loading && !error && data?.teams?.length > 0 && (
          <div className="team-grid">
            {data.teams.map((team, index) => (
              <Link
                key={team.id}
                to={`/team/${team.id}`}
                className="team-cell"
                style={{ '--tc': team.color }}
              >
                <div className="team-card">
                  <span className="team-rank">{index + 1}</span>
                  <div className="team-logo">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} />
                    ) : (
                      team.initials
                    )}
                  </div>
                  <span className="team-points">{team.points} pts</span>
                </div>
                <div className="team-name">{team.name}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamsPage;
