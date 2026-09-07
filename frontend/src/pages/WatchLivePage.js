import LiveTicker from '../components/watch-live/LiveTicker';
import Masterboard from '../components/watch-live/Masterboard';
import PlaybackVideo from '../components/watch-live/PlaybackVideo';
import SessionSetupBar from '../components/watch-live/SessionSetupBar';
import PlaybackStatusBar from '../components/watch-live/PlaybackStatusBar';
import BattleRadar from '../components/watch-live/BattleRadar';
import WatchLiveFooter from '../components/watch-live/WatchLiveFooter';
import { deriveWatchLiveAnalytics } from '../features/watch-live/deriveAnalytics';
import { useWatchLivePlayback } from '../hooks/useWatchLivePlayback';

// Composes the synchronized Watch Live dashboard.
function WatchLivePage() {
  const { iframeRef, state, snapshots, error, loading } = useWatchLivePlayback();

  const { leaderboard } = deriveWatchLiveAnalytics(state, snapshots);
  const tickerEvents = state?.recentAnchors ?? [];

  return (
    <div className="page" id="page-watch-live">
      <div className="content">
        <SessionSetupBar onFindRace={(filters) => console.log('Find race:', filters)} />

        <div className="watch-live-grid">
          <div className="watch-live-primary">
            <PlaybackVideo iframeRef={iframeRef} state={state} loading={loading} />
            <PlaybackStatusBar state={state} />
          </div>

          <div className="watch-live-sidebar">
            <Masterboard leaderboard={leaderboard} error={error} />
          </div>
        </div>

        <BattleRadar leaderboard={leaderboard} />

        <LiveTicker events={tickerEvents} error={error} />

        <WatchLiveFooter />
      </div>
    </div>
  );
}

export default WatchLivePage;

