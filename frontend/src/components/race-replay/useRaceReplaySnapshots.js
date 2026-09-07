import { useCallback, useEffect, useRef, useState } from 'react';
import { getWatchLiveState } from '../../api/client';

const SPEEDS = [0.5, 1, 2, 4];
const BASE_TICK_MS = 1000; // one snapshot = one real second of the session

export function useRaceReplaySnapshots() {
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [atEnd, setAtEnd] = useState(false);

  const cacheRef = useRef(new Map());

  const loadSecond = useCallback(async (second) => {
    const cache = cacheRef.current;
    if (cache.has(second)) {
      setSnapshot(cache.get(second));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const state = await getWatchLiveState({ videoSeconds: second });
      cache.set(second, state);
      setSnapshot(state);
      setAtEnd(false);
    } catch (err) {
      // The backend returns 400 once videoSeconds runs past the end of the
      // session — that's "replay finished," not a real error.
      if (err.status === 400) {
        setAtEnd(true);
        setPlaying(false);
      } else {
        setError(err.message || 'Failed to load replay data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecond(videoSeconds);
  }, [videoSeconds, loadSecond]);

  useEffect(() => {
    if (!playing) return undefined;
    const interval = setInterval(() => {
      setVideoSeconds((s) => s + 1);
    }, BASE_TICK_MS / SPEEDS[speedIndex]);
    return () => clearInterval(interval);
  }, [playing, speedIndex]);

  const restart = () => {
    setAtEnd(false);
    setVideoSeconds(0);
    setPlaying(true);
  };

  const cycleSpeed = () => setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  const togglePlaying = () => setPlaying((p) => !p);

  return {
    snapshot,
    loading,
    error,
    atEnd,
    playing,
    speed: SPEEDS[speedIndex],
    togglePlaying,
    cycleSpeed,
    restart,
  };
}