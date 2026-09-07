import { useRef, useState, useEffect } from 'react';
import { useRaceReplaySnapshots } from './useRaceReplaySnapshots';
import { teamClassFor, isSafetyCarActive, progressForRank } from './raceReplayHelpers';

function pointAtProgress(pathEl, progress) {
  if (!pathEl || typeof pathEl.getTotalLength !== 'function') return { x: 0, y: 0 };
  const length = pathEl.getTotalLength();
  return pathEl.getPointAtLength(((progress % 1) + 1) % 1 * length);
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
  } = useRaceReplaySnapshots();

  // The <path> ref isn't attached until after the first paint.
  useEffect(() => {
    forceRender((n) => n + 1);
  }, []);

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

  return (
    <div className="replay-layout">
      <div className="replay-track-card">
        <div className="replay-session-label">
          {snapshot.session?.meetingName ?? 'Session'} · {snapshot.session?.sessionName ?? ''} · Lap {snapshot.session?.currentLap ?? '—'} / {snapshot.session?.totalLaps ?? '—'}
        </div>

        <svg viewBox="0 0 400 260" className="replay-track-svg" role="img" aria-label="Simplified track with driver positions">
          <path
            ref={pathRef}
            d="M 60 40 L 280 30 L 350 70 L 350 150 L 300 200 L 230 165 L 200 210 L 140 220 L 90 190 L 100 140 L 60 110 Z"
            fill="none"
            stroke="var(--border)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {leaderboard.map((driver, rank) => {
            const { x, y } = pointAtProgress(pathRef.current, progressForRank(rank, totalDrivers, sharedPhase));
            return (
              <g key={driver.driverNumber} transform={`translate(${x}, ${y})`}>
                <circle r="7" className={`replay-dot replay-dot-${teamClassFor(driver.teamName)}`} />
                <text y="-11" textAnchor="middle" className="replay-dot-label">
                  {driver.driverName ? driver.driverName.slice(0, 3).toUpperCase() : driver.driverNumber}
                </text>
              </g>
            );
          })}
          {scActive && totalDrivers > 0 && (() => {
            const { x, y } = pointAtProgress(pathRef.current, progressForRank(-0.6, totalDrivers, sharedPhase));
            return (
              <g transform={`translate(${x}, ${y})`}>
                <circle r="8" className="replay-dot replay-dot-sc" />
                <text y="-12" textAnchor="middle" className="replay-dot-label replay-sc-label">SC</text>
              </g>
            );
          })()}
        </svg>

        <div className="replay-controls">
          <button className="btn btn-ghost btn-sm" onClick={restart}>⟲ Restart</button>
          <button className="btn btn-primary btn-sm" onClick={togglePlaying} disabled={atEnd}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={cycleSpeed}>{speed}×</button>
          <label className="replay-sc-toggle">
            <input type="checkbox" checked={showSafetyCar} onChange={(e) => setShowSafetyCar(e.target.checked)} />
            Show safety car
          </label>
        </div>
        {atEnd && <div className="pill pill-gray" style={{ marginTop: 10 }}>Replay finished — Restart to watch again</div>}
        {scActive && <div className="pill pill-amber" style={{ marginTop: 10 }}>Safety car deployed</div>}
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