import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCachedImageUrl, getDrivers } from '../api/client';

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

// Tries the OpenF1 headshot first, then the API-Sports fallback, and finally
// gives up on images and shows the bare race number.
function DriverPhoto({ driver }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [driver.imageUrl, driver.fallbackImageUrl].filter(Boolean);

  if (attempt >= sources.length) {
    return <span className="driver-num">{driver.number}</span>;
  }

  return (
    <img
      src={getCachedImageUrl(sources[attempt])}
      alt={driver.name}
      onError={() => setAttempt((current) => current + 1)}
    />
  );
}

function DriversPage() {
  const [firstPage, setFirstPage] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const prefetchStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getDrivers({ limit: INITIAL_PAGE_SIZE, offset: 0 })
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
    || (firstPage?.total != null && firstPage.drivers.length < firstPage.total);

  // Prefetch the rest of the grid while the user scans the first cards, so
  // "View more" reveals instantly instead of triggering a fresh request.
  useEffect(() => {
    if (loading || error || !firstPage || !hasMore || prefetchStartedRef.current) {
      return undefined;
    }
    prefetchStartedRef.current = true;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      getDrivers({ limit: PREFETCH_PAGE_SIZE, offset: firstPage.drivers.length })
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

  const drivers = revealed
    ? [...(firstPage?.drivers ?? []), ...(remaining?.drivers ?? [])]
    : (firstPage?.drivers ?? []);
  const canReveal = Boolean(remaining?.drivers?.length);

  return (
    <div className="page page-drivers">
      <div className="pagehead">
        <div className="tag">Drivers' championship</div>
        <div className="section-title">Drivers</div>
        <div className="section-sub">
          Ranked by championship points, highest first. Click a driver for their full profile.
        </div>
      </div>
      <div className="content">
        {loading && <p className="secondary">Loading drivers…</p>}
        {error && (
          <div className="rationale">
            <span className="ic">⚠</span>
            <div><b>Couldn't load drivers:</b> {error}</div>
          </div>
        )}
        {!loading && !error && drivers.length === 0 && (
          <p className="secondary">No drivers available yet.</p>
        )}
        {!loading && !error && drivers.length > 0 && (
          <div className="driver-grid">
            {drivers.map((driver, index) => (
              <Link
                key={driver.id}
                to={`/driver/${driver.id}`}
                className="driver-cell"
                style={{ '--tc': driver.teamColor }}
              >
                <div className="driver-photo">
                  <span className="driver-rank">{index + 1}</span>
                  <DriverPhoto driver={driver} />
                </div>
                <div className="driver-strip">
                  <div>
                    <div className="driver-name">{driver.name}</div>
                    <div className="driver-team">{driver.teamName}</div>
                  </div>
                  <span className="flag">{driver.flag}</span>
                </div>
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

export default DriversPage;
