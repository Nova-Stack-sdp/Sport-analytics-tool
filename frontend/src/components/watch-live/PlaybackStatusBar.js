// Displays race clock, lap count, intensity meter, and sync status.
function PlaybackStatusBar({ state }) {
  const formatRaceClock = (seconds) => {
    if (seconds === null || seconds === undefined) return '--:--';
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
  };

  const raceClock = formatRaceClock(state?.videoSeconds);
  const lapInfo = state?.session?.currentLap ? `Lap ${state.session.currentLap}/${state.session.totalLaps}` : '-- Lap';
  const intensityPercent = state ? Math.round(((state.videoSeconds || 0) / (state.session?.totalLaps ? state.session.totalLaps * 60 : 1)) * 100) : 0;

  return (
    <div className="playback-status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-label">Race clock</span>
          <span className="status-value mono">{raceClock}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Lap</span>
          <span className="status-value mono">{lapInfo}</span>
        </div>
        <div className="status-item intensity-meter">
          <span className="status-label">Intensity</span>
          <div className="intensity-bar">
            <div className="intensity-fill" style={{ width: `${Math.min(intensityPercent, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="status-right">
        <div className="sync-status">
          <span className={`sync-badge ${state ? 'synced' : 'unsynced'}`}>
            {state ? '✓ Synced' : '○ Awaiting sync'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PlaybackStatusBar;
