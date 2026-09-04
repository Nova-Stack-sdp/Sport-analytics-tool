import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDrivers } from '../api/client';

function DriversPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDrivers()
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
        {!loading && !error && data?.drivers?.length === 0 && (
          <p className="secondary">No drivers available yet.</p>
        )}
        {!loading && !error && data?.drivers?.length > 0 && (
          <div className="driver-grid">
            {data.drivers.map((driver, index) => (
              <Link
                key={driver.id}
                to={`/driver/${driver.id}`}
                className="driver-cell"
                style={{ '--tc': driver.teamColor }}
              >
                <div className="driver-photo">
                  <span className="driver-rank">{index + 1}</span>
                  {driver.imageUrl ? (
                    <img src={driver.imageUrl} alt={driver.name} />
                  ) : (
                    <span className="driver-num">{driver.number}</span>
                  )}
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
          </div>
        )}
      </div>
    </div>
  );
}

export default DriversPage;
