import { memo } from 'react';

// Same clock the playback status bar reads: absolute video position as
// H:MM:SS.
function formatBroadcastClock(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Remaining broadcast time as M:SS (H:MM:SS once it crosses an hour).
function formatCountdown(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// What stands in for every dashboard until the green flag: the player is
// running, but the race has not started, so there is nothing to report yet —
// no running order, no pace, no battle radar. The card says why it is waiting
// and, once the race report has landed, exactly which broadcast moment it is
// waiting on. A failed report replaces the copy with the error, so the page
// never waits in silence on a load that already failed.
const RaceStartWaitCard = memo(function RaceStartWaitCard({
  loading,
  error,
  videoSeconds,
  raceStartSeconds,
}) {
  let copy;
  if (error) {
    copy = `Couldn't load the race report: ${error}.`;
  } else if (loading) {
    copy = 'Loading the race report…';
  } else if (raceStartSeconds == null) {
    copy = 'Press play. Every dashboard on this page stays dark until the race is underway — the stats wake at the green flag.';
  } else {
    copy = 'The broadcast is still pre-race — grid walk, intros and formation laps. Every dashboard wakes the moment the green flag drops; seek back to this part of the broadcast and they go dark again.';
  }

  const greenFlagClock = formatBroadcastClock(raceStartSeconds);
  const secondsToGreen = formatCountdown(
    raceStartSeconds != null && videoSeconds != null
      ? raceStartSeconds - videoSeconds
      : null
  );

  return (
    <section className="card race-start-wait-card" aria-label="Waiting for race start">
      <div className="card-head">
        <div>
          <div className="card-title">
            <span className="race-start-wait-dot" aria-hidden="true" />
            Waiting for race start
          </div>
          <div className="card-title-sub">The dashboards are on standby</div>
        </div>
        <span className="pill pill-gray">Standby</span>
      </div>

      <div className="race-start-wait-body">
        <p className="race-start-wait-copy" role="status">{copy}</p>
        {greenFlagClock != null && (
          <div className="race-start-wait-clock">
            <span className="race-start-wait-clock-item">
              <span className="race-start-wait-clock-label">Green flag</span>
              <span className="race-start-wait-clock-value">{greenFlagClock}</span>
            </span>
            {secondsToGreen != null && (
              <span className="race-start-wait-clock-item">
                <span className="race-start-wait-clock-label">Broadcast to green</span>
                <span className="race-start-wait-clock-value">{secondsToGreen}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
});

export default RaceStartWaitCard;
