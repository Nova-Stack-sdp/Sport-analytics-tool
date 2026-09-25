import { useMemo } from 'react';
import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import SessionSetupBar from '../components/telemetry-tv/SessionSetupBar';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import RacePulse from '../components/telemetry-tv/RacePulse';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';
import { deriveTelemetryTVAnalytics } from '../features/telemetry-tv/deriveAnalytics';
import { useTelemetryTVPlayback } from '../hooks/useTelemetryTVPlayback';

// Composes the synchronized TelemetryTV dashboard.
function TelemetryTVPage() {
  const { iframeRef, state, snapshots, error, loading } = useTelemetryTVPlayback();

  const { leaderboard } = useMemo(
    () => deriveTelemetryTVAnalytics(state, snapshots),
    [state, snapshots]
  );
  const tickerEvents = useMemo(() => state?.recentAnchors ?? [], [state]);

  const showLoadingOverlay = loading && !state && !error;

  return (
    <div className="page" id="page-telemetry-tv">
      <div className="content">
        <SessionSetupBar onFindRace={(filters) => console.log('Find race:', filters)} />

        {showLoadingOverlay && (
          <div className="telemetry-tv-loading">
            <div className="telemetry-tv-loading-spinner" />
            <div className="telemetry-tv-loading-text">Loading race telemetry&hellip;</div>
          </div>
        )}

        <div className="telemetry-tv-grid">
          <div className="telemetry-tv-primary">
            <PlaybackVideo iframeRef={iframeRef} state={state} loading={loading} />
            <PlaybackStatusBar state={state} />
            <LiveTicker events={tickerEvents} error={error} />
          </div>

          <div className="telemetry-tv-sidebar">
            <Masterboard leaderboard={leaderboard} error={error} />
          </div>
        </div>

        <RacePulse leaderboard={leaderboard} />

        <BattleRadar leaderboard={leaderboard} />

        <TelemetryTVFooter />
      </div>
    </div>
  );
}

export default TelemetryTVPage;

