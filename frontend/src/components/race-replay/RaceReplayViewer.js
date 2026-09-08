import { useEffect, useMemo, useRef, useState } from 'react';
import { useRaceReplaySnapshots } from './useRaceReplaySnapshots';
import {
  teamClassFor,
  isSafetyCarActive,
  progressForRank,
  buildTrackGeometry,
  computeTrackBoundaries,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
  interpolateFractionAlongArc,
  SAFETY_CAR_LEAD_METERS,
} from './raceReplayHelpers';

const VIEWBOX_WIDTH = 400;
const TRACK_HALF_WIDTH = 9; // in SVG units, post-normalization
const SAFETY_CAR_KEY = 'safety-car';

// Illustrative centerline used only until real track-shape telemetry
// loads (or if it's ever unavailable for a session with no location
// data). Three deliberate reversal-spikes — a genuine in-then-out or
// out-then-in direction change is what reads as a distinct feature once
// rendered; a wide smooth bulge in one direction just looks like a bigger
// oval, however far it curves out.
const FALLBACK_POINTS = [
  { x: 60, y: 70 }, { x: 180, y: 50 }, { x: 210, y: 20 }, { x: 240, y: 50 },
  { x: 330, y: 60 }, { x: 350, y: 120 }, { x: 320, y: 140 }, { x: 350, y: 160 },
  { x: 330, y: 220 }, { x: 200, y: 235 }, { x: 140, y: 220 }, { x: 110, y: 190 },
  { x: 90, y: 210 }, { x: 60, y: 180 }, { x: 50, y: 130 },
];

function polylinePoints(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function RaceReplayViewer() {
  const [showSafetyCar, setShowSafetyCar] = useState(true);

  // Animation state lives in refs, not React state — none of this should
  // trigger its own re-render, since it's read/written by the animation
  // loop up to 60x/sec, far too much churn to run through React's cycle.
  const animationStateRef = useRef(new Map());
  const dotElementRefs = useRef(new Map());
  const speedRef = useRef(1);

  const {
    snapshot,
    loading,
    error,
    atEnd,
    playing,
    speed,
    togglePlaying,
    cycleSpeed,
    restart,
    jumpToEnd,
    jumpToEndError,
    trackShape,
    trackShapeError,
  } = useRaceReplaySnapshots();

  speedRef.current = speed;

  const usingRealTrack = Boolean(trackShape?.points);

  const geometry = useMemo(() => {
    const sourcePoints = usingRealTrack ? trackShape.points : FALLBACK_POINTS;
    return buildTrackGeometry(sourcePoints, VIEWBOX_WIDTH, 30);
  }, [usingRealTrack, trackShape]);

  const boundaries = useMemo(() => {
    if (!geometry) return null;
    return computeTrackBoundaries(geometry.svgPoints, TRACK_HALF_WIDTH);
  }, [geometry]);

  const leaderboard = snapshot?.leaderboard ?? [];
  const scActive = showSafetyCar && isSafetyCarActive(snapshot?.recentRaceControl);

  // Whenever a new snapshot arrives, set each driver's new TARGET fraction,
  // starting the move from wherever the animation currently, actually is
  // (not the previous target) — so a new tick arriving mid-animation
  // doesn't cause a visible snap.
  useEffect(() => {
    if (!snapshot || !geometry) return;
    const totalDrivers = leaderboard.length;
    const sharedPhase = (snapshot.videoSeconds % 60) / 60;
    const now = performance.now();
    const durationMs = (1 / speedRef.current) * 1000;

    function currentInterpolatedFraction(key, fallback) {
      const state = animationStateRef.current.get(key);
      if (!state) return fallback;
      const t = Math.min(1, (now - state.startTime) / state.durationMs);
      return interpolateFractionAlongArc(state.startFraction, state.endFraction, t);
    }

    function setTarget(key, targetFraction) {
      const startFraction = currentInterpolatedFraction(key, targetFraction);
      animationStateRef.current.set(key, { startFraction, endFraction: targetFraction, startTime: now, durationMs });
    }

    leaderboard.forEach((driver, rank) => {
      const targetFraction = usingRealTrack && Number.isFinite(driver?.x) && Number.isFinite(driver?.y)
        ? nearestArcLengthFraction(geometry, driver.x, driver.y)
        : progressForRank(rank, totalDrivers, sharedPhase);
      setTarget(driver.driverNumber, targetFraction);
    });

    if (scActive && totalDrivers > 0) {
      const leader = leaderboard[0];
      const targetFraction = usingRealTrack && Number.isFinite(leader?.x) && Number.isFinite(leader?.y)
        ? nearestArcLengthFraction(geometry, leader.x, leader.y) + SAFETY_CAR_LEAD_METERS / geometry.totalLength
        : progressForRank(-0.6, totalDrivers, sharedPhase);
      setTarget(SAFETY_CAR_KEY, targetFraction);
    } else {
      animationStateRef.current.delete(SAFETY_CAR_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, geometry, usingRealTrack, scActive]);

  // The single persistent animation loop. Every frame, compute the current
  // arc-length fraction for each dot (interpolated along the FORWARD path
  // between its start and end fractions) and set its transform directly
  // via its DOM ref — never through React state. Computing (x,y) fresh
  // from the curve every frame, rather than letting the browser
  // interpolate between two absolute points, is what keeps every dot
  // exactly on the track at every instant, including mid-animation.
  useEffect(() => {
    if (!geometry) return undefined;
    let rafId;

    function frame() {
      const now = performance.now();
      animationStateRef.current.forEach((state, key) => {
        const t = Math.min(1, (now - state.startTime) / state.durationMs);
        const fraction = interpolateFractionAlongArc(state.startFraction, state.endFraction, t);
        const point = svgPointAtArcLengthFraction(geometry, fraction);
        const el = dotElementRefs.current.get(key);
        if (el) el.style.transform = `translate(${point.x}px, ${point.y}px)`;
      });
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [geometry]);

  if (atEnd) {
    const winner = leaderboard[0];
    return (
      <div className="replay-layout">
        <div className="replay-track-card replay-finished">
          <div className="replay-session-label">
            {snapshot?.session?.meetingName ?? 'Session'} · {snapshot?.session?.sessionName ?? ''} · Finished
          </div>
          <div className="replay-winner">
            {winner ? `🏁 ${winner.driverName} wins` : 'Race finished — no classification data available'}
          </div>
          <button className="btn btn-primary btn-sm" onClick={restart}>⟲ Watch again</button>
        </div>
        {leaderboard.length > 0 && (
          <div className="card replay-leaderboard">
            <div className="card-head"><div className="card-title">Final Classification</div></div>
            <table>
              <tbody>
                <tr><th>Pos</th><th>Driver</th><th>Tyre</th></tr>
                {leaderboard.map((driver, i) => (
                  <tr key={driver.driverNumber}>
                    <td>{i === 0 ? '🏆' : driver.position ?? i + 1}</td>
                    <td>{driver.driverName ?? `#${driver.driverNumber}`}</td>
                    <td>{driver.tyreCompound ? <span className="pill pill-gray">{driver.tyreCompound}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="replay-track-card">
        <div className="pill status-rejected">Couldn't load replay data: {error}</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={restart}>Try again</button>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="replay-track-card">
        <p className="secondary">Loading Barcelona 2026 session data…</p>
      </div>
    );
  }

  if (!snapshot || !geometry || !boundaries) return null;

  const finishA = svgPointAtArcLengthFraction(geometry, 0);
  const finishB = svgPointAtArcLengthFraction(geometry, 0.01);
  const finishDx = finishB.x - finishA.x;
  const finishDy = finishB.y - finishA.y;
  const finishLen = Math.hypot(finishDx, finishDy) || 1;
  const finishNx = -finishDy / finishLen;
  const finishNy = finishDx / finishLen;

  return (
    <div className="replay-layout">
      <div className="replay-track-card">
        <div className="replay-session-label">
          {snapshot.session?.meetingName ?? 'Session'} · {snapshot.session?.sessionName ?? ''} · Lap {snapshot.session?.currentLap ?? '—'} / {snapshot.session?.totalLaps ?? '—'}
          {!usingRealTrack && (
            <span className="replay-track-fallback-note">
              {' '}· illustrative track ({trackShapeError ? 'no location telemetry available for this session' : 'checking for real telemetry…'})
            </span>
          )}
        </div>

        <svg viewBox={`0 0 ${geometry.svgWidth} ${geometry.svgHeight}`} className="replay-track-svg" role="img" aria-label="Track with driver positions">
          <polygon points={polylinePoints(boundaries.outerPoints)} fill="none" stroke="var(--border)" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points={polylinePoints(boundaries.innerPoints)} fill="none" stroke="var(--border)" strokeWidth="2.5" strokeLinejoin="round" />
          <line
            x1={finishA.x - finishNx * TRACK_HALF_WIDTH}
            y1={finishA.y - finishNy * TRACK_HALF_WIDTH}
            x2={finishA.x + finishNx * TRACK_HALF_WIDTH}
            y2={finishA.y + finishNy * TRACK_HALF_WIDTH}
            stroke="#fff"
            strokeWidth="2"
            strokeDasharray="2 2"
          />
          {leaderboard.map((driver) => (
            <g
              key={driver.driverNumber}
              ref={(el) => {
                if (el) dotElementRefs.current.set(driver.driverNumber, el);
                else dotElementRefs.current.delete(driver.driverNumber);
              }}
            >
              <circle r="7" className={`replay-dot replay-dot-${teamClassFor(driver.teamName)}`} />
              <text y="-11" textAnchor="middle" className="replay-dot-label">
                {driver.driverName ? driver.driverName.slice(0, 3).toUpperCase() : driver.driverNumber}
              </text>
            </g>
          ))}
          {scActive && (
            <g
              ref={(el) => {
                if (el) dotElementRefs.current.set(SAFETY_CAR_KEY, el);
                else dotElementRefs.current.delete(SAFETY_CAR_KEY);
              }}
            >
              <circle r="8" className="replay-dot replay-dot-sc" />
              <text y="-12" textAnchor="middle" className="replay-dot-label replay-sc-label">SC</text>
            </g>
          )}
        </svg>

        <div className="replay-controls">
          <button className="btn btn-ghost btn-sm" onClick={restart}>⟲ Restart</button>
          <button className="btn btn-primary btn-sm" onClick={togglePlaying}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={cycleSpeed}>{speed}×</button>
          <button className="btn btn-ghost btn-sm" onClick={jumpToEnd}>⏭ Skip to end</button>
          <label className="replay-sc-toggle">
            <input type="checkbox" checked={showSafetyCar} onChange={(e) => setShowSafetyCar(e.target.checked)} />
            Show safety car
          </label>
        </div>
        {scActive && <div className="pill pill-amber" style={{ marginTop: 10 }}>Safety car deployed</div>}
        {jumpToEndError && <div className="pill status-rejected" style={{ marginTop: 10 }}>{jumpToEndError}</div>}
      </div>

      <div className="card replay-leaderboard">
        <div className="card-head"><div className="card-title">Order</div></div>
        <table>
          <tbody>
            <tr><th>Pos</th><th>Driver</th><th>Tyre</th></tr>
            {leaderboard.map((driver, i) => (
              <tr key={driver.driverNumber}>
                <td>{driver.position ?? i + 1}</td>
                <td>{driver.driverName ?? `#${driver.driverNumber}`}</td>
                <td>{driver.tyreCompound ? <span className="pill pill-gray">{driver.tyreCompound}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RaceReplayViewer;