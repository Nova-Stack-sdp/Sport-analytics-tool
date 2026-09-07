import { useMemo, useRef, useState, useEffect } from 'react';
import { useRaceReplaySnapshots } from './useRaceReplaySnapshots';
import {
  teamClassFor,
  isSafetyCarActive,
  progressForRank,
  buildTrackGeometry,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
  SAFETY_CAR_LEAD_METERS,
} from './raceReplayHelpers';

const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 260;

// Fallback path used only until the real track shape loads (or if it's
// ever unavailable for a session with no location telemetry).
const FALLBACK_PATH_D = 'M 100 230 L 300 230 L 330 190 L 300 150 L 335 110 L 300 80 L 330 50 L 275 25 L 225 45 L 175 20 L 130 60 L 85 95 L 60 135 L 65 180 L 95 210 Z';

function pointAtProgress(pathEl, progress) {
  if (!pathEl || typeof pathEl.getTotalLength !== 'function') return { x: 0, y: 0 };
  const length = pathEl.getTotalLength();
  return pathEl.getPointAtLength(((progress % 1) + 1) % 1 * length);
}

function tangentAtProgress(pathEl, progress) {
  const a = pointAtProgress(pathEl, progress);
  const b = pointAtProgress(pathEl, progress + 0.01);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { point: a, nx: -dy / len, ny: dx / len };
}

function RaceReplayViewer() {
  const pathRef = useRef(null);
  const [, forceRender] = useState(0);
  const [showSafetyCar, setShowSafetyCar] = useState(true);

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

  // The <path> ref isn't attached until after the first paint — only
  // matters for the fallback-path case, which reads pathRef via the DOM.
  useEffect(() => {
    forceRender((n) => n + 1);
  }, []);

  // Real geometry from actual telemetry, once /track-shape resolves.
  const geometry = useMemo(() => {
    if (!trackShape?.points) return null;
    return buildTrackGeometry(trackShape.points, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, 30);
  }, [trackShape]);

  const usingRealTrack = Boolean(geometry);

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

  if (!snapshot) return null;

  const leaderboard = snapshot.leaderboard ?? [];
  const scActive = showSafetyCar && isSafetyCarActive(snapshot.recentRaceControl);
  const totalDrivers = leaderboard.length;
  const sharedPhase = (snapshot.videoSeconds % 60) / 60;
  // Match the CSS transition duration to the current tick rate, so a dot
  // never has two moves queued up faster than it can animate between them.
  const transitionSeconds = (1 / speed).toFixed(2);

  // Resolves each driver to an SVG point: real telemetry position when
  // available, falling back to the rank-based estimate otherwise (either
  // because the real track shape hasn't loaded, or this specific driver
  // has no location record yet at this tick).
  function svgPositionFor(driver, rank) {
    if (usingRealTrack) {
      if (Number.isFinite(driver?.x) && Number.isFinite(driver?.y)) {
        const fraction = nearestArcLengthFraction(geometry, driver.x, driver.y);
        return svgPointAtArcLengthFraction(geometry, fraction);
      }
      // No real position yet for this driver — still place them on the
      // real track outline, just at an estimated fraction around it.
      return svgPointAtArcLengthFraction(geometry, progressForRank(rank, totalDrivers, sharedPhase));
    }
    return pointAtProgress(pathRef.current, progressForRank(rank, totalDrivers, sharedPhase));
  }

  const finishLine = usingRealTrack
    ? (() => {
        const a = svgPointAtArcLengthFraction(geometry, 0);
        const b = svgPointAtArcLengthFraction(geometry, 0.01);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { point: a, nx: -dy / len, ny: dx / len };
      })()
    : tangentAtProgress(pathRef.current, 0);

  let safetyCarPoint = null;
  if (scActive && totalDrivers > 0) {
    const leader = leaderboard[0];
    if (usingRealTrack && Number.isFinite(leader?.x) && Number.isFinite(leader?.y)) {
      const leaderFraction = nearestArcLengthFraction(geometry, leader.x, leader.y);
      const offsetFraction = SAFETY_CAR_LEAD_METERS / geometry.totalLength;
      safetyCarPoint = svgPointAtArcLengthFraction(geometry, leaderFraction + offsetFraction);
    } else {
      safetyCarPoint = svgPositionFor(null, -0.6);
    }
  }

  return (
    <div className="replay-layout">
      <div className="replay-track-card">
        <div className="replay-session-label">
          {snapshot.session?.meetingName ?? 'Session'} · {snapshot.session?.sessionName ?? ''} · Lap {snapshot.session?.currentLap ?? '—'} / {snapshot.session?.totalLaps ?? '—'}
          {!usingRealTrack && (
            <span className="replay-track-fallback-note">
              {' '}· illustrative track ({trackShapeError ? 'real shape unavailable' : 'loading real shape…'})
            </span>
          )}
        </div>

        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="replay-track-svg" role="img" aria-label="Track with driver positions">
          <path
            ref={pathRef}
            d={usingRealTrack ? geometry.pathD : FALLBACK_PATH_D}
            fill="none"
            stroke="var(--border)"
            strokeWidth={usingRealTrack ? 10 : 14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1={finishLine.point.x - finishLine.nx * 9}
            y1={finishLine.point.y - finishLine.ny * 9}
            x2={finishLine.point.x + finishLine.nx * 9}
            y2={finishLine.point.y + finishLine.ny * 9}
            stroke="#fff"
            strokeWidth="3"
            strokeDasharray="2.5 2.5"
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