// Keeps the video area in the dashboard without loading a video source.
function PlaybackVideo() {
  return (
    <div className="card video-panel">
      <div className="card-head live-panel-head">
        <div>
          <div className="card-title">Video feed</div>
          <div className="card-title-sub">No video source configured</div>
        </div>
        <span className="pill pill-gray">Unavailable</span>
      </div>

      <div className="video-embed" role="status">
        Video source not configured
      </div>

      <div className="video-meta">
        <div>
          <span className="label-soft">Race mode</span>
          <strong>Unavailable</strong>
        </div>
        <div>
          <span className="label-soft">Lap</span>
          <strong>-- / --</strong>
        </div>
        <div>
          <span className="label-soft">Weather</span>
          <strong>Unavailable</strong>
        </div>
      </div>
    </div>
  );
}

export default PlaybackVideo;