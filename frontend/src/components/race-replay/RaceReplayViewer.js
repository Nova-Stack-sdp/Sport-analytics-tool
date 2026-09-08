import { useMemo, useRef, useState } from 'react';
import { useRaceReplaySnapshots } from './useRaceReplaySnapshots';
import {
  teamClassFor,
  isSafetyCarActive,
  progressForRank,
  buildTrackGeometry,
  computeTrackBoundaries,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
  shortestArcDelta,
  stepTowardArc,
  SAFETY_CAR_LEAD_METERS,
} from './raceReplayHelpers';

const VIEWBOX_WIDTH = 400;
const TRACK_HALF_WIDTH = 9; // in SVG units, post-normalization
// Max fraction of the track a dot can advance in one tick. Without this
// cap, a rank swap (two drivers trading positions) makes both dots'
// target slots swap instantly — the CSS transition then interpolates a
// straight screen-space line between old and new slots, which cuts
// across the track's interior instead of following the curve, and reads
// as an abrupt "pause and jump back." Capping the step means a big rank
// change takes a few ticks to resolve, moving forward along the track the
// whole time — visually, a gradual overtake instead of a teleport.
const MAX_ARC_STEP_PER_TICK = 0.02;

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
  // Persists each driver's current (smoothed) arc-length fraction across
  // ticks, keyed by driver number. A plain ref, not state — updating it
  // doesn't need to trigger its own re-render, it just needs to survive
  // between the re-renders that new snapshots already cause.
  const smoothedFractionsRef = useRef(new Map());

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

  const usingRealTrack = Boolean(trackShape?.points);

  // Both the real telemetry case and the illustrative fallback go through
  // the exact same geometry pipeline now — the only difference is which
  // point source feeds in.
  const geometry = useMemo(() => {
    const sourcePoints = usingRealTrack ? trackShape.points : FALLBACK_POINTS;
    return buildTrackGeometry(sourcePoints, VIEWBOX_WIDTH, 30);
  }, [usingRealTrack, trackShape]);

  const boundaries = useMemo(() => {
    if (!geometry) return null;
    return computeTrackBoundaries(geometry.svgPoints, TRACK_HALF_WIDTH);
  }, [geometry]);

  if (atEnd) {
    const leaderboard = snapshot?.leaderboard ?? [];
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

  const leaderboard = snapshot.leaderboard ?? [];
  const scActive = showSafetyCar && isSafetyCarActive(snapshot.recentRaceControl);
  const totalDrivers = leaderboard.length;
  const sharedPhase = (snapshot.videoSeconds % 60) / 60;
  // Match the CSS transition duration to the current tick rate, so a dot
  // never has two moves queued up faster than it can animate between them.
  const transitionSeconds = (1 / speed).toFixed(2);

  // Resolves each driver to an SVG point. Real telemetry position (when
  // available) is used directly — it's a genuine measurement, no need to
  // smooth it. The rank-based estimate is different: its target slot can
  // jump discontinuously when ranks swap, so it's smoothed via a capped
  // per-tick step instead of applied directly — see MAX_ARC_STEP_PER_TICK.
  function svgPositionFor(driver, rank) {
    if (usingRealTrack && Number.isFinite(driver?.x) && Number.isFinite(driver?.y)) {
      const fraction = nearestArcLengthFraction(geometry, driver.x, driver.y);
      return svgPointAtArcLengthFraction(geometry, fraction);
    }

    const targetFraction = progressForRank(rank, totalDrivers, sharedPhase);
    const key = driver?.driverNumber ?? 'safety-car';
    const previousFraction = smoothedFractionsRef.current.get(key) ?? targetFraction;
    const nextFraction = stepTowardArc(previousFraction, targetFraction, MAX_ARC_STEP_PER_TICK);
    smoothedFractionsRef.current.set(key, nextFraction);
    return svgPointAtArcLengthFraction(geometry, nextFraction);
  }

  const finishA = svgPointAtArcLengthFraction(geometry, 0);
  const finishB = svgPointAtArcLengthFraction(geometry, 0.01);
  const finishDx = finishB.x - finishA.x;
  const finishDy = finishB.y - finishA.y;
  const finishLen = Math.hypot(finishDx, finishDy) || 1;
  const finishNx = -finishDy / finishLen;
  const finishNy = finishDx / finishLen;

  let safetyCarPoint = null;
  if (scActive && totalDrivers > 0) {
    const leader = leaderboard[0];
    if (usingRealTrack && Number.isFinite(leader?.x) && Number.isFinite(leader?.y)) {
      const leaderFraction = nearestArcLengthFraction(geometry, leader.x, leader.y);
      const offsetFraction = SAFETY_CAR_LEAD_METERS / geometry.totalLength;
      safetyCarPoint = svgPointAtArcLengthFraction(geometry, leaderFraction + offsetFraction);
    } else {
      const targetFraction = progressForRank(-0.6, totalDrivers, sharedPhase);
      const previousFraction = smoothedFractionsRef.current.get('safety-car') ?? targetFraction;
      const nextFraction = stepTowardArc(previousFraction, targetFraction, MAX_ARC_STEP_PER_TICK);
      smoothedFractionsRef.current.set('safety-car', nextFraction);
      safetyCarPoint = svgPointAtArcLengthFraction(geometry, nextFraction);
    }
  }

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
          {/* Two thin boundary lines (the track's left/right edges) instead of
              one thick centerline stroke — a thick stroke blobs over any
              tight curve regardless of how detailed the underlying points
              are; two thin offset lines preserve detail naturally. */}
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
          {leaderboard.map((driver, rank) => {
            const { x, y } = svgPositionFor(driver, rank);
            return (
              <g
                key={driver.driverNumber}
                style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform ${transitionSeconds}s linear` }}
              >
                <circle r="7" className={`replay-dot replay-dot-${teamClassFor(driver.teamName)}`} />
                <text y="-11" textAnchor="middle" className="replay-dot-label">
                  {driver.driverName ? driver.driverName.slice(0, 3).toUpperCase() : driver.driverNumber}
                </text>
              </g>
            );
          })}
          {safetyCarPoint && (
            <g style={{ transform: `translate(${safetyCarPoint.x}px, ${safetyCarPoint.y}px)`, transition: `transform ${transitionSeconds}s linear` }}>
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