import { useEffect, useMemo, useRef, useState } from 'react';
import { useRaceSyncSelection } from './RaceSyncSelection';
import {
  VIEW_MODES,
  VIEW_MENU_PROMPT,
  isMultiMode,
  modeLabel,
  scopeLabel,
} from './raceSyncViewScope';
// Read-only reuse of Race Replay's team-name → palette-key mapper, so the
// menu's swatches carry the same colours as the map's markers.
import { teamClassFor } from '../race-replay/raceReplayHelpers';

const PANEL_ID = 'racesync-view-options';

// Stable empty list, so the memos below do not see a new value every render.
const NO_VALUES = [];

// The header's view menu: what the centre map shows. It reads as the account
// chip it replaced — round badge, label, chevron — but it is a picker, and the
// scope it writes is the same object the map filters with, so picking "Choose
// driver" and then a name narrows the markers and the legend together.
//
// The roster it lists is the loaded session's own leaderboard, published by
// the stage (the component that owns that fetch), so the menu can only ever
// offer drivers and teams that are actually in the race.
function RaceSyncViewMenu() {
  const { selectedId, roster, scope, setScope } = useRaceSyncSelection();
  const [open, setOpen] = useState(false);
  // null = the mode list; otherwise the entity list of that mode.
  const [mode, setMode] = useState(null);
  const menuRef = useRef(null);
  const panelRef = useRef(null);

  const label = scopeLabel(scope) ?? VIEW_MENU_PROMPT;
  const multi = mode !== null && isMultiMode(mode);
  const picked = scope?.values ?? [];
  // Editing another mode starts from nothing: a team name must never be
  // carried into a driver comparison (see entryInScope).
  const editing = mode !== null && scope?.mode === mode ? picked : NO_VALUES;

  // Teams in the order the field runs, with how many cars each entered.
  const teams = useMemo(() => {
    const counts = new Map();
    roster.forEach((entry) => {
      if (!entry.teamName) return;
      counts.set(entry.teamName, (counts.get(entry.teamName) ?? 0) + 1);
    });
    return [...counts].map(([name, cars]) => ({
      key: name,
      label: name,
      note: `${cars} ${cars === 1 ? 'car' : 'cars'}`,
      teamKey: teamClassFor(name),
      selected: editing.includes(name),
    }));
  }, [roster, editing]);

  const drivers = useMemo(
    () =>
      roster.map((entry) => ({
        key: entry.driverName,
        label: entry.name ?? entry.driverName,
        note: entry.code,
        teamKey: teamClassFor(entry.teamName),
        selected: editing.includes(entry.driverName),
      })),
    [roster, editing]
  );

  const rows = useMemo(() => {
    if (mode === null) {
      return VIEW_MODES.map((entry) => ({
        key: entry.mode,
        label: entry.label,
        note: entry.note,
        selected: scope?.mode === entry.mode,
      }));
    }
    return mode === 'driver' || mode === 'drivers' ? drivers : teams;
  }, [mode, drivers, teams, scope]);

  const closeMenu = () => {
    setOpen(false);
    setMode(null);
  };

  const chooseMode = (nextMode) => {
    // "Whole race" is already a complete answer; the other modes open a list.
    if (nextMode === 'all') {
      setScope({ mode: 'all', values: [] });
      closeMenu();
      return;
    }
    setMode(nextMode);
  };

  const chooseEntity = (key) => {
    if (multi) {
      // Comparisons are built up row by row, so the menu stays open and the
      // map follows every toggle.
      setScope({
        mode,
        values: editing.includes(key)
          ? editing.filter((value) => value !== key)
          : [...editing, key],
      });
      return;
    }
    setScope({ mode, values: [key] });
    closeMenu();
  };

  // Close when the click lands outside the menu — the same listener pattern
  // the race search uses.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
        setMode(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // The panel takes focus when it opens and whenever the list changes under
  // it, so the arrow keys and Escape keep working after a mode is picked.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, mode]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      // One Escape steps out of an entity list, the next closes the menu.
      if (mode !== null) setMode(null);
      else closeMenu();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!open) {
      setOpen(true);
      return;
    }
    const options = panelRef.current?.querySelectorAll('[role="option"]');
    if (!options || options.length === 0) return;
    event.preventDefault();
    const list = [...options];
    const at = list.indexOf(document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    list[at === -1 ? 0 : (at + step + list.length) % list.length].focus();
  };

  return (
    <div className="racesync-menu" ref={menuRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="racesync-view-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={label === VIEW_MENU_PROMPT ? VIEW_MENU_PROMPT : `What the map shows: ${label}`}
        title={VIEW_MENU_PROMPT}
        onClick={() => {
          if (open) closeMenu();
          else setOpen(true);
        }}
      >
        <span className="racesync-view-badge" aria-hidden="true">
          {/* Sliders rather than initials: this chip sets the view, it is not
              a person. */}
          <svg className="racesync-view-icon" viewBox="0 0 24 24" focusable="false">
            <path d="M4 8h9M19 8h1M4 16h3M13 16h7"></path>
            <circle cx="16" cy="8" r="2.2"></circle>
            <circle cx="10" cy="16" r="2.2"></circle>
          </svg>
        </span>
        <span className="racesync-view-label">{label}</span>
        <svg className="racesync-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </button>

      {open && (
        <div
          className="racesync-menu-panel"
          id={PANEL_ID}
          ref={panelRef}
          role="listbox"
          aria-label="Map view options"
          aria-multiselectable={multi || undefined}
          tabIndex={-1}
        >
          <p className="racesync-menu-title">
            {mode === null ? 'Show on the map' : modeLabel(mode)}
          </p>

          {mode !== null && (
            <button
              type="button"
              className="racesync-menu-action racesync-menu-back"
              onClick={() => setMode(null)}
            >
              ← Back
            </button>
          )}

          {roster.length === 0 && (
            <p className="racesync-menu-note">
              {selectedId
                ? 'This session has no driver list yet.'
                : 'Pick a race above to choose what the map shows.'}
            </p>
          )}

          <ul className="racesync-menu-list">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={row.selected}
                  className={['racesync-menu-option', row.selected ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => (mode === null ? chooseMode(row.key) : chooseEntity(row.key))}
                >
                  {row.teamKey && (
                    <span
                      className={`racesync-menu-swatch racesync-car-${row.teamKey}`}
                      aria-hidden="true"
                    />
                  )}
                  <span className="racesync-menu-option-name">{row.label}</span>
                  {multi ? (
                    <span className="racesync-menu-check" aria-hidden="true">
                      {row.selected && (
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                    </span>
                  ) : (
                    <span className="racesync-menu-option-type">{row.note}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* A comparison is applied as it is built, so it needs a way out
              that is not "click somewhere else". */}
          {multi && (
            <button type="button" className="racesync-menu-action" onClick={closeMenu}>
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default RaceSyncViewMenu;
