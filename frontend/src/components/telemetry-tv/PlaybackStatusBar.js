import { formatGapSeconds } from '../../features/telemetry-tv/raceAnalytics';

// Controls the historical lap cursor and shows the leader's published lap data.
function formatVideoClock(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function PlaybackStatusBar({ race, lap, videoSeconds, margin, onLapChange, leaderLap }) {
  const totalLaps = Number(race?.session?.totalLaps) || 1;
  const marginTitle = margin == null
    ? "Leader's official margin at this lap"
    : `${margin.delta >= 0 ? 'Lead grew' : 'Lead shrank'} by ${Math.abs(margin.delta).toFixed(2)}s vs lap ${Math.max(1, lap - 1)}`;

  return (
    <div className="playback-status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-label">Race lap</span>
          <span className="status-value mono">{race ? `${lap} / ${totalLaps}` : '--'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Video time</span>
          <span className="status-value mono" title="Absolute video position reported by the player">
            {formatVideoClock(videoSeconds)}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Leader margin</span>
          <span className="status-value mono" title={marginTitle}>
            {formatGapSeconds(margin?.currentGap)}
            {margin != null && Math.abs(margin.delta) >= 0.05 && (
              <span className={`margin-trend ${margin.delta > 0 ? 'up' : 'down'}`}>
                {margin.delta > 0 ? '▲' : '▼'}
              </span>
            )}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Leader lap</span>
          <span className="status-value mono">{leaderLap?.lapTime ?? '--'}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Derived leader speed</span>
          <span className="status-value mono">
            {leaderLap?.speed == null ? '--' : leaderLap.car === '26'
              ? `${Number(leaderLap.speed).toFixed(1)} mph`
              : `${Number(leaderLap.speed).toFixed(1)} mph ±2.0`}
          </span>
        </div>
      </div>

      <div className="status-right">
        <span className={`sync-badge ${leaderLap?.flag === 'Yellow' ? 'caution' : 'synced'}`}>
          {leaderLap?.flag ?? (race ? 'Race report' : 'No data')}
        </span>
      </div>

      <label className="lap-range-control">
        <span className="status-label">Browse lap</span>
        <input
          aria-label="Select race lap"
          type="range"
          min="1"
          max={totalLaps}
          step="1"
          value={race ? Math.min(lap, totalLaps) : 1}
          disabled={!race}
          onChange={(event) => onLapChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export default PlaybackStatusBar;
