import LiveTicker from '../components/telemetry-tv/LiveTicker';
import Masterboard from '../components/telemetry-tv/Masterboard';
import PlaybackVideo from '../components/telemetry-tv/PlaybackVideo';
import SessionSetupBar from '../components/telemetry-tv/SessionSetupBar';
import PlaybackStatusBar from '../components/telemetry-tv/PlaybackStatusBar';
import BattleRadar from '../components/telemetry-tv/BattleRadar';
import RacePulse from '../components/telemetry-tv/RacePulse';
import TelemetryTVFooter from '../components/telemetry-tv/TelemetryTVFooter';

// Composes the TelemetryTV dashboard while its data source is unconfigured.
function TelemetryTVPage() {
  const leaderboard = [];

  return (
    <div className="page" id="page-telemetry-tv">
      <div className="content">
        <SessionSetupBar onFindRace={(filters) => console.log('Find race:', filters)} />

        <div className="telemetry-tv-grid">
          <div className="telemetry-tv-primary">
            <PlaybackVideo />
            <PlaybackStatusBar state={null} />
            <LiveTicker events={[]} />
          </div>

          <div className="telemetry-tv-sidebar">
            <Masterboard leaderboard={leaderboard} />
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

