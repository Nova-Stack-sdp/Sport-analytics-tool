import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

const PLAYER_ID = 'telemetry-tv-player';
const TIME_POLL_INTERVAL_MS = 1000;

// The embed is driven over the YouTube postMessage bridge: a one-off
// "listening" handshake unlocks the widget's messages, commands are sent as
// {event:'command', func, args}, and the player reports its clock back in
// infoDelivery payloads (which is also how getCurrentTime answers).
function postToPlayer(iframe, payload) {
  const target = iframe?.contentWindow;
  if (!target || typeof target.postMessage !== 'function') return;
  target.postMessage(JSON.stringify(payload), '*');
}

const PlaybackVideo = forwardRef(function PlaybackVideo({
  race,
  onPlay,
  onVideoTime,
  playbackStarted,
  loading,
  error,
}, ref) {
  const iframeRef = useRef(null);
  const receivedTimeRef = useRef(false);
  const embedUrl = race?.video?.youtubeId
    ? `https://www.youtube.com/embed/${race.video.youtubeId}?enablejsapi=1&playsinline=1&start=${race.video.embedStartSeconds ?? 0}`
    : null;

  const sendListening = useCallback(() => {
    postToPlayer(iframeRef.current, { event: 'listening', id: PLAYER_ID, channel: 'widget' });
  }, []);

  // The page seeks the player when the viewer drags the lap slider; every
  // other sync flow runs from the player's own clock.
  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      const target = Number(seconds);
      if (!Number.isFinite(target)) return;
      postToPlayer(iframeRef.current, { event: 'command', func: 'seekTo', args: [target, true] });
    },
  }), []);

  useEffect(() => {
    function handleMessage(event) {
      if (event.source && iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (typeof event.data !== 'string') return;
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const currentTime = payload?.info?.currentTime;
      if (typeof currentTime !== 'number' || !Number.isFinite(currentTime)) return;
      receivedTimeRef.current = true;
      onVideoTime?.(currentTime);
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onVideoTime]);

  // Poll while playback is live so the lap cursor tracks the video even when
  // the viewer scrubs or skips with YouTube's own controls. Until the player
  // answers once, the listening handshake is re-sent in case it raced the
  // iframe load.
  useEffect(() => {
    if (!playbackStarted || !embedUrl) return undefined;
    receivedTimeRef.current = false;
    sendListening();
    const timer = window.setInterval(() => {
      if (!receivedTimeRef.current) sendListening();
      postToPlayer(iframeRef.current, { event: 'command', func: 'getCurrentTime', args: [] });
    }, TIME_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playbackStarted, embedUrl, sendListening]);

  return (
    <div className="card video-panel">
      <div className="card-head live-panel-head">
        <div>
          <div className="card-title">Live Broadcast</div>
          <div className="card-title-sub">
            {/* The race header band above the grid owns the event name; the
                video panel stays the band that plays it. */}
            {race ? 'Official broadcast replay' : loading ? 'Loading races…' : 'No video source configured'}
          </div>
        </div>
        <span className={`pill ${race ? 'pill-green' : 'pill-gray'}`}>
          {race ? 'INDYCAR' : loading ? 'Loading' : 'Unavailable'}
        </span>
      </div>

      <div className="video-embed" role={embedUrl ? undefined : 'status'}>
        {embedUrl ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            onLoad={sendListening}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          error ?? 'Video source not configured'
        )}
        {embedUrl && !playbackStarted && (
          <div className="telemetry-tv-play-overlay">
            <button
              className="telemetry-tv-play-button"
              type="button"
              onClick={() => {
                postToPlayer(iframeRef.current, { event: 'command', func: 'playVideo', args: [] });
                onPlay();
              }}
            >
              Play race
            </button>
          </div>
        )}
      </div>

      <div className="video-meta">
        <div>
          <span className="label-soft">Race mode</span>
          <strong>{race ? 'Race' : 'Unavailable'}</strong>
        </div>
        <div>
          <span className="label-soft">Laps</span>
          <strong>{race ? race.totalLaps ?? '--' : '--'}</strong>
        </div>
        <div>
          <span className="label-soft">Field</span>
          <strong>{race ? race.fieldSize ?? '--' : '--'}</strong>
        </div>
      </div>
    </div>
  );
});

export default PlaybackVideo;
