import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
// Whether a race is picked decides which rows have anywhere to land.
import { useRaceSyncSelection } from './RaceSyncSelection';
// Where each section lands on the page — the same id map the panels carry,
// so the rail and the readings cannot drift apart.
import { SECTION_ANCHORS } from './raceSyncAnchors';

// RaceSync's own local navigation — the section rail on the left of the page.
// Every row is one of three honest things: a jump to the reading it names
// (anchor), a wait for the race that puts that reading on the page (its
// panels only exist once one is picked), or an admission that the synced data
// has nothing behind the section at all (unavailable, with the reason). The
// toggle at the top collapses the rail to a slim icon strip and the link at
// the bottom leaves for the app. Styling lives in raceSync.css.
const NAV_SECTIONS = [
  {
    id: 'race-overview',
    label: 'Race Overview',
    anchor: SECTION_ANCHORS.overview,
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
    anchor: SECTION_ANCHORS.driverAnalysis,
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
    anchor: SECTION_ANCHORS.strategy,
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
    // Honest, not broken: no synced session carries speed, brake, throttle or
    // gear channels, so there is no telemetry to plot — Lap Time Analysis
    // below is the closest reading the data supports.
    unavailable: {
      hint: 'no channel data',
      reason: 'No speed, brake, throttle or gear channels exist for any synced session',
    },
    icon: (
      <>
        <path d="M3 12h3.5l2.5 6 4-12 2.5 6H21"></path>
      </>
    ),
  },
  {
    id: 'lap-time-analysis',
    label: 'Lap Time Analysis',
    anchor: SECTION_ANCHORS.lapTime,
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
    // Same honesty: a whole lap is the finest split the synced data has.
    unavailable: {
      hint: 'no sector times',
      reason: 'No sector or corner times exist in the synced data — laps are the finest split',
    },
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
    anchor: SECTION_ANCHORS.comparison,
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
    // The one export this page makes is the CSV at the analysis caption;
    // anything more would be a document nobody generates.
    unavailable: {
      hint: 'not generated',
      reason: 'Nothing here generates report documents — the readings export as CSV instead',
    },
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

// What a row shows while the race that puts its panels on the page hasn't
// been picked: the same muted honesty as a section with no data behind it,
// for a state that changes the moment a race is chosen above.
const PENDING = {
  hint: 'pick a race first',
  reason: 'Pick a race above to load its readings first',
};

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
  const [activeId, setActiveId] = useState(NAV_SECTIONS[0].id);
  // The reading sections' anchors only exist once a race is picked — the
  // rail waits with them instead of pointing at nothing.
  const selection = useRaceSyncSelection();
  const racePicked = selection != null && selection.selectedId != null;
  const toggleLabel = collapsed
    ? 'Expand RaceSync navigation'
    : 'Collapse RaceSync navigation';

  // Which section is on screen. The rows are jumps within the page, so the
  // red edge follows the page's own scroll: whichever anchored section last
  // crossed the line under the header is the one being read. One listener,
  // passive, coalesced to a frame — and re-read once a race lands, because
  // that is when the reading anchors appear.
  useEffect(() => {
    const targets = NAV_SECTIONS.filter((section) => section.anchor)
      .map((section) => ({
        id: section.id,
        element: document.getElementById(section.anchor),
      }))
      .filter((entry) => entry.element != null);
    // The line a section must cross to count as current — a little under the
    // header, matching the scroll-margin its anchor carries.
    const line = 96;
    let frame = 0;
    const read = () => {
      frame = 0;
      if (targets.length === 0) return;
      let current = targets[0].id;
      for (const entry of targets) {
        if (entry.element.getBoundingClientRect().top <= line) current = entry.id;
      }
      setActiveId((previous) => (previous === current ? previous : current));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [racePicked]);

  const jumpTo = (section) => {
    const target = document.getElementById(section.anchor);
    if (target == null) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(section.id);
  };

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
        {NAV_SECTIONS.map((section) => {
          // A row is a jump while it has an anchor on the page and the race
          // that puts it there is picked. The overview stands on the no-race
          // guide too, so it jumps even with nothing picked; the four reading
          // rows wait, muted, for a race. Rows with no data behind them at
          // all say that instead — the reason sits under their labels.
          const waitsForRace =
            section.anchor != null &&
            section.anchor !== SECTION_ANCHORS.overview &&
            !racePicked;
          const unavailable = section.unavailable ?? (waitsForRace ? PENDING : null);
          const live = section.anchor != null && !waitsForRace;
          return (
            <li key={section.id}>
              <button
                className={`racesync-nav-item${
                  live && activeId === section.id ? ' is-active' : ''
                }${unavailable ? ' is-unavailable' : ''}`}
                type="button"
                title={unavailable ? unavailable.reason : section.label}
                aria-disabled={unavailable ? 'true' : undefined}
                onClick={live ? () => jumpTo(section) : undefined}
              >
                <span className="racesync-nav-icon">
                  <SectionIcon>{section.icon}</SectionIcon>
                </span>
                <span className="racesync-nav-text">
                  <span className="racesync-nav-label">{section.label}</span>
                  {unavailable && (
                    <span className="racesync-nav-hint">{unavailable.hint}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
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
