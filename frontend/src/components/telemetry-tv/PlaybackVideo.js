function PlaybackVideo({ race, loading, error }) {
  const embedUrl = race?.video?.youtubeId
    ? `https://www.youtube.com/embed/${race.video.youtubeId}?enablejsapi=1&playsinline=1&start=${race.video.embedStartSeconds ?? 0}`
    : null;

  return (
    <div className="card video-panel">
      <div className="card-head live-panel-head">
        <div>
          <div className="card-title">{race?.eventName ?? 'Race replay'}</div>
          <div className="card-title-sub">
            {race ? 'Full race replay' : loading ? 'Loading races…' : 'No video source configured'}
          </div>
        </div>
        <span className={`pill ${race ? 'pill-green' : 'pill-gray'}`}>
          {race ? 'INDYCAR' : loading ? 'Loading' : 'Unavailable'}
        </span>
      </div>

      <div className="video-embed" role={embedUrl ? undefined : 'status'}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          error ?? 'Video source not configured'
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
}

export default PlaybackVideo;
