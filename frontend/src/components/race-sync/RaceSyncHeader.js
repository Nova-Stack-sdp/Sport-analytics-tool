import { Link } from 'react-router-dom';

// The RaceSync page's own top bar — brand on the left, race search in the
// middle, notifications and the account block on the right (see raceSync.css).
// The bell and the account menu are placeholders for now.
function RaceSyncHeader() {
  return (
    <header className="racesync-header">
      <div className="racesync-header-left">
        <Link to="/" className="racesync-brand">
          {/* Hand-drawn stand-in for the F1 mark — swap in the official asset
              when one is available. */}
          <svg
            className="racesync-logo"
            viewBox="0 0 33 23"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M1.5 21.5 L7.8 3.2 L18.2 3.2 L16.4 8.2 L9.5 8.2 L8.4 11.4 L15.8 11.4 L14.3 15.8 L6.9 15.8 L4.9 21.5 Z"></path>
            <path d="M20.5 21.5 L26.8 3.2 L31.3 3.2 L24.9 21.5 Z"></path>
          </svg>
          <span className="racesync-brand-copy">
            {/* Split so "Sync" can carry the F1 red while staying one wordmark. */}
            <span className="racesync-wordmark">
              Race<span className="racesync-wordmark-accent">Sync</span>
            </span>
            <span className="racesync-tagline">Observe, Diagnose, Simulate</span>
          </span>
        </Link>
      </div>

      <div className="racesync-search">
        <div className="racesync-search-box">
          <svg
            className="racesync-search-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="11" cy="11" r="6.5"></circle>
            <path d="M20 20l-4.2-4.2"></path>
          </svg>
          <input
            className="racesync-search-input"
            type="text"
            placeholder="Type Race Title..."
            aria-label="Search races"
          />
        </div>
      </div>

      <div className="racesync-account">
        {/* Placeholder: notifications are not wired up yet. */}
        <span className="racesync-bell" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span className="racesync-bell-dot" />
        </span>
        <span className="racesync-divider" aria-hidden="true" />
        {/* Placeholder: the account menu is not wired up yet. */}
        <span className="racesync-account-trigger">
          <span className="racesync-avatar" aria-hidden="true">
            TA
          </span>
          <span className="racesync-account-name">Team Analytics</span>
          <svg
            className="racesync-chevron"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 9l6 6 6-6"></path>
          </svg>
        </span>
      </div>
    </header>
  );
}

export default RaceSyncHeader;
