import RaceReplayViewer from '../components/race-replay/RaceReplayViewer';

function RaceReplayPage() {
  return (
    <div className="page" id="page-replay">
      <div className="pagehead">
        <div className="section-eyebrow">Historical · not live</div>
        <div className="section-title">Race Replay</div>
        <div className="section-desc">
          Step through a completed session's track positions, tyre compounds, and safety car periods — reconstructed from historical event data, not a live feed.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Track shape:</b> illustrative, not a traced circuit — the backend doesn't fetch real GPS telemetry (OpenF1's <code>/location</code> endpoint), only race classification. Car order, tyres, and safety car timing below are real; the exact track outline and each car's precise spot on it are a visual stand-in.
          </div>
        </div>
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Historical, not live:</b> this pulls the same real Barcelona 2026 OpenF1 data that powers{' '}
            <a href="/watch-live" style={{ color: 'var(--info)' }}>Watch Live</a>, but exposes it for free scrubbing back and forth through the session instead of syncing to a video clock — closer in spirit to how{' '}
            <a href="/timetravel" style={{ color: 'var(--info)' }}>Time-Travel</a> lets you inspect historical state at any point.
          </div>
        </div>
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Credit:</b> the safety-car "fixed distance ahead of the leader" positioning concept used here is adapted from{' '}
            <a href="https://github.com/tomshaw3591/f1-race-replay" target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>F1 Race Replay</a>{' '}
            by Tom Shaw, MIT License. Their implementation computes the offset in real track metres via a dense reference polyline; this port uses the browser's native SVG path geometry against a simplified track shape instead. Detecting <i>when</i> the safety car is out comes from real race control messages, not a simulation.
          </div>
        </div>

        <RaceReplayViewer />
      </div>
    </div>
  );
}

export default RaceReplayPage;