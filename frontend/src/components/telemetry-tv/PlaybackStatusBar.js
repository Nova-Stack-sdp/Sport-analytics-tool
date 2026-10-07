import { formatGapSeconds, formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

// The Race Control strip: the race state at the selected lap — position in
// the distance, the leader's published margin, the fastest lap already run —
// plus the flag the track is under, and the lap cursor that scrubs the video.
function formatVideoClock(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Fastest lap among the laps the broadcast has already reached — the same
// spoiler rule the pace chart follows.
function fastestSoFar(lapTrend, lap) {
  const paced = (Array.isArray(lapTrend?.records) ? lapTrend.records : [])
    .filter((record) => record.lap <= lap && record.lapSeconds != null);
  if (paced.length === 0) return null;
  return paced.reduce((best, record) => (record.lapSeconds < best.lapSeconds ? record : best));
}

function PlaybackStatusBar({ race, lap, videoSeconds, margin, onLapChange, leaderLap, lapTrend }) {
  const totalLaps = Number(race?.session?.totalLaps) || 1;
  const marginTitle = margin == null
    ? "Leader's official margin at this lap"
    : `${margin.delta >= 0 ? 'Lead grew' : 'Lead shrank'} by ${Math.abs(margin.delta).toFixed(2)}s vs lap ${Math.max(1, lap - 1)}`;
  const fastest = fastestSoFar(lapTrend, lap);
  const underYellow = leaderLap?.flag === 'Yellow';
  const progressPercent = (Math.min(Math.max(lap, 0), totalLaps) / totalLaps) * 100;

  return (
    <section className="card race-control-bar" aria-label="Race control">
      <div className="race-control-row">
        <span className="race-control-title">Race Control</span>

        <div className="status-left">
          <div className="status-item">
            <span className="status-label">Race lap</span>
            <span className="status-value mono">{race ? `${lap} / ${totalLaps}` : '--'}</span>
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
            <span className="status-label">Fastest</span>
            <span className="status-value mono" title="Fastest lap already run">
              {formatLapSeconds(fastest?.lapSeconds)}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Video time</span>
            <span className="status-value mono" title="Absolute video position reported by the player">
              {formatVideoClock(videoSeconds)}
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
          <span className={`sync-badge ${underYellow ? 'caution' : 'synced'}`}>
            {leaderLap?.flag ?? (race ? 'Race report' : 'No data')}
          </span>
        </div>
      </div>

      {/* The race-distance progress line under the readouts, mirroring the
          mock's lap bar: full width at the checkered flag. */}
      <div className="race-control-progress" aria-hidden="true">
        <span
          className={`race-control-progress-fill${underYellow ? ' is-yellow' : ''}`}
          style={{ width: `${progressPercent}%` }}
        />
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
    </section>
  );
}

export default PlaybackStatusBar;
