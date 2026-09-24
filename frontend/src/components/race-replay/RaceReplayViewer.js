import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRaceReplaySnapshots, BASE_TICK_MS } from './useRaceReplaySnapshots';
import {
  teamClassFor,
  isSafetyCarActive,
  progressForRank,
  buildTrackGeometry,
  computeTrackBoundaries,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
  shortestArcDelta,
  speedMultiplierForCorrection,
  SAFETY_CAR_LEAD_METERS,
} from './raceReplayHelpers';

const VIEWBOX_WIDTH = 400;
const TRACK_HALF_WIDTH = 9; // in SVG units, post-normalization
const SAFETY_CAR_KEY = 'safety-car';
// One full lap of the drawn circuit per snapshot tick — because in Race
// Replay (unlike Watch Live, where this constant started out as 1/60 for a
// per-SECOND videoSeconds clock), each tick genuinely IS one real lap of
// race data (see useRaceReplaySnapshots — the replay clock is lap number,
// advancing by 1 every tick). Leaving this at 1/60 meant the dot only
// covered 1/60th of the track per real lap elapsed, so the "Lap X / Y"
// counter (driven straight off the real data) would reach the end of a
// 40-70 lap race long before the dot had gone around even once — exactly
// the "one lap is no longer one lap" desync. sharedPhase's own `% 60`
// window below is unrelated to this and doesn't need to match: it only
// spaces the rank-based fallback target around the track, not the base pace.
const BASE_LAP_INCREMENT = 1;
// How strongly a positional discrepancy affects pace. Tuned so a typical
// single-rank gap (~0.0275 for 20 drivers) produces a modest ~15-20%
// speed change, not a dramatic one.
const CORRECTION_GAIN = 6;
// These clamps are what actually bound the worst case (a multi-rank swap
// in one tick, not just a typical single-rank gap) — and until now they
// didn't match the "modest, not dramatic" intent described above at all.
// At the old BASE_LAP_INCREMENT (1/60), a 0.6-1.6x swing was a fraction of
// a fraction of a lap, so the mismatch was invisible. Now that
// BASE_LAP_INCREMENT is 1 (a full lap per tick, needed so the drawn dot
// matches the real per-lap data clock), that same 0.6-1.6x range meant a
// car could cover anywhere from 0.6 to 1.6 laps in a single tick — cars
// rocketing all the way around the track past the entire field, or
// crawling barely forward, depending on how their rank happened to shift
// that tick. Tightened to actually match the "~15-20%" the gain above was
// tuned for.
const MIN_SPEED_MULTIPLIER = 0.85;
const MAX_SPEED_MULTIPLIER = 1.15;

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

function RaceReplayViewer({ sessionId }) {
  const [showSafetyCar, setShowSafetyCar] = useState(true);

  // Animation state lives in refs, not React state — none of this should
  // trigger its own re-render, since it's read/written by the animation
  // loop up to 60x/sec, far too much churn to run through React's cycle.
  const animationStateRef = useRef(new Map());
  const dotElementRefs = useRef(new Map());
  const speedRef = useRef(1);
  // Each driver's total accumulated distance around the track, in laps —
  // grows indefinitely, never wraps or resets. This is what guarantees
  // forward-only, realistically-paced motion: instead of computing a
  // fixed rank-based target position to jump/animate toward each tick
  // (which can require nearly a full lap of "catch-up" in one tick when
  // a driver loses rank), each driver's distance increases by a bounded,
  // modestly-adjusted pace every tick, and rank-correctness emerges
  // gradually over several ticks as faster/slower paces compound.
  const cumulativeDistanceRef = useRef(new Map());

  // Order table row animation state — separate from the track-dot animation
  // above, and much simpler: the table has no in-between-ticks data to
  // interpolate (the real leaderboard order only changes once per lap-tick),
  // so instead of animating a continuous position, this does a one-shot
  // FLIP (First-Last-Invert-Play) slide whenever a row's real screen
  // position moves between renders, plus a brief highlight on any row whose
  // actual position value changed. Makes each genuine update read as a
  // responsive transition instead of an abrupt table-data snap, without
  // inventing any position the backend didn't report.
  const orderRowRefs = useRef(new Map());
  const prevRowTopsRef = useRef(new Map());
  const prevPositionsRef = useRef(new Map());

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
    trackShape,
    trackShapeError,
  } = useRaceReplaySnapshots(sessionId);

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

  // Runs after the Order table's DOM has updated to a new snapshot but
  // before the browser paints — the standard FLIP timing. For every row
  // still on screen, compares its new position to where it was last time:
  // if it moved, snaps it back to the old spot with no transition, forces
  // a reflow so that's actually registered, then removes the transform
  // with a transition enabled — the browser animates the row sliding from
  // old to new. Also flashes any row whose real `position` value changed,
  // so a genuine update (even one that didn't move screen position, e.g.
  // gaining/losing time without a rank change) still reads as live.
  useLayoutEffect(() => {
    const rowEls = orderRowRefs.current;
    const prevTops = prevRowTopsRef.current;
    const prevPositions = prevPositionsRef.current;

    rowEls.forEach((el, key) => {
      if (!el) return;
      const newTop = el.getBoundingClientRect().top;
      const oldTop = prevTops.get(key);
      if (oldTop != null && oldTop !== newTop) {
        const delta = oldTop - newTop;
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px)`;
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight; // force reflow so the transform above actually takes effect before it's animated away
        el.style.transition = '';
        el.style.transform = '';
      }
      prevTops.set(key, newTop);
    });

    leaderboard.forEach((driver, i) => {
      const displayedPosition = driver.position ?? i + 1;
      const prevPosition = prevPositions.get(driver.driverNumber);
      const el = rowEls.get(driver.driverNumber);
      if (el && prevPosition != null && prevPosition !== displayedPosition) {
        el.classList.remove('row-flash');
        // eslint-disable-next-line no-unused-expressions
        el.offsetWidth; // restart the flash animation even if it's already mid-flash from a very recent change
        el.classList.add('row-flash');
      }
      prevPositions.set(driver.driverNumber, displayedPosition);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Whenever a new snapshot arrives, advance each driver's accumulated
  // distance by one tick's worth of pace (bounded, always positive — see
  // BASE_LAP_INCREMENT/speedMultiplierForCorrection above), then hand the
  // resulting fraction to the animation state as the end of a fresh move,
  // starting from wherever the animation currently, actually is (not the
  // previous target) — so a new tick arriving mid-animation doesn't cause
  // a visible snap.
  useEffect(() => {
    if (!snapshot || !geometry) return;
    const totalDrivers = leaderboard.length;
    // Replay's clock is lap number now (see useRaceReplaySnapshots), not
    // seconds into a broadcast — same modulo trick, just against laps
    // instead of videoSeconds, to keep the paced-animation phase varying
    // tick to tick rather than resetting identically every lap.
    const sharedPhase = (snapshot.lap % 60) / 60;
    const now = performance.now();
    // Must match how often a new tick (and therefore a new target) actually
    // arrives — see useRaceReplaySnapshots's own tick interval, which this
    // is derived from directly rather than re-guessed here. Previously this
    // assumed a 1000ms/speed tick while the real one was 2000ms/speed, so
    // every dot's move finished at the halfway point and then sat frozen
    // until the next tick — a periodic "stop" on every lap.
    const durationMs = (BASE_TICK_MS / speedRef.current);

    // Raw (UNWRAPPED) linear interpolation — deliberately not
    // interpolateFractionAlongArc's forward-arc-distance logic. That logic
    // is only correct when start/end are two independently-wrapped [0,1)
    // fractions with no other relationship — appropriate for a real
    // telemetry point given fresh each tick, wrong here. The paced path
    // below tracks a continuously-increasing raw distance
    // (cumulativeDistanceRef); start and end here are always two points on
    // that SAME monotonic timeline, so a plain lerp is already exactly
    // correct and always moves forward, by construction. Using
    // forward-arc-distance on the WRAPPED (% 1) version of these two points
    // was the actual "rush through the entire track" bug: since each tick's
    // raw step is close to exactly 1 lap, the wrapped end fraction lands
    // only slightly ahead OR slightly behind the wrapped start fraction
    // depending on that tick's pace correction — and whenever it landed
    // slightly behind (multiplier < 1, i.e. whenever a driver needed to
    // lose a little ground — exactly "falling behind another"),
    // forward-only arc interpolation had no way to express "go slightly
    // backward", so it took the entire long way around instead (~0.85 laps
    // in one tick) to reach a point that should have been a small step
    // back. That's "rushes through the entire track before landing behind
    // their opponent", and why it only happened on some ticks, not others.
    function currentInterpolatedRaw(key, fallback) {
      const state = animationStateRef.current.get(key);
      if (!state) return fallback;
      const t = Math.min(1, (now - state.startTime) / state.durationMs);
      return state.startFraction + (state.endFraction - state.startFraction) * t;
    }

    function setTarget(key, targetRaw) {
      const startFraction = currentInterpolatedRaw(key, targetRaw);
      animationStateRef.current.set(key, { startFraction, endFraction: targetRaw, startTime: now, durationMs });
    }

    // Advances this driver's accumulated distance by one bounded, paced
    // step toward their rank-implied ideal position, and returns the raw
    // (unwrapped) resulting distance — NOT wrapped to [0,1). Wrapping here
    // is exactly what produced the bug described above; wrapping only
    // happens once, in frame() below, purely for the SVG point lookup.
    function advancePacedFraction(key, idealFraction) {
      const prevCumulative = cumulativeDistanceRef.current.get(key) ?? idealFraction;
      const prevFraction = ((prevCumulative % 1) + 1) % 1;
      const signedDelta = shortestArcDelta(prevFraction, idealFraction);
      const speedMultiplier = speedMultiplierForCorrection(signedDelta, CORRECTION_GAIN, MIN_SPEED_MULTIPLIER, MAX_SPEED_MULTIPLIER);
      const nextCumulative = prevCumulative + BASE_LAP_INCREMENT * speedMultiplier;
      cumulativeDistanceRef.current.set(key, nextCumulative);
      return nextCumulative;
    }

    // For the real-telemetry branch (unreachable today — Race Replay's
    // leaderboard x/y is always null, see computeStateAtLap on the backend
    // — but kept correct in case that ever changes): a fresh absolute
    // measured position each tick has no "raw timeline" of its own, so
    // unwrap it relative to wherever this dot's raw position currently is,
    // by the SHORTEST signed delta — the opposite choice from the paced
    // path above, and correctly so: an absolute truth position should snap
    // to its nearest continuation, not detour around for "always forward".
    function unwrapNearest(key, wrappedTarget) {
      const prevRaw = currentInterpolatedRaw(key, wrappedTarget);
      const prevWrapped = ((prevRaw % 1) + 1) % 1;
      return prevRaw + shortestArcDelta(prevWrapped, wrappedTarget);
    }

    leaderboard.forEach((driver, rank) => {
      let targetRaw;
      if (usingRealTrack && Number.isFinite(driver?.x) && Number.isFinite(driver?.y)) {
        // Real measured position — apply directly, no pacing needed.
        targetRaw = unwrapNearest(driver.driverNumber, nearestArcLengthFraction(geometry, driver.x, driver.y));
      } else {
        const idealFraction = progressForRank(rank, totalDrivers, sharedPhase);
        targetRaw = advancePacedFraction(driver.driverNumber, idealFraction);
      }
      setTarget(driver.driverNumber, targetRaw);
    });

    if (scActive && totalDrivers > 0) {
      const leader = leaderboard[0];
      let targetRaw;
      if (usingRealTrack && Number.isFinite(leader?.x) && Number.isFinite(leader?.y)) {
        const wrapped = nearestArcLengthFraction(geometry, leader.x, leader.y) + SAFETY_CAR_LEAD_METERS / geometry.totalLength;
        targetRaw = unwrapNearest(SAFETY_CAR_KEY, wrapped);
      } else {
        const idealFraction = progressForRank(-0.6, totalDrivers, sharedPhase);
        targetRaw = advancePacedFraction(SAFETY_CAR_KEY, idealFraction);
      }
      setTarget(SAFETY_CAR_KEY, targetRaw);
    } else {
      animationStateRef.current.delete(SAFETY_CAR_KEY);
      cumulativeDistanceRef.current.delete(SAFETY_CAR_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, geometry, usingRealTrack, scActive]);

  // Freezes every dot in place the instant Pause is pressed. Without this,
  // pausing only stopped FUTURE ticks — whatever glide was already
  // in-flight (up to a full tick's duration, e.g. 2s at 1x) kept animating
  // to its already-set target, so Pause visibly took up to that long to
  // actually land. Collapsing start/end to the current interpolated point
  // makes every subsequent frame render the same, frozen position.
  useEffect(() => {
    if (playing) return;
    const now = performance.now();
    animationStateRef.current.forEach((state, key) => {
      const t = state.durationMs > 0 ? Math.min(1, (now - state.startTime) / state.durationMs) : 1;
      // Raw linear interpolation, matching the target-setting effect above
      // — see its comment for why this must not be forward-arc-distance
      // based. Freezing at a raw (unwrapped) value is fine either way,
      // since a held-still point doesn't care whether it's expressed as
      // e.g. 5.92 laps or wrapped to 0.92 — frame() below wraps it once,
      // right before turning it into an SVG point.
      const frozenFraction = state.startFraction + (state.endFraction - state.startFraction) * t;
      animationStateRef.current.set(key, {
        startFraction: frozenFraction,
        endFraction: frozenFraction,
        startTime: now,
        durationMs: 1,
      });
    });
  }, [playing]);

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
        // Guards durationMs === 0 (e.g. a just-frozen pause state) from
        // producing a divide-by-zero (Infinity/NaN) t.
        const t = state.durationMs > 0 ? Math.min(1, (now - state.startTime) / state.durationMs) : 1;
        // Raw linear interpolation between two points on the same
        // continuously-increasing timeline (see the target-setting effect's
        // comment above for why forward-arc-distance interpolation was
        // wrong here) — % 1 is applied only right here, once, purely to
        // turn the position into a lookup into the track's [0,1) arc length.
        const rawFraction = state.startFraction + (state.endFraction - state.startFraction) * t;
        const fraction = ((rawFraction % 1) + 1) % 1;
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
        <div className="card replay-track-card replay-finished">
          <div className="card-head">
            <div>
              <div className="card-title leaderboard-title">Track</div>
              <div className="card-title-sub">
                {snapshot?.session?.meetingName ?? 'Session'} · {snapshot?.session?.sessionName ?? ''}
              </div>
            </div>
            <span className="pill pill-gray">Finished</span>
          </div>
          <div className="replay-winner">
            {winner ? `🏁 ${winner.driverName} wins` : 'Race finished — no classification data available'}
          </div>
          <button className="btn btn-primary btn-sm" onClick={restart}>⟲ Watch again</button>
        </div>
        {leaderboard.length > 0 && (
          <div className="card replay-leaderboard">
            <div className="card-head">
              <div>
                <div className="card-title leaderboard-title">Final Classification</div>
                <div className="card-title-sub">Race result, in order</div>
              </div>
            </div>
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
      <div className="card replay-track-card">
        <div className="pill status-rejected">Couldn't load replay data: {error}</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={restart}>Try again</button>
      </div>
    );
  }

  if (loading && !snapshot) {
    return (
      <div className="card replay-track-card">
        <p className="secondary">Loading session data…</p>
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
      <div className="card replay-track-card">
        <div className="card-head">
          <div>
            <div className="card-title leaderboard-title">Track</div>
            <div className="card-title-sub">
              {snapshot.session?.meetingName ?? 'Session'} · {snapshot.session?.sessionName ?? ''}
            </div>
          </div>
          <span className="pill pill-gray">Lap {snapshot.session?.currentLap ?? '—'} / {snapshot.session?.totalLaps ?? '—'}</span>
        </div>
        {!usingRealTrack && (
          <div className="replay-track-fallback-note">
            Illustrative track ({trackShapeError ? 'no location telemetry available for this session' : 'checking for real telemetry…'})
          </div>
        )}

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
      </div>

      <div className="card replay-leaderboard">
        <div className="card-head">
          <div>
            <div className="card-title leaderboard-title">Order</div>
            <div className="card-title-sub">Live race order and tyre compounds</div>
          </div>
          <span className="pill pill-gray">Lap {snapshot.session?.currentLap ?? '—'}</span>
        </div>
        <table>
          <tbody>
            <tr><th>Pos</th><th>Driver</th><th>Tyre</th></tr>
            {leaderboard.map((driver, i) => (
              <tr
                key={driver.driverNumber}
                ref={(el) => {
                  if (el) orderRowRefs.current.set(driver.driverNumber, el);
                  else orderRowRefs.current.delete(driver.driverNumber);
                }}
              >
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