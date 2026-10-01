import { useState } from 'react';
import { Link } from 'react-router-dom';

// RaceSync's own local navigation — the section rail on the left of the page.
// The eight sections are placeholders for now (nothing routes yet) and the
// wired-up controls are the toggle at the top, which collapses the rail to a
// slim icon strip, and the link back to the app. Styling lives in raceSync.css.
const NAV_SECTIONS = [
  {
    id: 'race-overview',
    label: 'Race Overview',
    active: true,
    icon: (
      <>
        <path d="M5 21V4"></path>
        <path d="M5 5h13l-2.2 4L18 13H5"></path>
      </>
    ),
  },
  {
    id: 'driver-analysis',
    label: 'Driver Analysis',
    icon: (
      <>
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4 21a8 8 0 0 1 16 0"></path>
      </>
    ),
  },
  {
    id: 'strategy-pit-stops',
    label: 'Strategy & Pit Stops',
    icon: (
      <>
        <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"></path>
        <path d="M20.5 3v3.5H17"></path>
        <circle cx="12" cy="12" r="2.4"></circle>
      </>
    ),
  },
  {
    id: 'telemetry',
    label: 'Telemetry',
    icon: (
      <>
        <path d="M3 12h3.5l2.5 6 4-12 2.5 6H21"></path>
      </>
    ),
  },
  {
    id: 'lap-time-analysis',
    label: 'Lap Time Analysis',
    icon: (
      <>
        <path d="M5 19a8.5 8.5 0 1 1 14 0"></path>
        <path d="M12 13.5l4.2-4.2"></path>
      </>
    ),
  },
  {
    id: 'segment-analysis',
    label: 'Segment Analysis',
    icon: (
      <>
        <path d="M4 15v-3"></path>
        <path d="M9.3 19V6"></path>
        <path d="M14.7 16v-5"></path>
        <path d="M20 13v-2"></path>
      </>
    ),
  },
  {
    id: 'comparison',
    label: 'Comparison',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5"></circle>
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path>
        <path d="M16 5.5a3.5 3.5 0 0 1 0 5"></path>
        <path d="M17.5 14.6a6.5 6.5 0 0 1 4 5.4"></path>
      </>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <>
        <path d="M6.5 3h7L18 7.5V21h-11.5z"></path>
        <path d="M13.5 3v4.5H18"></path>
        <path d="M9.5 12.5h5"></path>
        <path d="M9.5 16h5"></path>
      </>
    ),
  },
];

function SectionIcon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      stroke="currentColor"
      strokeWidth="1.9"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function RaceSyncNav() {
  const [collapsed, setCollapsed] = useState(false);
  const toggleLabel = collapsed
    ? 'Expand RaceSync navigation'
    : 'Collapse RaceSync navigation';

  return (
    <nav
      className={`racesync-nav${collapsed ? ' is-collapsed' : ''}`}
      aria-label="RaceSync sections"
    >
      <button
        className="racesync-nav-toggle"
        type="button"
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="racesync-nav-toggle-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          >
            {collapsed ? (
              <>
                <path d="M4 7h16"></path>
                <path d="M4 12h16"></path>
                <path d="M4 17h16"></path>
              </>
            ) : (
              <>
                <path d="M6 6l12 12"></path>
                <path d="M18 6L6 18"></path>
              </>
            )}
          </svg>
        </span>
      </button>

      <ul className="racesync-nav-items">
        {NAV_SECTIONS.map((section) => (
          <li key={section.id}>
            {/* Placeholder: the section views are not built yet. */}
            <button
              className={`racesync-nav-item${
                section.active ? ' is-active' : ''
              }`}
              type="button"
              title={section.label}
            >
              <span className="racesync-nav-icon">
                <SectionIcon>{section.icon}</SectionIcon>
              </span>
              <span className="racesync-nav-label">{section.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <span className="racesync-nav-checker" aria-hidden="true" />

      {/* Bottom cluster: the app-level exit sits with the brand quote. The
          back link is styled unlike the section rows above so it reads as
          leaving RaceSync. */}
      <div className="racesync-nav-bottom">
        <span className="racesync-nav-sep" aria-hidden="true" />

        <Link
          className="racesync-nav-back"
          to="/telemetry-tv"
          title="Back to TelemetryTV"
        >
          <span className="racesync-nav-back-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5"></path>
              <path d="M11 6l-6 6 6 6"></path>
            </svg>
          </span>
          <span className="racesync-nav-back-label">Back to TelemetryTV</span>
        </Link>

        <div className="racesync-nav-foot">
          <p className="racesync-nav-quote">
            Better data.
            <br />
            Sharper decisions.
            <br />
            Faster laps.
          </p>
          <span className="racesync-nav-quote-mark" aria-hidden="true" />
        </div>
      </div>

      <span className="racesync-nav-streaks" aria-hidden="true" />
    </nav>
  );
}

export default RaceSyncNav;
