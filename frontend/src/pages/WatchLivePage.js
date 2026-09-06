import LiveTicker from '../components/watch-live/LiveTicker';
import Masterboard from '../components/watch-live/Masterboard';
import PlaybackVideo from '../components/watch-live/PlaybackVideo';
import RaceStateBoard from '../components/watch-live/RaceStateBoard';
import { deriveWatchLiveAnalytics } from '../features/watch-live/deriveAnalytics';
import { useWatchLivePlayback } from '../hooks/useWatchLivePlayback';

// Composes the synchronized Watch Live dashboard.
function WatchLivePage() {
  const { iframeRef, state, snapshots, error, loading } = useWatchLivePlayback();

  const { leaderboard } = deriveWatchLiveAnalytics(state, snapshots);
  const tickerEvents = state?.recentAnchors ?? [];

  return (
    <div className="page" id="page-watch-live">
      <div className="pagehead">
        <div className="section-eyebrow">Live</div>
        <div className="section-title">Watch Live</div>
        <div className="section-desc">
          <h1>Watch Live</h1>
          <p>Follow the session as it happens.</p>
        </div>
      </div>

      <div className="content">
        <div className="watch-live-grid">
          <div className="watch-live-primary">
            <PlaybackVideo iframeRef={iframeRef} state={state} loading={loading} />
            <RaceStateBoard leaderboard={leaderboard} />
          </div>

          <Masterboard leaderboard={leaderboard} error={error} />
        </div>

        <LiveTicker events={tickerEvents} error={error} />
      </div>
    </div>
  );
}

export default WatchLivePage;
