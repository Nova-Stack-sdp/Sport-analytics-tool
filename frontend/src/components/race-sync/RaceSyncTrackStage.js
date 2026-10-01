import { useEffect, useMemo, useState } from 'react';
import { getRaceReplayState, getRaceReplayTrackShape } from '../../api/client';
// Read-only reuse of Race Replay's canonical team-name → palette-key mapper,
// so a team carries the same colour here as it does on the Race Replay dots.
import { teamClassFor } from '../race-replay/raceReplayHelpers';
import monzaAerial from '../../assets/racesync/monza-aerial.png';

// The RaceSync centre stage: the circuit map for whichever race is picked in
// the bar above. Every piece of data here is real and read-only — the trace
// and the leaderboard come from the same endpoints Race Replay serves, and
// this module never modifies Race Replay itself. Cars are spaced by rank
// along the trace because no per-car x/y telemetry exists in the database
// (the same supported convention Race Replay's own viewer falls back to).

// The backend clamps `lap` to the session's own total laps, so overshooting
// asks for the end-of-race state — a stable default until the lap timeline
// control lands.
const FINAL_SNAPSHOT_LAP = 9999;
const FIELD_LEAD_FRACTION = 0.985; // leader sits just before the start/finish line
const FIELD_SPREAD = 0.93; // share of the lap the whole field is spread across

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

  return {
    width,
    height,
    ratio: width / height,
    viewBox: `0 0 ${round1(width)} ${round1(height)}`,
    path: toPath(points),
    pointAt,
    percent,
  };
}

// Rank-based field: the ORDER is the real leaderboard, the spacing along the
// lap is a stand-in (there is no real per-car position data to draw from).
function buildField(leaderboard, geometry) {
  const drivers = Array.isArray(leaderboard) ? leaderboard : [];
  if (!geometry || drivers.length === 0) return [];
  const step = FIELD_SPREAD / Math.max(drivers.length, 1);
  return drivers.map((driver, index) => {
    const spot = geometry.percent(geometry.pointAt(FIELD_LEAD_FRACTION - index * step));
    return {
      entryId: driver.entryId,
      code: driverCode(driver.driverName),
      name: displayName(driver.driverName),
      teamKey: teamClassFor(driver.teamName),
      left: spot.left,
      top: spot.top,
    };
  });
}

function RaceSyncTrackStage({ sessionId, race }) {
  const [shape, setShape] = useState(null);
  const [shapeStatus, setShapeStatus] = useState('loading');
  const [state, setState] = useState(null);
  const [fieldStatus, setFieldStatus] = useState('loading');

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    setShape(null);
    setState(null);
    setShapeStatus('loading');
    setFieldStatus('loading');

    getRaceReplayTrackShape(sessionId)
      .then((payload) => {
        if (cancelled) return;
        setShape(payload);
        setShapeStatus('ready');
      })
      .catch(() => {
        // A 404 just means no real outline exists for this circuit yet.
        if (!cancelled) setShapeStatus('missing');
      });

    getRaceReplayState(sessionId, { lap: FINAL_SNAPSHOT_LAP })
      .then((payload) => {
        if (cancelled) return;
        setState(payload);
        setFieldStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setFieldStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const geometry = useMemo(() => buildGeometry(shape?.points), [shape]);
  const field = useMemo(() => buildField(state?.leaderboard, geometry), [state, geometry]);

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

  const totalLaps = state?.totalLaps ?? null;
  const dateLabel = formatDay(race?.startTime);
  const metaLine = race
    ? [race.circuitName, race.country, dateLabel].filter(Boolean).join(' · ')
    : null;

  return (
    <section className="racesync-stage" aria-label="Circuit map and driver positions">
      <header className="racesync-stage-head">
        <h2 className="racesync-stage-title">{race?.meetingName ?? 'Race replay'}</h2>
        {metaLine && <span className="racesync-stage-meta">{metaLine}</span>}
        {totalLaps != null && (
          <span className="racesync-stage-lap">
            Lap {totalLaps}/{totalLaps}
          </span>
        )}
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
                  <span
                    key={driver.entryId}
                    className={`racesync-stage-car racesync-car-${driver.teamKey}`}
                    style={{ left: driver.left, top: driver.top }}
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

        {field.length > 0 && (
          <ul className="racesync-stage-legend">
            {field.map((driver) => (
              <li key={driver.entryId} className="racesync-stage-legend-item">
                <span
                  className={`racesync-stage-legend-dot racesync-car-${driver.teamKey}`}
                  aria-hidden="true"
                />
                <span className="racesync-stage-legend-code">{driver.code}</span>
                <span className="racesync-stage-legend-name">{driver.name}</span>
              </li>
            ))}
          </ul>
        )}

      </div>

      {fieldStatus === 'missing' && geometry && (
        <p className="racesync-stage-note">Driver positions aren’t available for this session.</p>
      )}
    </section>
  );
}

export default RaceSyncTrackStage;
