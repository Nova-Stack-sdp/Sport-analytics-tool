import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRaceSyncSelection } from './RaceSyncSelection';
import RaceSyncAddRace from './RaceSyncAddRace';
import RaceSyncBell from './RaceSyncBell';
import RaceSyncViewMenu from './RaceSyncViewMenu';

// The header's race search — typing filters the synced races and the list
// opens underneath: the same races Race Replay offers (see RaceSyncSelection).
// Picking a row loads that race into the centre stage. The input stays a
// query field afterwards, so the picked race is announced by the map header
// rather than echoed back into the box. A race that isn't in the list can be
// added from OpenF1 without leaving the search (see RaceSyncAddRace).
function RaceSearch() {
  const { fixtures, loading, error, selectedId, selectRace } = useRaceSyncSelection();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef(null);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? fixtures.filter((fixture) =>
        [fixture.meetingName, fixture.circuitName, fixture.country]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      )
    : fixtures;
  // The keyboard cursor stays inside the current result set however the list
  // changes under it (typing resets it to the top row).
  const active = matches.length > 0 ? Math.min(activeIndex, matches.length - 1) : -1;

  // Close when the click lands outside the box — the app's avatar menu uses
  // the same listener pattern.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const choose = (fixture) => {
    selectRace(fixture.id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (matches.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        (index) => (Math.min(index, matches.length - 1) + step + matches.length) % matches.length
      );
      return;
    }
    if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  };

  return (
    <div className="racesync-search" ref={boxRef}>
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
          role="combobox"
          aria-expanded={open}
          aria-controls="racesync-race-options"
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 ? `racesync-race-option-${matches[active].id}` : undefined
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && adding && (
        <div className="racesync-search-panel">
          <RaceSyncAddRace
            query={query}
            onBack={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              setOpen(false);
              setQuery('');
            }}
          />
        </div>
      )}

      {open && !adding && (
        <div className="racesync-search-panel">
          <ul
            className="racesync-search-list"
            id="racesync-race-options"
            role="listbox"
            aria-label="Races"
          >
            {matches.map((fixture, index) => (
              <li key={fixture.id}>
                <button
                  type="button"
                  id={`racesync-race-option-${fixture.id}`}
                  role="option"
                  aria-selected={index === active}
                  className={[
                    'racesync-search-option',
                    index === active ? 'is-active' : '',
                    fixture.id === selectedId ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => choose(fixture)}
                >
                  <span className="racesync-search-option-name">
                    {fixture.meetingName} {fixture.season}
                  </span>
                  <span className="racesync-search-option-type">{fixture.type}</span>
                </button>
              </li>
            ))}
          </ul>

          {loading && <p className="racesync-search-note">Loading races…</p>}
          {error && (
            <p className="racesync-search-note">Couldn't load the race list: {error}.</p>
          )}
          {!loading && !error && fixtures.length === 0 && (
            <p className="racesync-search-note">
              No synced races have enough data to replay yet.
            </p>
          )}
          {!loading && !error && fixtures.length > 0 && matches.length === 0 && (
            <p className="racesync-search-note">No race matches “{query.trim()}”.</p>
          )}

          {/* The way in for a race that isn't here yet — lit up when the
              search has come back empty, quiet at the foot of the list
              otherwise. */}
          {!loading && (
            <button
              type="button"
              className={`racesync-search-add${matches.length === 0 ? ' is-prominent' : ''}`}
              onClick={() => setAdding(true)}
            >
              Can’t find a race? Add it from OpenF1
            </button>
          )}

          {selectedId && (
            <button
              type="button"
              className="racesync-search-clear"
              onClick={() => {
                selectRace(null);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The RaceSync page's own top bar — brand on the left, race search in the
// middle, the theme quick-flip, the signed-in user's notifications and the
// map's view menu on the right (see raceSync.css).
function RaceSyncHeader({ theme, onToggleTheme }) {
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

      <RaceSearch />

      <div className="racesync-account">
        {/* The app nav's ☀/☾ quick flip — this bar replaces that nav, so it
            carries the toggle too. A bare glyph like the bell beside it; the
            divider is what sets it apart. */}
        <button
          type="button"
          className="racesync-theme-toggle"
          title="Toggle dark mode"
          aria-label="Toggle dark mode"
          onClick={onToggleTheme}
        >
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
        <span className="racesync-divider" aria-hidden="true" />
        {/* The account's own updates — see RaceSyncBell. */}
        <RaceSyncBell />
        {/* What the centre map shows — see RaceSyncViewMenu. */}
        <RaceSyncViewMenu />
      </div>
    </header>
  );
}

export default RaceSyncHeader;
