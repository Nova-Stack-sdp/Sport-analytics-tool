import { useRef } from 'react';

function raceLabel(race) {
  const parsedYear = race.sessionDate ? new Date(race.sessionDate).getFullYear() : NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  return [race.eventName, year].filter(Boolean).join(' · ') || race.slug;
}

function PlaybackVideo({
  race,
  races,
  selectedSlug,
  onSelectRace,
  onPlay,
  playbackStarted,
  loading,
  error,
}) {
  const iframeRef = useRef(null);
  const embedUrl = race?.video?.youtubeId
    ? `https://www.youtube.com/embed/${race.video.youtubeId}?enablejsapi=1&playsinline=1&start=${race.video.embedStartSeconds ?? 0}`
    : null;

  return (
    <div className="card video-panel">
      <div className="race-picker">
        <div className="race-picker-copy">
          <span className="race-picker-eyebrow">INDYCAR REPLAY</span>
          <label htmlFor="race-select" className="race-picker-label">Choose a race</label>
        </div>
        <select
          id="race-select"
          className="race-picker-select"
          value={selectedSlug}
          onChange={(event) => onSelectRace(event.target.value)}
          disabled={loading || races.length === 0}
        >
          {races.length === 0 && (
            <option value="">{loading ? 'Loading races…' : 'No races available'}</option>
          )}
          {races.map((raceOption) => (
            <option key={raceOption.slug} value={raceOption.slug}>
              {raceLabel(raceOption)}
            </option>
          ))}
        </select>
      </div>

      <div className="card-head live-panel-head">
        <div>
          <div className="card-title">{race?.eventName ?? 'Race replay'}</div>
          <div className="card-title-sub">
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
                iframeRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                  '*'
                );
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
}

export default PlaybackVideo;
