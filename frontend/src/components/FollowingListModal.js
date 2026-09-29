import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// A small centered dialog listing everyone the signed-in user follows, with
// an unfollow action per row. Closes on Escape or a click outside the panel.
function FollowingListModal({ drivers, teams, onUnfollowDriver, onUnfollowTeam, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isEmpty = drivers.length === 0 && teams.length === 0;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-panel following-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Who you follow"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Following</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isEmpty && (
          <p className="secondary">
            You aren't following anyone yet — visit a driver or team page and hit Follow.
          </p>
        )}

        {teams.length > 0 && (
          <div className="following-section">
            <h3>Teams</h3>
            <ul className="following-list">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link to={`/team/${team.id}`} onClick={onClose} className="following-row">
                    <span className="following-dot" style={{ background: team.color || 'var(--accent)' }} />
                    {team.name}
                  </Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUnfollowTeam(team.id)}>
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {drivers.length > 0 && (
          <div className="following-section">
            <h3>Drivers</h3>
            <ul className="following-list">
              {drivers.map((driver) => (
                <li key={driver.id}>
                  <Link to={`/driver/${driver.id}`} onClick={onClose} className="following-row">
                    <span className="following-dot" style={{ background: driver.teamColor || 'var(--accent)' }} />
                    {driver.name}
                    {driver.teamName && <span className="following-sub"> · {driver.teamName}</span>}
                  </Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUnfollowDriver(driver.id)}>
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default FollowingListModal;
