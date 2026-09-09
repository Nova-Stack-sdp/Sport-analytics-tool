import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCachedImageUrl, getTeams } from '../api/client';

const INITIAL_PAGE_SIZE = 2;
const PREFETCH_PAGE_SIZE = 100;

// Runs background work as soon as the browser is idle, with a timer fallback
// for environments (older browsers, jsdom) without requestIdleCallback. The
// cancel handle is captured up front so cleanup still works if the global
// disappears before unmount (as happens between test hooks).
function scheduleIdle(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    const cancel = window.cancelIdleCallback;
    const handle = window.requestIdleCallback(callback);
    return () => {
      if (typeof cancel === 'function') cancel(handle);
    };
  }
  const timer = setTimeout(callback, 200);
  return () => clearTimeout(timer);
}

// Cached team logo with the team initials as the fallback when the image
// fails to load or no logo exists.
function TeamLogo({ team }) {
  const [failed, setFailed] = useState(false);

  if (failed || !team.logoUrl) {
    return team.initials;
  }

  return (
    <img
      src={getCachedImageUrl(team.logoUrl)}
      alt={team.name}
      onError={() => setFailed(true)}
    />
  );
}

function TeamsPage() {
  const [firstPage, setFirstPage] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const prefetchStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getTeams({ limit: INITIAL_PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (!cancelled) setFirstPage(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const hasMore = Boolean(firstPage?.hasMore)
    || (firstPage?.total != null && firstPage.teams.length < firstPage.total);

  // Prefetch the rest of the grid while the user scans the first cards, so
  // "View more" reveals instantly instead of triggering a fresh request.
  useEffect(() => {
    if (loading || error || !firstPage || !hasMore || prefetchStartedRef.current) {
      return undefined;
    }
    prefetchStartedRef.current = true;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      getTeams({ limit: PREFETCH_PAGE_SIZE, offset: firstPage.teams.length })
        .then((result) => {
          if (!cancelled) setRemaining(result);
        })
        .catch(() => {
          // Best-effort: View more simply stays disabled if this fails.
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [loading, error, firstPage, hasMore]);

  const teams = revealed
    ? [...(firstPage?.teams ?? []), ...(remaining?.teams ?? [])]
    : (firstPage?.teams ?? []);
  const canReveal = Boolean(remaining?.teams?.length);

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
        {!loading && !error && teams.length === 0 && (
          <p className="secondary">No teams available yet.</p>
        )}
        {!loading && !error && teams.length > 0 && (
          <div className="team-grid">
            {teams.map((team, index) => (
              <Link
                key={team.id}
                to={`/team/${team.id}`}
                className="team-cell"
                style={{ '--tc': team.color }}
              >
                <div className="team-card">
                  <span className="team-rank">{index + 1}</span>
                  <div className="team-logo">
                    <TeamLogo team={team} />
                  </div>
                  <span className="team-points">{team.points} pts</span>
                </div>
                <div className="team-name">{team.name}</div>
              </Link>
            ))}
            {hasMore && !revealed && (
              <button
                type="button"
                className="view-more-btn"
                disabled={!canReveal}
                onClick={() => setRevealed(true)}
              >
                View more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamsPage;
