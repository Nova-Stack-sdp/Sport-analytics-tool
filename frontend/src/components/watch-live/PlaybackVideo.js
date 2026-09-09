// Renders the synchronized video player and session metadata.
const YOUTUBE_PLAYER_URL = 'https://www.youtube.com/embed/O3oYzBXzAIs?enablejsapi=1&playsinline=1&start=5';

function formatWeather(weather) {
  if (!weather) return 'Unavailable';
  const temperature = weather.airTemperature == null ? null : `${Math.round(weather.airTemperature)}°C`;
  const condition = weather.rainfall > 0 ? 'Rain' : 'Dry';
  return [temperature, condition].filter(Boolean).join(' / ') || 'Unavailable';
}

function PlaybackVideo({ iframeRef, state, loading }) {
  return (
    <div className="card video-panel">
      <div className="card-head live-panel-head">
        <div>
          <div className="card-title">{state?.session?.meetingName ?? 'Session replay'}</div>
          <div className="card-title-sub">Playback-synchronized feed</div>
        </div>
        <span className={`pill ${state ? 'pill-green' : 'pill-gray'}`}>
          {state ? 'Synchronized' : loading ? 'Loading' : 'Awaiting playback'}
        </span>
      </div>

      <div className="video-embed">
        <iframe
          ref={iframeRef}
          src={YOUTUBE_PLAYER_URL}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>

      <div className="video-meta">
        <div>
          <span className="label-soft">Race mode</span>
          <strong>{state?.session?.sessionName ?? 'Unavailable'}</strong>
        </div>
        <div>
          <span className="label-soft">Lap</span>
          <strong>{state ? `${state.session.currentLap} / ${state.session.totalLaps}` : '-- / --'}</strong>
        </div>
        <div>
          <span className="label-soft">Weather</span>
          <strong>{formatWeather(state?.weather)}</strong>
        </div>
      </div>
    </div>
  );
}

export default PlaybackVideo;