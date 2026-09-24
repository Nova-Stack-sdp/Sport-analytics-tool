import { useCallback, useEffect, useRef, useState } from 'react';
import { getRaceReplayState, getRaceReplayTrackShape } from '../../api/client';

const SPEEDS = [0.5, 1, 2, 4, 16, 60];
// The replay clock is LAP NUMBER, not seconds into a broadcast (see
// raceReplay.js on the backend for why — several event types only carry a
// lap range, not a real timestamp). One lap advances every BASE_TICK_MS /
// speed real ms; at 1x that's a lap every 2 seconds, fast enough to watch
// a full race in a couple of minutes.
const BASE_TICK_MS = 2000;

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

  // A different fixture was picked — every piece of per-session state
  // starts over, including the per-lap snapshot cache (a lap 5 snapshot
  // from the previous session is meaningless for this one).
  useEffect(() => {
    cacheRef.current = new Map();
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
      setSnapshot(state);
      setAtEnd(Boolean(state.atEnd));
      if (state.atEnd) setPlaying(false);
    } catch (err) {
      setError(err.message || 'Failed to load replay data');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadLap(lap);
  }, [lap, loadLap]);

  useEffect(() => {
    if (!playing) return undefined;
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