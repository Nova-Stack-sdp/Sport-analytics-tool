import { useEffect, useMemo, useRef, useState } from 'react';
// Read-only reuse of Race Replay's canonical team-name → palette-key mapper,
// so a team carries the same colour here as it does on the Race Replay dots.
import { teamClassFor } from '../race-replay/raceReplayHelpers';
// …and of its replay engine: this page plays a session on the exact clock,
// speeds and per-lap cache Race Replay's own viewer runs on, rather than a
// second implementation that could drift from it. Read-only, like the rest of
// what RaceSync consumes — Race Replay itself is never modified.
import { useRaceReplaySnapshots } from '../race-replay/useRaceReplaySnapshots';
import { useRaceSyncCarMotion } from './useRaceSyncCarMotion';
import { useRaceSyncSelection } from './RaceSyncSelection';
import {
  addToScope,
  entryInScope,
  isScopeActive,
  removeFromScope,
  scopeMatchesTeams,
} from './raceSyncViewScope';
import RaceSyncFlag from './RaceSyncFlag';
import monzaAerial from '../../assets/racesync/monza-aerial.png';
import raceCarBackdrop from '../../assets/racesync/race-car.png';

// The RaceSync centre stage: the circuit map for whichever race is picked in
// the bar above, played lap by lap on Race Replay's own replay engine. Every
// piece of data here is real and read-only — the trace and the leaderboard
// come from the same endpoints Race Replay serves, and RaceSync reads Race
// Replay rather than altering it (the one thing its engine hook carries for
// this page is an opt-in parked start — see useRaceReplaySnapshots' autoPlay;
// its own viewer is unchanged). Cars are spaced by rank along the trace
// because no per-car x/y telemetry exists in the database (the same supported
// convention Race Replay's own viewer falls back to), so a lap in which two
// drivers swap places also swaps where they sit on the map. That spacing is
// only where a car settles, though: how it gets around is Race Replay's own
// paced motion, reused in useRaceSyncCarMotion, so the markers drive the
// circuit instead of blinking from slot to slot.

// F1 splits the lap into three roughly equal sectors; without per-circuit
// sector metadata these chips sit at the thirds, so read them as orientation
// furniture, not official split points.
const SECTOR_MARKS = [
  { label: 'S1', at: 0.03 },
  { label: 'S2', at: 0.35 },
  { label: 'S3', at: 0.68 },
];

// Shown on the map until a race is picked — how the workspace is meant to be
// used. Deliberately short: a live-timing screen stays operational, not
// explanatory, so these are one-liners with no sub-text.
const GUIDE_STEPS = [
  'Pick a race above to load its replay.',
  'Each marker on the map is a driver, coloured by team.',
  'Use the left rail to inspect strategy, telemetry and lap times.',
  'Simulate a change to see what could have happened.',
];

// Closes the list with a statement rather than more instructions — the same
// idea the rail's quote carries, one line shorter.
const GUIDE_PUNCHLINE = 'Don’t just watch the race. Read it.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// UTC keeps the caption on the fixture's own race-day date regardless of the
// viewer's timezone.
function formatDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// OpenF1 stores names like "Max VERSTAPPEN"; live timing shows VER.
function driverCode(name) {
  const last = String(name ?? '').trim().split(/\s+/).pop() ?? '';
  const letters = last
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return letters.slice(0, 3).toUpperCase() || '—';
}

// "Max VERSTAPPEN" → "Max Verstappen" for the legend; names already in
// normal case pass through untouched.
function displayName(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length > 2 && word === word.toUpperCase() ? word[0] + word.slice(1).toLowerCase() : word
    )
    .join(' ');
}

const round1 = (value) => Math.round(value * 10) / 10;

// Turns a raw trace into a renderable frame: rotated to landscape when the
// circuit is drawn taller than wide, y flipped (SVG grows downwards), padded
// to the edge, and exposed as arc-length helpers so cars and sector chips can
// be placed by lap fraction. Accepts either [x, y] pairs or { x, y } objects
// (the track-shape endpoint serves the latter).
function buildGeometry(rawPoints) {
  const pairs = (Array.isArray(rawPoints) ? rawPoints : [])
    .map((point) => (Array.isArray(point) ? point : [point?.x, point?.y]))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;

  const bounds = (list) => {
    const xs = list.map(([x]) => x);
    const ys = list.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  // Several circuits (Monza included) trace taller than wide, which would
  // force a vertical stage; those get rotated 90° so the map always reads
  // horizontally and resizes to fit instead of stretching downwards.
  const raw = bounds(pairs);
  const source =
    raw.maxY - raw.minY > raw.maxX - raw.minX
      ? pairs.map(([x, y]) => [y, -x])
      : pairs;
  const { minX, maxX, minY, maxY } = bounds(source);

  const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;

  const points = source.map(([x, y]) => [x - minX + pad, maxY - y + pad]);

  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const wrap = (fraction) => ((fraction % 1) + 1) % 1;
  const toPath = (list) =>
    list.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round1(x)},${round1(y)}`).join(' ');

  const pointAt = (fraction) => {
    const target = wrap(fraction) * total;
    let index = 1;
    while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
    const spanStart = cumulative[index - 1];
    const spanLength = cumulative[index] - spanStart || 1;
    const t = (target - spanStart) / spanLength;
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  };

  const percent = ({ x, y }) => ({
    left: `${round1((x / width) * 100)}%`,
    top: `${round1((y / height) * 100)}%`,
  });

  // Where the start/finish line goes. The trace is one lap of real telemetry,
  // so fraction 0 is the start/finish line itself — the one point on the map
  // that means the same thing on every circuit. Its angle comes from a chord
  // taken either side of that point rather than the first two samples, which
  // sit metres apart and can read as noise; turned 90°, that chord gives the
  // direction a line painted across the track runs in. The strip itself is
  // sized in CSS, so it keeps a fixed weight against the trace's own
  // non-scaling stroke however large the map is drawn.
  const START_CHORD = 0.004;
  const before = pointAt(-START_CHORD);
  const after = pointAt(START_CHORD);
  const startLine = {
    ...percent(pointAt(0)),
    angle: round1((Math.atan2(after.x - before.x, -(after.y - before.y)) * 180) / Math.PI),
  };

  return {
    width,
    height,
    ratio: width / height,
    viewBox: `0 0 ${round1(width)} ${round1(height)}`,
    path: toPath(points),
    pointAt,
    percent,
    startLine,
  };
}

// Rank-based field: the ORDER is the real leaderboard, the spacing along the
// lap is a stand-in (there is no real per-car position data to draw from).
// Only the running order is here — where a car sits on the trace comes from
// useRaceSyncCarMotion, driven by the rank that rides along on each entry.
function buildField(leaderboard) {
  const drivers = Array.isArray(leaderboard) ? leaderboard : [];
  if (drivers.length === 0) return [];
  return drivers.map((driver) => ({
    entryId: driver.entryId,
    // The raw names ride along so the legend's own controls can name the car
    // or team they act on; a marker only needs the code.
    driverName: driver.driverName,
    teamName: driver.teamName,
    code: driverCode(driver.driverName),
    name: displayName(driver.driverName),
    teamKey: teamClassFor(driver.teamName),
    // The place this car holds in the race as a whole (see `visible` below),
    // which is the slot it aims for on the trace.
    rank: driver.rank,
  }));
}

// The band's stat chips read straight from the replay state's `weather`
// block; a reading the payload doesn't carry is left out rather than guessed,
// so the band never invents numbers.
function buildWeatherChips(weather) {
  if (!weather) return [];
  const chips = [];
  const reading = (value, unit, label) => {
    if (!Number.isFinite(value)) return;
    chips.push({ label, value: `${Math.round(value)}${unit}` });
  };
  reading(weather.trackTemperature, '°C', 'Track Temp');
  reading(weather.airTemperature, '°C', 'Air Temp');
  reading(weather.humidity, '%', 'Humidity');
  if (Number.isFinite(weather.rainfall)) {
    chips.push({ label: 'Weather', value: weather.rainfall > 0 ? 'Wet' : 'Dry' });
  }
  return chips;
}

// One roster row: the legend's entry as it has always been, plus — only while
// a scope is set — the single icon that moves it on or off the map. The rows
// under the legend reuse it, so adding a car reads as the mirror of removing
// one and both are recognisably the same thing.
function RosterRow({ row, onMap, control }) {
  return (
    <li className={`racesync-stage-legend-item${onMap ? '' : ' is-off'}`}>
      <span
        className={`racesync-stage-legend-dot racesync-car-${row.teamKey}`}
        aria-hidden="true"
      />
      <span className="racesync-stage-legend-code">{row.code}</span>
      <span className="racesync-stage-legend-name">{row.name}</span>
      {control && (
        <button
          type="button"
          className="racesync-stage-legend-toggle"
          title={control.label}
          aria-label={control.label}
          onClick={control.onClick}
        >
          {/* Minus takes the row off the map, plus puts it back. */}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={onMap ? 'M6 12h12' : 'M12 6v12M6 12h12'} />
          </svg>
        </button>
      )}
    </li>
  );
}

function RaceSyncTrackStage({ sessionId, race }) {
  // The roster the header's view menu lists and the scope it writes both live
  // in the shared selection; this stage loads the session, so it is the one
  // that publishes the roster.
  const { scope, setRoster, setScope } = useRaceSyncSelection();
  // The replay itself. The engine is Race Replay's own: it fetches the track
  // outline, holds the lap clock (one lap every BASE_TICK_MS / speed) and
  // caches each lap's snapshot, and hands back the state for the lap it is on.
  // Picking a race parks it on lap 0 rather than starting it — the band's Play
  // button is the only thing that starts this race (autoPlay: false, the one
  // option this page asks of the shared hook; its own viewer still starts the
  // moment a session is picked). With no race picked sessionId is undefined
  // and it sits idle.
  const {
    snapshot,
    error,
    atEnd,
    playing,
    speed,
    togglePlaying,
    cycleSpeed,
    restart,
    jumpToLap,
    trackShape,
    trackShapeError,
  } = useRaceReplaySnapshots(sessionId, { autoPlay: false });

  // The two waits the map falls back on, named as they were when this stage
  // fetched for itself: a trace that has not arrived, and one this circuit
  // has none of.
  const shapeStatus = trackShape ? 'ready' : trackShapeError ? 'missing' : 'loading';
  const fieldStatus = snapshot ? 'ready' : error ? 'missing' : 'loading';

  const geometry = useMemo(() => buildGeometry(trackShape?.points), [trackShape]);

  // The field in the shape the menu renders it: raw name for the scope to
  // match on, plus the display name and code the rows show. Rebuilt for every
  // lap the replay plays — the backend always answers with the whole entry
  // list (falling back to each driver's grid slot), so the field never thins
  // out as the playhead walks the early laps.
  const roster = useMemo(
    () =>
      (Array.isArray(snapshot?.leaderboard) ? snapshot.leaderboard : []).map((entry) => ({
        driverName: entry.driverName,
        name: displayName(entry.driverName),
        code: driverCode(entry.driverName),
        teamName: entry.teamName,
      })),
    [snapshot]
  );

  useEffect(() => {
    setRoster(roster);
  }, [roster, setRoster]);

  // The view menu's scope is the only thing that narrows the field, and it
  // filters the markers and the legend together because both are built from
  // this one list. Each entry keeps the rank it holds in the full leaderboard,
  // so taking a car off the map empties its slot rather than closing the gap.
  const visible = useMemo(() => {
    const leaderboard = Array.isArray(snapshot?.leaderboard) ? snapshot.leaderboard : [];
    return leaderboard
      .map((entry, rank) => ({ ...entry, rank }))
      .filter((entry) => entryInScope(scope, entry));
  }, [snapshot, scope]);
  const gridSize = Array.isArray(snapshot?.leaderboard) ? snapshot.leaderboard.length : 0;
  const field = useMemo(() => buildField(visible), [visible]);

  // How the cars get around the circuit: the paced motion Race Replay's viewer
  // gives its dots — about one lap per tick, sped up or slowed down by at most
  // a sixth so a change of position settles over a few ticks, glided frame by
  // frame — writing to these markers' map percentages. Read-only against the
  // leaderboard and the trace; it decides nothing about the race itself.
  const registerCar = useRaceSyncCarMotion({
    geometry,
    field,
    totalDrivers: gridSize,
    lap: snapshot?.lap ?? 0,
    playing,
    speed,
  });

  // The band's lap readout is also its jump box, so the number being edited
  // needs a draft of its own: the replay ticking on underneath must not
  // overwrite what is being typed.
  const [lapDraft, setLapDraft] = useState(null);
  const lapAtFocusRef = useRef(null);

  // The roster column beside the map is live while the replay is up: a scope
  // can be shortened or extended there without going back to the header. A
  // team scope names whole teams, so its ＋ rows offer teams and a row's −
  // takes the team behind it off the map.
  const scopeActive = isScopeActive(scope);
  const teamScope = scopeMatchesTeams(scope?.mode);

  const candidates = useMemo(() => {
    if (!isScopeActive(scope)) return [];
    const taken = new Set(scope.values);
    if (scopeMatchesTeams(scope.mode)) {
      const teams = [];
      roster.forEach((entry) => {
        if (entry.teamName && !teams.includes(entry.teamName)) teams.push(entry.teamName);
      });
      return teams
        .filter((teamName) => !taken.has(teamName))
        .map((teamName) => ({
          key: teamName,
          code: '',
          name: teamName,
          teamKey: teamClassFor(teamName),
        }));
    }
    return roster
      .filter((entry) => !taken.has(entry.driverName))
      .map((entry) => ({
        key: entry.driverName,
        code: entry.code,
        name: entry.name,
        teamKey: teamClassFor(entry.teamName),
      }));
  }, [scope, roster]);

  // No race picked (the default): the map frame stays put and carries the
  // workspace instructions instead of a trace. No fetches run — sessionId is
  // null and the effect above bails out.
  if (!sessionId) {
    return (
      <section className="racesync-stage" aria-label="How to use RaceSync">
        <div className="racesync-stage-body">
          <div className="racesync-stage-map-wrap">
            <div
              className="racesync-stage-map"
              style={{ aspectRatio: '16 / 9', maxWidth: 'calc(52vh * 1.78)' }}
            >
              <img className="racesync-stage-aerial" src={monzaAerial} alt="" />
              <div className="racesync-stage-guide">
                <div className="racesync-guide-panel">
                  <ul className="racesync-guide-list">
                    {GUIDE_STEPS.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                  <p className="racesync-guide-punchline">{GUIDE_PUNCHLINE}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const totalLaps = snapshot?.totalLaps ?? null;
  const lap = snapshot?.lap ?? null;
  const remainingLaps =
    lap != null && totalLaps != null ? Math.max(0, totalLaps - lap) : null;
  const chips = buildWeatherChips(snapshot?.weather);
  // The red mark says what the replay is doing: Play starts this race (or picks
  // a paused one back up), Restart plays it again from the first lap. At the
  // end the label is Play once more, because the only race left to play is the
  // whole one. The chevrons are that same mark's two directions — a lap back,
  // a lap forward, on this replay's own lap clock.
  const primaryLabel = playing ? 'Restart the replay' : 'Play the replay';
  const primaryAction = () => {
    if (playing || atEnd) restart();
    else togglePlaying();
  };
  const stepBack = () => jumpToLap((lap ?? 0) - 1);
  const stepForward = () => jumpToLap((lap ?? 0) + 1);
  // The jump box: the lap number in the band is a field, so a lap can be typed
  // rather than stepped to one at a time. Focusing starts the draft from the
  // lap on screen — reading the box never moves the playhead — and selects it,
  // so a typed lap replaces the readout instead of being inserted into the
  // middle of it. (A number input refuses to be selected, which is why this is
  // a text box with a numeric keypad.) Confirming sends the replay there
  // without disturbing play or pause, and an out-of-range lap is answered
  // rather than refused: jumpToLap clamps to the race, so a typo lands on the
  // nearest real lap.
  const beginLapEdit = (event) => {
    lapAtFocusRef.current = lap;
    setLapDraft(String(lap));
    event.target.select();
  };
  const commitLapEdit = () => {
    const typed = lapDraft;
    setLapDraft(null);
    if (typed == null || typed === String(lapAtFocusRef.current)) return;
    const wanted = Number.parseInt(typed, 10);
    if (Number.isFinite(wanted)) jumpToLap(wanted);
  };
  const handleLapKey = (event) => {
    if (event.key === 'Enter') commitLapEdit();
    if (event.key === 'Escape') setLapDraft(null);
  };
  const dateLabel = formatDay(race?.startTime);
  // The session type is part of the line on purpose: a meeting can hold both a
  // race and a qualifying session, and the title alone can't tell them apart.
  const metaLine = race
    ? [race.circuitName, race.country, dateLabel, race.type].filter(Boolean).join(' · ')
    : null;

  return (
    <section className="racesync-stage" aria-label="Circuit map and driver positions">
      {/* Race band: who and where on the left, how far along on the right,
          over a track photograph that fades back behind the text. */}
      <header className="racesync-band">
        <img className="racesync-band-photo" src={raceCarBackdrop} alt="" />
        <div className="racesync-band-ident">
          <RaceSyncFlag country={race?.country} className="racesync-flag" />
          <div className="racesync-band-text">
            <h2 className="racesync-band-name">{race?.meetingName ?? 'Race replay'}</h2>
            {metaLine && <p className="racesync-band-meta">{metaLine}</p>}
          </div>
        </div>

        <div className="racesync-band-stats">
          {/* The transport, on Race Replay's own engine — same lap clock, same
              speeds, same per-lap cache as its viewer. The chevrons step a lap
              at a time on that same clock; pause keeps the middle seat, since
              starting and restarting live on the red mark beside it. */}
          <div className="racesync-band-transport">
            <button
              type="button"
              className="racesync-transport-btn"
              title="Back one lap"
              aria-label="Back one lap"
              onClick={stepBack}
              disabled={lap == null || lap <= 0}
            >
              {/* Two chevrons, one glyph — the mirror of the forward pair, so
                  the two ends of the cluster read as one control. */}
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M11 7 6 12l5 5M18 7l-5 5 5 5" />
              </svg>
            </button>
            <button
              type="button"
              className="racesync-transport-btn"
              title={playing ? 'Pause the replay' : 'Resume the replay'}
              aria-label={playing ? 'Pause the replay' : 'Resume the replay'}
              onClick={togglePlaying}
              disabled={atEnd}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              className="racesync-transport-btn"
              title="Replay speed"
              aria-label={`Replay speed ${speed}×`}
              onClick={cycleSpeed}
            >
              {speed}×
            </button>
            <button
              type="button"
              className="racesync-transport-btn"
              title="Forward one lap"
              aria-label="Forward one lap"
              onClick={stepForward}
              disabled={lap == null || atEnd}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
              </svg>
            </button>
          </div>

          {/* Not "Live": these replays are historical, and the band shouldn't
              claim otherwise. The red mark is what used to be the mode pill —
              now the one control that says what the replay is doing. */}
          <button
            type="button"
            className="racesync-primary-btn"
            title={primaryLabel}
            aria-label={primaryLabel}
            onClick={primaryAction}
          >
            {playing ? 'Restart' : 'Play'}
          </button>
          {lap != null && totalLaps != null && (
            <span className="racesync-band-lap">
              {/* Same words as a readout, but the number is the jump box:
                  type a lap into it and press Enter — or click away — to send
                  the replay there. */}
              <label className="racesync-band-lap-caption">
                Lap
                <input
                  className="racesync-band-lap-input"
                  type="text"
                  inputMode="numeric"
                  title={`Jump to a lap between 0 and ${totalLaps}`}
                  value={lapDraft ?? lap}
                  onFocus={beginLapEdit}
                  onChange={(event) => setLapDraft(event.target.value)}
                  onBlur={commitLapEdit}
                  onKeyDown={handleLapKey}
                />
              </label>
              <span>/ {totalLaps}</span>
            </span>
          )}
          {chips.map((chip) => (
            <span key={chip.label} className="racesync-band-chip">
              <span className="racesync-band-chip-value">{chip.value}</span>
              <span className="racesync-band-chip-label">{chip.label}</span>
            </span>
          ))}
          {remainingLaps != null && totalLaps > 0 && (
            <span className="racesync-band-remaining">
              <span className="racesync-band-remaining-label">Time remaining</span>
              <span className="racesync-band-remaining-value">
                {remainingLaps} {remainingLaps === 1 ? 'Lap' : 'Laps'}
              </span>
              <span className="racesync-band-bar" aria-hidden="true">
                <span
                  className="racesync-band-bar-fill"
                  style={{ width: `${Math.round((remainingLaps / totalLaps) * 100)}%` }}
                />
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="racesync-stage-body">
        <div className="racesync-stage-map-wrap">
          <div
            className="racesync-stage-map"
            style={{
              aspectRatio: geometry
                ? `${geometry.width} / ${geometry.height}`
                : '16 / 9',
              maxWidth: geometry
                ? `calc(52vh * ${geometry.ratio})`
                : 'calc(52vh * 1.78)',
            }}
          >
            <img className="racesync-stage-aerial" src={monzaAerial} alt="" />

            {geometry ? (
              <>
                <svg className="racesync-stage-svg" viewBox={geometry.viewBox} aria-hidden="true">
                  <path className="racesync-trace-shadow" d={geometry.path} />
                  <path className="racesync-trace-line" d={geometry.path} />
                </svg>

                {/* The start/finish line — the flag's own black and white, in
                    the one place on the map that means the same thing on every
                    circuit. Its rotation is the trace's normal there, so it
                    lies across the track rather than along it. */}
                <span
                  className="racesync-stage-startline"
                  style={{
                    left: geometry.startLine.left,
                    top: geometry.startLine.top,
                    transform: `translate(-50%, -50%) rotate(${geometry.startLine.angle}deg)`,
                  }}
                />

                {SECTOR_MARKS.map((sector) => (
                  <span
                    key={sector.label}
                    className="racesync-stage-sector"
                    style={geometry.percent(geometry.pointAt(sector.at))}
                  >
                    {sector.label}
                  </span>
                ))}

                {field.map((driver) => (
                  /* Where a marker sits is written straight to the node by the
                     motion hook, sixty times a second, instead of rendered —
                     see useRaceSyncCarMotion for why. */
                  <span
                    key={driver.entryId}
                    ref={registerCar(driver.entryId)}
                    className={`racesync-stage-car racesync-car-${driver.teamKey}`}
                  >
                    {driver.code}
                  </span>
                ))}
              </>
            ) : (
              <div className="racesync-stage-overlay">
                {shapeStatus === 'loading' && 'Loading the circuit outline…'}
                {shapeStatus === 'missing' &&
                  'No real track outline is available for this circuit yet.'}
              </div>
            )}
          </div>
        </div>

        {(field.length > 0 || candidates.length > 0) && (
          <div className="racesync-stage-roster">
            {field.length > 0 && (
              <ul className="racesync-stage-legend">
                {field.map((driver) => (
                  <RosterRow
                    key={driver.entryId}
                    row={driver}
                    onMap
                    control={
                      scopeActive
                        ? {
                            // In a team scope the control names the team,
                            // because that is what it takes off — both cars of
                            // the team leave with it.
                            label: `Remove ${
                              teamScope ? driver.teamName : driver.name
                            } from the map`,
                            onClick: () =>
                              setScope(
                                removeFromScope(
                                  scope,
                                  teamScope ? driver.teamName : driver.driverName
                                )
                              ),
                          }
                        : null
                    }
                  />
                ))}
              </ul>
            )}

            {candidates.length > 0 && (
              <div className="racesync-stage-add">
                <p className="racesync-stage-add-title">
                  {teamScope ? 'Add team' : 'Add driver'}
                </p>
                <ul className="racesync-stage-add-list">
                  {candidates.map((row) => (
                    <RosterRow
                      key={row.key}
                      row={row}
                      control={{
                        label: `Add ${row.name} to the map`,
                        onClick: () => setScope(addToScope(scope, row.key)),
                      }}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      </div>

      {fieldStatus === 'missing' && geometry && (
        <p className="racesync-stage-note">Driver positions aren’t available for this session.</p>
      )}
    </section>
  );
}

export default RaceSyncTrackStage;
