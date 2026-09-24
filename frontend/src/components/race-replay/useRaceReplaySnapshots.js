import { useCallback, useEffect, useRef, useState } from 'react';
import { getRaceReplayState, getRaceReplayTrackShape } from '../../api/client';

const SPEEDS = [0.5, 1, 2, 4, 16, 60];
// The replay clock is LAP NUMBER, not seconds into a broadcast (see
// raceReplay.js on the backend for why — several event types only carry a
// lap range, not a real timestamp). One lap advances every BASE_TICK_MS /
// speed real ms; at 1x that's a lap every 2 seconds, fast enough to watch
// a full race in a couple of minutes.
// Exported so RaceReplayViewer's dot-animation duration can be derived
// from this exact value instead of guessing it independently — the two
// were out of sync before (viewer assumed a 1000ms tick, this is 2000ms),
// which made every dot finish its move and sit frozen for the second half
// of each tick before the next one arrived.
// 10000ms/lap so a typical ~60-lap race takes about 10 minutes at 1x.
// History: started at 2000ms (leftover from before the dot's pace matched
// one real lap per tick); once that was fixed, even 2000ms read as
// unwatchably fast, so this moved to 5000ms (~5 min/race) — still too fast
// per direct feedback, so now 10000ms (~10 min/race).
export const BASE_TICK_MS = 10000;

export function useRaceReplaySnapshots(sessionId) {
  const [lap, setLap] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [atEnd, setAtEnd] = useState(false);

  const [trackShape, setTrackShape] = useState(null);
  const [trackShapeError, setTrackShapeError] = useState(null);

  const cacheRef = useRef(new Map());
  // The lap most recently requested by loadLap, as of the moment its fetch
  // was fired off. Requests can resolve out of order (a slow response for
  // an earlier lap arriving after a faster response for a later one — easy
  // to trigger just by playing at a higher speed, where ticks fire faster
  // than a round trip reliably completes), and without this guard the
  // stale, earlier response would overwrite the snapshot that's already on
  // screen, snapping the whole leaderboard (and every dot) backward to an
  // older lap before the real current one reasserts itself next tick — the
  // "dots stop, disappear, reappear" glitching.
  const latestRequestedLapRef = useRef(null);

  // A different fixture was picked — every piece of per-session state
  // starts over, including the per-lap snapshot cache (a lap 5 snapshot
  // from the previous session is meaningless for this one).
  useEffect(() => {
    cacheRef.current = new Map();
    latestRequestedLapRef.current = null;
    setLap(0);
    setSnapshot(null);
    setLoading(true);
    setError(null);
    setAtEnd(false);
    setPlaying(true);
    setTrackShape(null);
    setTrackShapeError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    getRaceReplayTrackShape(sessionId)
      .then((shape) => { if (!cancelled) setTrackShape(shape); })
      .catch((err) => { if (!cancelled) setTrackShapeError(err.message); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const loadLap = useCallback(async (lapNumber) => {
    if (!sessionId) return;
    latestRequestedLapRef.current = lapNumber;
    const cache = cacheRef.current;
    if (cache.has(lapNumber)) {
      const cached = cache.get(lapNumber);
      setSnapshot(cached);
      setAtEnd(Boolean(cached.atEnd));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const state = await getRaceReplayState(sessionId, { lap: lapNumber });
      cache.set(lapNumber, state);
      // A newer lap has been requested since this fetch went out — this
      // response is stale, drop it instead of snapping the UI backward.
      if (latestRequestedLapRef.current !== lapNumber) return;
      setSnapshot(state);
      setAtEnd(Boolean(state.atEnd));
      if (state.atEnd) setPlaying(false);
    } catch (err) {
      if (latestRequestedLapRef.current === lapNumber) {
        setError(err.message || 'Failed to load replay data');
      }
    } finally {
      if (latestRequestedLapRef.current === lapNumber) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadLap(lap);
  }, [lap, loadLap]);

  const wasPlayingRef = useRef(playing);

  useEffect(() => {
    if (!playing) {
      wasPlayingRef.current = false;
      return undefined;
    }
    // setInterval only fires its first callback after a full period has
    // elapsed, not immediately — so without this, pressing Play left the
    // replay visibly frozen for up to a full tick (2s+ depending on speed)
    // before anything moved. Advancing once right away on a genuine
    // pause->play transition removes that dead time. Gated on wasPlayingRef
    // rather than firing unconditionally: this effect also reruns on every
    // speedIndex change (cycleSpeed) while already playing, and on initial
    // mount — neither of those is a "resume from pause", so an unguarded
    // immediate tick there would skip an extra lap the user never paused.
    if (!wasPlayingRef.current) setLap((l) => l + 1);
    wasPlayingRef.current = true;

    const interval = setInterval(() => {
      setLap((l) => l + 1);
    }, BASE_TICK_MS / SPEEDS[speedIndex]);
    return () => clearInterval(interval);
  }, [playing, speedIndex]);

  const restart = () => {
    setAtEnd(false);
    setLap(0);
    setPlaying(true);
  };

  // Total laps comes straight from the fixture's own synced data, known
  // before the replay even starts — unlike Watch Live's videoSeconds clock,
  // there's no need to probe the backend to learn where the end is.
  const jumpToEnd = useCallback(() => {
    setPlaying(false);
    if (snapshot?.totalLaps != null) {
      setLap(snapshot.totalLaps);
    }
  }, [snapshot]);

  const cycleSpeed = () => setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  const togglePlaying = () => setPlaying((p) => !p);

  return {
    lap,
    snapshot,
    loading,
    error,
    atEnd,
    playing,
    speed: SPEEDS[speedIndex],
    togglePlaying,
    cycleSpeed,
    restart,
    jumpToEnd,
    trackShape,
    trackShapeError,
  };
}