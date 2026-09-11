import { useCallback, useEffect, useRef, useState } from 'react';
import { getWatchLiveState, getTrackShape } from '../../api/client';

const SPEEDS = [0.5, 1, 2, 4, 16, 60];
const BASE_TICK_MS = 1000; // one snapshot = one real second of the session
// A comfortably-larger-than-any-real-session probe value, used only to
// learn the true end of the session from the backend's error response
// when the user hasn't naturally reached the end yet.
const PROBE_VIDEO_SECONDS = 100000;

export function useRaceReplaySnapshots() {
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [atEnd, setAtEnd] = useState(false);
  const [maxVideoSeconds, setMaxVideoSeconds] = useState(null);

  const [trackShape, setTrackShape] = useState(null);
  const [trackShapeError, setTrackShapeError] = useState(null);

  const cacheRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    getTrackShape()
      .then((shape) => { if (!cancelled) setTrackShape(shape); })
      .catch((err) => { if (!cancelled) setTrackShapeError(err.message); });
    return () => { cancelled = true; };
  }, []);

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
        if (err.body?.maxVideoSeconds != null) setMaxVideoSeconds(err.body.maxVideoSeconds);
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

  const [jumpToEndError, setJumpToEndError] = useState(null);

  // Jumps straight to the final state rather than making the user wait
  // through real-time (or even 60x) playback to see how the race ends.
  const jumpToEnd = useCallback(async () => {
    setPlaying(false);
    setJumpToEndError(null);
    if (maxVideoSeconds != null) {
      setVideoSeconds(maxVideoSeconds);
      return;
    }
    try {
      await getWatchLiveState({ videoSeconds: PROBE_VIDEO_SECONDS });
      // The probe itself succeeding would be very unexpected (it implies
      // the session is longer than PROBE_VIDEO_SECONDS), but handle it
      // rather than silently doing nothing.
      setJumpToEndError('Could not determine the end of the session.');
    } catch (err) {
      const structuredMax = err.body?.maxVideoSeconds;
      // Fallback for a backend that hasn't been redeployed with the
      // structured maxVideoSeconds field yet — the number is still in the
      // error text ("videoSeconds must be between 0 and 5423").
      const textMatch = typeof err.body?.error === 'string'
        ? err.body.error.match(/(\d+)\s*$/)
        : null;
      const learnedMax = structuredMax ?? (textMatch ? Number(textMatch[1]) : null);

      if (err.status === 400 && learnedMax != null) {
        setMaxVideoSeconds(learnedMax);
        setVideoSeconds(learnedMax);
      } else {
        setJumpToEndError(
          "Couldn't jump to the end — this usually means the backend hasn't been redeployed with the latest changes yet."
        );
      }
    }
  }, [maxVideoSeconds]);

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
    jumpToEnd,
    jumpToEndError,
    trackShape,
    trackShapeError,
  };
}