import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useRaceSyncSim } from './RaceSyncSimContext';
import { simPositionAtLap } from './raceSyncSim';
import {
  addToScope,
  entryInScope,
  isScopeActive,
  removeFromScope,
  scopeMatchesTeams,
} from './raceSyncViewScope';
// Driver naming, shared with the panels under the map so a car is spelled the
// same way in the roster and in a table.
import { displayName, driverCode } from './raceSyncDriverNames';
import RaceSyncFlag from './RaceSyncFlag';
import RaceSyncSpine from './RaceSyncSpine';
// The rail's Race Overview row lands on this section: the same id map the
// panels use, so the rail and the page cannot point at different things.
import { SECTION_ANCHORS } from './raceSyncAnchors';
// The readings of the same race: the panels under the map, which follow this
// stage's own playhead, so neither the numbers nor the map can get ahead of
// the other.
import RaceSyncGraphs from './RaceSyncGraphs';
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
  'Use the left rail to reach the analysis sections.',
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

const round1 = (value) => Math.round(value * 10) / 10;

// The map's zoom, in one place: a scale k — never below the fitted view, never
// past 8× — and a pan clamped so the circuit's own edge can never be dragged
// inside the frame (at 1× that is exactly no travel; beyond it, exactly the
// overflow). Pure arithmetic, so the rules read here and nowhere else.
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 8;
const MAP_ZOOM_STEP = 1.6;

const IDENTITY_ZOOM = { k: 1, x: 0, y: 0 };

function clampMapZoom({ k, x, y }, width, height) {
  const scale = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, k));
  return {
    k: scale,
    x: Math.min(0, Math.max(-width * (scale - 1), x)),
    y: Math.min(0, Math.max(-height * (scale - 1), y)),
  };
}

// Zooming keeps one point of the circuit still — the cursor for the wheel,
// the centre for the buttons — and that fixed point is the whole of the
// arithmetic below.
function zoomMapAt(current, factor, width, height, focalX, focalY) {
  const k = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, current.k * factor));
  const ratio = k / current.k;
  return clampMapZoom(
    {
      k,
      x: focalX - (focalX - current.x) * ratio,
      y: focalY - (focalY - current.y) * ratio,
    },
    width,
    height
  );
}

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
function RosterRow({ row, onMap, control, simmed }) {
  return (
    <li className={`racesync-stage-legend-item${onMap ? '' : ' is-off'}`}>
      <span
        className={`racesync-stage-legend-dot racesync-car-${row.teamKey}`}
        aria-hidden="true"
      />
      <span className="racesync-stage-legend-code">{row.code}</span>
      <span className="racesync-stage-legend-name">{row.name}</span>
      {/* While the sim is live, the rows carrying a tweak say so — the same
          red the mode switch uses, so "this car is the counterfactual" reads
          identically everywhere. */}
      {simmed && (
        <span className="racesync-stage-legend-sim" title="Carrying a simulation tweak">
          SIM
        </span>
      )}
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
  // The sim surface: the overlay (solid sim cars riding over ghosted real
  // ones) and the roster's SIM chips both read it, and everything sim
  // no-ops until simLive — sim mode chosen AND a tweak carried — so the
  // untouched map is never repainted.
  const { sim, simLive, tweaks } = useRaceSyncSim();
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

  // The map's zoom: one transform on a wrapper of everything the circuit is
  // drawn of, so the picture zooms as one thing, while the pieces sized in
  // screen pixels — cars, sector chips, the start line — counter-scale
  // through --racesync-map-k and so stay legible. Zooming never touches the
  // replay: the cars keep driving whatever the view does.
  const [zoom, setZoom] = useState(IDENTITY_ZOOM);
  const [panning, setPanning] = useState(false);
  const mapRef = useRef(null);
  const dragRef = useRef(null);

  // A different race is a different circuit: the view goes back to fitted.
  useEffect(() => {
    setZoom(IDENTITY_ZOOM);
  }, [sessionId]);

  // Ctrl/⌘ + wheel zooms under the cursor — the gesture the browser itself
  // answers with a page zoom, so it is taken over with a non-passive listener
  // (React's own onWheel cannot refuse the default). A plain wheel keeps
  // scrolling the page: the map sits in the middle of it and must not take
  // the wheel hostage.
  const handleMapWheel = useCallback((event) => {
    const node = mapRef.current;
    if (node == null) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = node.getBoundingClientRect();
    // Line-unit deltas (Firefox) rescaled to the pixel deltas every other
    // browser reports, so a notch means one notch everywhere.
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    setZoom((current) =>
      zoomMapAt(
        current,
        Math.exp(-delta * 0.002),
        rect.width,
        rect.height,
        event.clientX - rect.left,
        event.clientY - rect.top
      )
    );
  }, []);

  // The listener follows the node it serves rather than the session: the map
  // card is handed to the readings' grid, which re-creates it when the lap
  // series lands (its loading tree and its data tree place the card in
  // different positions), so a session-keyed effect would weld the zoom to a
  // node the page has already thrown away. A ref callback attaches and
  // detaches with the node itself, whichever tree it lands in.
  const attachMapNode = useCallback(
    (node) => {
      if (mapRef.current) mapRef.current.removeEventListener('wheel', handleMapWheel);
      mapRef.current = node;
      if (node) node.addEventListener('wheel', handleMapWheel, { passive: false });
    },
    [handleMapWheel]
  );

  const zoomBy = (factor) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect == null) return;
    setZoom((current) =>
      zoomMapAt(current, factor, rect.width, rect.height, rect.width / 2, rect.height / 2)
    );
  };

  const resetZoom = () => setZoom(IDENTITY_ZOOM);

  // A drag pans — but only once there is somewhere to pan, so the cursor never
  // promises a drag the clamp would refuse anyway.
  const beginPan = (event) => {
    if (zoom.k <= MIN_MAP_ZOOM) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: zoom.x,
      originY: zoom.y,
    };
    setPanning(true);
  };

  const movePan = (event) => {
    const drag = dragRef.current;
    if (drag == null || drag.pointerId !== event.pointerId) return;
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect == null) return;
    setZoom((current) =>
      clampMapZoom(
        {
          ...current,
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        },
        rect.width,
        rect.height
      )
    );
  };

  const endPan = (event) => {
    const drag = dragRef.current;
    if (drag == null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPanning(false);
  };

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

  // The sim's solid cars: one per tweaked driver who is on the map AND has a
  // sim position at the playhead, aimed at the slot the sim's running order
  // gives them (0-based rank). They ride the same motion instance as the
  // real field — a second clock could drift from the replay's own — and they
  // clean themselves up: the hook forgets any car absent from the field, so
  // a tweak reset or a scope-out removes the marker by leaving this list.
  const simCars = useMemo(() => {
    if (!simLive || !sim) return [];
    const atLap = snapshot?.lap ?? 0;
    const cars = [];
    for (const entryId of sim.tweaked) {
      const position = simPositionAtLap(sim, entryId, atLap);
      const base = field.find((driver) => driver.entryId === entryId);
      if (position == null || !base) continue;
      cars.push({ ...base, entryId: `${entryId}:sim`, rank: position - 1 });
    }
    return cars;
  }, [simLive, sim, snapshot, field]);

  const motionField = useMemo(
    () => (simCars.length > 0 ? [...field, ...simCars] : field),
    [field, simCars]
  );

  // How the cars get around the circuit: the paced motion Race Replay's viewer
  // gives its dots — about one lap per tick, sped up or slowed down by at most
  // a sixth so a change of position settles over a few ticks, glided frame by
  // frame — writing to these markers' map percentages. Read-only against the
  // leaderboard and the trace; it decides nothing about the race itself.
  const registerCar = useRaceSyncCarMotion({
    geometry,
    field: motionField,
    totalDrivers: gridSize,
    lap: snapshot?.lap ?? 0,
    playing,
    speed,
  });

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
      <section className="racesync-stage" id={SECTION_ANCHORS.overview} aria-label="How to use RaceSync">
        <div className="racesync-stage-body">
          <div className="racesync-stage-map-wrap">
            <div
              className="racesync-stage-map is-guide"
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
  // The red mark on the workflow spine says what the replay is doing: Play
  // starts this race (or picks a paused one back up), Restart plays it again
  // from the first lap. At the end the label is Replay once more, because
  // the only race left to play is the whole one. The chevrons, the type-in
  // lap chip, pause and the speed cycle live on that bar beside the mark
  // now — the band keeps only the readings the playhead drives.
  const primaryAction = () => {
    if (playing || atEnd) restart();
    else togglePlaying();
  };
  const dateLabel = formatDay(race?.startTime);
  // The session type is part of the line on purpose: a meeting can hold both a
  // race and a qualifying session, and the title alone can't tell them apart.
  const metaLine = race
    ? [race.circuitName, race.country, dateLabel, race.type].filter(Boolean).join(' · ')
    : null;

  return (
    <section
      className="racesync-stage"
      id={SECTION_ANCHORS.overview}
      aria-label="Circuit map and driver positions"
    >
      {/* Race band: who and where on the left, how the sky was doing and how
          far along on the right, over a track photograph that fades back
          behind the text. */}
      <header className="racesync-band">
        <img className="racesync-band-photo" src={raceCarBackdrop} alt="" />
        <div className="racesync-band-ident">
          <RaceSyncFlag country={race?.country} className="racesync-flag" />
          <div className="racesync-band-text">
            <h2 className="racesync-band-name">{race?.meetingName ?? 'Race replay'}</h2>
            {metaLine && <p className="racesync-band-meta">{metaLine}</p>}
          </div>
        </div>

        {/* How far along and what the sky was doing — the band is a readout
            now; the controls that drive the playhead live on the workflow
            spine under the readings, beside the replay mark. */}
        <div className="racesync-band-stats">
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

      {/* The map card is handed to the readings' own grid: the panels place it
          between their two flanking columns, so it stands at the centre of the
          page with a reading down each side. The playhead is this stage's, so
          the readings advance with the map. The workflow spine rides that
          grid as a full-width row under the readings, carrying every control
          that drives the playhead beside the replay mark. */}
      <RaceSyncGraphs
        sessionId={sessionId}
        snapshot={snapshot}
        race={race}
        workflow={
          <RaceSyncSpine
            lap={lap}
            totalLaps={totalLaps}
            atEnd={atEnd}
            playing={playing}
            speed={speed}
            onJumpToLap={jumpToLap}
            onTogglePlaying={togglePlaying}
            onCycleSpeed={cycleSpeed}
            onReplay={primaryAction}
          />
        }
      >
        <div className="racesync-stage-body">
          <div className="racesync-stage-map-wrap">
            <div
              ref={attachMapNode}
              className="racesync-stage-map"
              style={{
                aspectRatio: geometry
                  ? `${geometry.width} / ${geometry.height}`
                  : '16 / 9',
                maxWidth: geometry
                  ? `calc(52vh * ${geometry.ratio})`
                  : 'calc(52vh * 1.78)',
                // The counter-scale every screen-sized piece of the circuit
                // carries, so cars, sector chips and the start line stay
                // legible at any zoom instead of growing with the picture.
                '--racesync-map-k': String(1 / zoom.k),
              }}
            >
              {/* Everything of the circuit — aerial, trace, start line,
                  sectors and cars — rides one transform, so the map zooms as
                  one picture; the vignette rides inside it too, being part of
                  the picture rather than of the frame. The trace's stroke
                  already draws non-scaling and the rest counter-scales, so
                  nothing thickens as the map comes closer. */}
              <div
                className={`racesync-stage-zoom${
                  zoom.k > MIN_MAP_ZOOM ? ' is-zoomed' : ''
                }${panning ? ' is-panning' : ''}`}
                style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})` }}
                onPointerDown={beginPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
                <img className="racesync-stage-aerial" src={monzaAerial} alt="" />
                <span className="racesync-stage-vignette" aria-hidden="true" />

                {geometry ? (
                  <>
                    <svg
                      className="racesync-stage-svg"
                      viewBox={geometry.viewBox}
                      aria-hidden="true"
                    >
                      <path className="racesync-trace-shadow" d={geometry.path} />
                      <path className="racesync-trace-line" d={geometry.path} />
                    </svg>

                    {/* The start/finish line — the flag's own black and white,
                        in the one place on the map that means the same thing
                        on every circuit. Its rotation is the trace's normal
                        there, so it lies across the track rather than along
                        it. */}
                    <span
                      className="racesync-stage-startline"
                      style={{
                        left: geometry.startLine.left,
                        top: geometry.startLine.top,
                        transform: `translate(-50%, -50%) rotate(${geometry.startLine.angle}deg) scale(var(--racesync-map-k, 1))`,
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
                      /* Where a marker sits is written straight to the node by
                         the motion hook, sixty times a second, instead of
                         rendered — see useRaceSyncCarMotion for why. While
                         the sim is live the real field steps back into a
                         ghost: the truth underneath, never deleted. */
                      <span
                        key={driver.entryId}
                        ref={registerCar(driver.entryId)}
                        className={`racesync-stage-car racesync-car-${driver.teamKey}${
                          simLive ? ' is-ghost' : ''
                        }`}
                      >
                        {driver.code}
                      </span>
                    ))}
                    {simCars.map((driver) => (
                      /* The same driver's sim car, solid on top of their own
                         ghost — keyed apart (:sim) so the two markers never
                         fight over one node. */
                      <span
                        key={driver.entryId}
                        ref={registerCar(driver.entryId)}
                        className={`racesync-stage-car is-sim racesync-car-${driver.teamKey}`}
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

              {/* The frame's own furniture: zoom in, zoom out, the readout of
                  the zoom itself, and the reset back to the fitted view. It
                  stays outside the wrapper on purpose — the frame does not
                  travel with the circuit. Ctrl/⌘ + wheel zooms under the
                  cursor; a drag pans once there is somewhere to pan. */}
              {geometry && (
                <div className="racesync-stage-zoombar" role="group" aria-label="Map zoom">
                  <button
                    type="button"
                    className="racesync-zoom-btn"
                    title="Zoom the map in"
                    aria-label="Zoom the map in"
                    onClick={() => zoomBy(MAP_ZOOM_STEP)}
                    disabled={zoom.k >= MAX_MAP_ZOOM}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="racesync-zoom-btn"
                    title="Zoom the map out"
                    aria-label="Zoom the map out"
                    onClick={() => zoomBy(1 / MAP_ZOOM_STEP)}
                    disabled={zoom.k <= MIN_MAP_ZOOM}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M6 12h12" />
                    </svg>
                  </button>
                  <span className="racesync-zoom-readout">{zoom.k.toFixed(1)}×</span>
                  <button
                    type="button"
                    className="racesync-zoom-btn"
                    title="Reset the map view"
                    aria-label="Reset the map view"
                    onClick={resetZoom}
                    disabled={zoom.k === MIN_MAP_ZOOM}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                    </svg>
                  </button>
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
                      simmed={simLive && Boolean(tweaks[driver.entryId])}
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
      </RaceSyncGraphs>

      {fieldStatus === 'missing' && geometry && (
        <p className="racesync-stage-note">Driver positions aren’t available for this session.</p>
      )}
    </section>
  );
}

export default RaceSyncTrackStage;
