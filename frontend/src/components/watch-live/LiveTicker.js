// Renders transcript anchors for the current playback state.
function formatPlaybackTime(seconds) {
  const totalSeconds = Math.floor(seconds ?? 0);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function LiveTicker({ events, error }) {
  return (
    <div className="card ticker-card">
      <div className="card-head">
        <div>
          <div className="card-title">Live text ticker</div>
          <div className="card-title-sub">Narrative feed</div>
        </div>
        <span className="pill pill-red">Moment-to-moment</span>
      </div>

      <div className="live-ticker">
        {events.length === 0 ? (
          <div className="ticker-row neutral">
            <span className="ticker-time">--:--</span>
            <span className="ticker-point" />
            <span>{error ?? 'No playback events available.'}</span>
          </div>
        ) : events.map((event) => (
          <div key={`${event.startSeconds}-${event.description}`} className="ticker-row neutral">
            <span className="ticker-time">{formatPlaybackTime(event.startSeconds)}</span>
            <span className="ticker-point" />
            <span>{event.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LiveTicker;