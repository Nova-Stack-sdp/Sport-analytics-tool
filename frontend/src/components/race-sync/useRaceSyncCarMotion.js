import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
// Read-only reuse of Race Replay's own pacing maths, exactly as its viewer
// uses it: the same rank-to-arc-length slot, the same bounded correction and
// the same forward-only motion, so a car here travels the circuit the way a
// dot does on the Race Replay page.
import {
  progressForRank,
  shortestArcDelta,
  speedMultiplierForCorrection,
} from '../race-replay/raceReplayHelpers';
import { BASE_TICK_MS } from '../race-replay/useRaceReplaySnapshots';

// Mirrors RaceReplayViewer's own tuning (see the comments there for how these
// numbers were arrived at): a car covers one lap per tick, nudged by at most
// ±15% so a car that has just changed rank closes the gap over a few ticks
// instead of teleporting across the map in one.
const BASE_LAP_INCREMENT = 1;
const CORRECTION_GAIN = 6;
const MIN_SPEED_MULTIPLIER = 0.85;
const MAX_SPEED_MULTIPLIER = 1.15;
// Race Replay's viewer drifts the whole field forward a sixtieth of a lap per
// lap, so the pack doesn't sit on the same stretch of tarmac all race.
const PHASE_LAP_WINDOW = 60;

const wrap = (fraction) => ((fraction % 1) + 1) % 1;

// Where a car currently is, in UNWRAPPED lap fractions — deliberately not
// wrapped to [0, 1), because a move's start and end are two points on the same
// continuously-advancing timeline and only the final lookup wraps. `fallback`
// answers for a car that has no move yet (it simply starts on its slot).
function positionOf(move, now, fallback) {
  if (!move) return fallback;
  const t = move.durationMs > 0 ? Math.min(1, (now - move.startedAt) / move.durationMs) : 1;
  return move.from + (move.to - move.from) * t;
}

/**
 * Moves the map's car markers around the circuit while a replay plays.
 *
 * Each car carries an unwrapped arc-length position (in laps) and one move at a
 * time. On every new tick that position advances about one lap — always
 * forward, sped up or slowed down a little to close the gap to the slot its
 * rank calls for — and a single requestAnimationFrame loop turns the
 * interpolated fraction into a point on the trace on every frame. Positions
 * are written straight to the DOM through refs rather than through React
 * state, which is what keeps a 60fps glide out of the render path.
 *
 * The resting cases are deliberate: a parked or paused car holds the exact
 * pose it was frozen in (pausing must not teleport the field); a car whose lap
 * has just moved under it is re-seated on that lap's slot — that is what makes
 * a lap step land, and a rank swap on a step land as a swap; and a car coming
 * back onto the map after being scoped out starts from its slot rather than an
 * old pose.
 *
 * Each car carries its own `rank` in the race and the caller passes the size of
 * the full grid, so a map scoped down to a few cars leaves the hidden cars'
 * slots empty instead of respacing the ones still on it — otherwise removing
 * one car would shift every other car's slot and send them all shuffling.
 *
 * Returns the ref callback the markers should be attached with, keyed by
 * entryId.
 */
export function useRaceSyncCarMotion({ geometry, field, totalDrivers, lap, playing, speed }) {
  const nodesRef = useRef(new Map()); // entryId -> marker element
  const movesRef = useRef(new Map()); // entryId -> { from, to, startedAt, durationMs }
  // One callback per entryId, so re-rendering the field doesn't detach and
  // re-attach every marker on every snapshot.
  const callbacksRef = useRef(new Map());
  const geometryRef = useRef(null);
  const lastLapRef = useRef(null);

  const registerCar = useCallback((entryId) => {
    const cached = callbacksRef.current.get(entryId);
    if (cached) return cached;
    const callback = (element) => {
      if (element) nodesRef.current.set(entryId, element);
      else nodesRef.current.delete(entryId);
    };
    callbacksRef.current.set(entryId, callback);
    return callback;
  }, []);

  // One pass over every car, straight to the DOM. A parked map rewrites the
  // same two values frame after frame, so comparing before writing keeps it
  // from touching the DOM at all until something actually moves.
  const paint = useCallback((now) => {
    const geo = geometryRef.current;
    if (!geo) return;
    movesRef.current.forEach((move, entryId) => {
      const element = nodesRef.current.get(entryId);
      if (!element) return;
      const point = geo.percent(geo.pointAt(wrap(positionOf(move, now, 0))));
      if (element.style.left !== point.left) element.style.left = point.left;
      if (element.style.top !== point.top) element.style.top = point.top;
    });
  }, []);

  // A new lap, a new field or a change of play state all re-aim the cars. This
  // runs before paint so the map never shows a frame of stale positions.
  useLayoutEffect(() => {
    if (!geometry) return;
    geometryRef.current = geometry;

    const now = performance.now();
    const stepped = lastLapRef.current !== lap;
    lastLapRef.current = lap;
    const durationMs = BASE_TICK_MS / speed;
    const phase = (lap % PHASE_LAP_WINDOW) / PHASE_LAP_WINDOW;
    // The whole race's field size, not the size of the scoped list — a slot on
    // the trace is a position in the race.
    const gridSize = totalDrivers ?? field.length;
    const onMap = new Set();

    field.forEach((car, index) => {
      const { entryId } = car;
      // The car's rank in the race; the place in `field` stands in for a
      // caller that hands over no ranks at all.
      const rank = Number.isFinite(car.rank) ? car.rank : index;
      onMap.add(entryId);
      const ideal = progressForRank(rank, gridSize, phase);
      const current = positionOf(movesRef.current.get(entryId), now, ideal);

      if (playing) {
        const multiplier = speedMultiplierForCorrection(
          shortestArcDelta(wrap(current), ideal),
          CORRECTION_GAIN,
          MIN_SPEED_MULTIPLIER,
          MAX_SPEED_MULTIPLIER
        );
        const target = current + BASE_LAP_INCREMENT * multiplier;
        movesRef.current.set(entryId, { from: current, to: target, startedAt: now, durationMs });
        return;
      }

      // Parked, paused or stepped: the lap having moved under a car is what a
      // step lands; otherwise it stays exactly where it was frozen.
      const seated = stepped ? current + shortestArcDelta(wrap(current), ideal) : current;
      movesRef.current.set(entryId, { from: seated, to: seated, startedAt: now, durationMs: 0 });
    });

    // A car taken off the map by the scope forgets its pose, so one that comes
    // back appears on the lap on screen rather than wherever it left off.
    movesRef.current.forEach((_, entryId) => {
      if (!onMap.has(entryId)) movesRef.current.delete(entryId);
    });

    paint(now);
  }, [geometry, field, totalDrivers, lap, playing, speed, paint]);

  useEffect(() => {
    if (!geometry) return undefined;
    geometryRef.current = geometry;
    let rafId;
    function frame() {
      paint(performance.now());
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [geometry, paint]);

  return registerCar;
}
