import { useEffect, useRef, useState } from 'react';
import { getWatchLiveState } from '../api/client';

const VIDEO_BUFFER_SECONDS = 15;
const BUFFER_REFILL_SECONDS = 2;

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => reject(new Error('Unable to load the video player.'));
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

export function useWatchLivePlayback() {
  const iframeRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const bufferRef = useRef(null);
  const fetchingRef = useRef(false);
  const lastSnapshotSecondRef = useRef(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let disposed = false;

    const stopTracking = () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };

    const requestBuffer = async (videoSeconds) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);

      try {
        const nextBuffer = await getWatchLiveState({
          videoSeconds,
          bufferSeconds: VIDEO_BUFFER_SECONDS,
        });
        if (disposed) return;

        bufferRef.current = nextBuffer;
        setError(null);
      } catch (requestError) {
        if (!disposed) setError(requestError.message);
      } finally {
        if (!disposed) setLoading(false);
        fetchingRef.current = false;
      }
    };

    const updatePlaybackState = () => {
      const player = playerRef.current;
      if (!player?.getCurrentTime) return;

      const currentSecond = Math.floor(player.getCurrentTime());
      const buffer = bufferRef.current;
      const needsBuffer = !buffer
        || currentSecond < buffer.bufferStartSeconds
        || currentSecond > buffer.bufferEndSeconds - BUFFER_REFILL_SECONDS;
      if (needsBuffer) requestBuffer(currentSecond);

      const snapshot = buffer?.snapshots?.find((item) => item.videoSeconds === currentSecond);
      if (snapshot && lastSnapshotSecondRef.current !== currentSecond) {
        lastSnapshotSecondRef.current = currentSecond;
        setState(snapshot);
      }
    };

    const startTracking = () => {
      updatePlaybackState();
      if (!timerRef.current) timerRef.current = window.setInterval(updatePlaybackState, 500);
    };

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !iframeRef.current) return;
        playerRef.current = new YT.Player(iframeRef.current, {
          events: {
            onStateChange: ({ data }) => {
              if (data === YT.PlayerState.PLAYING) startTracking();
              else stopTracking();
            },
          },
        });
      })
      .catch((playerError) => {
        if (!disposed) setError(playerError.message);
      });

    return () => {
      disposed = true;
      stopTracking();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return { iframeRef, state, error, loading };
}