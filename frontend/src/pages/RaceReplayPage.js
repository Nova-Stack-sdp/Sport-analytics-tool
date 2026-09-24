import { useEffect, useState } from 'react';
import { getFixtures } from '../api/client';
import RaceReplayViewer from '../components/race-replay/RaceReplayViewer';

function fixtureLabel(fixture) {
  return `${fixture.meetingName} ${fixture.season} · ${fixture.type}`;
}

function RaceReplayPage() {
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Any past match stored in the backend, not just one hardcoded session —
  // filtered to fixtures the backend has confirmed have enough synced event
  // data (laps, position changes, a real classification) to actually
  // reconstruct a watchable replay. See fixtures.js's replayReady flag and
  // backend/scripts/inspect-sessions.js for how that's decided.
  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (cancelled) return;
        const replayable = (result.fixtures ?? []).filter((f) => f.replayReady);
        setFixtures(replayable);
        if (replayable.length > 0) setSelectedSessionId(replayable[0].id);
      })
      .catch((err) => { if (!cancelled) setFixturesError(err.message); })
      .finally(() => { if (!cancelled) setFixturesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page" id="page-replay">
      <div className="pagehead">
        <div className="section-eyebrow">Historical · not live</div>
        <div className="section-title">Race Replay</div>
        <div className="section-desc">
          Step through any synced session's track positions, tyre compounds, and safety car periods — reconstructed from historical event data, not a live feed.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Track shape:</b> real telemetry when OpenF1 still has it for the picked session, otherwise a real FastF1-derived trace for that circuit when one's been generated, otherwise an illustrative stand-in — car order, tyres, and safety car timing are always real regardless of which track outline is shown.
          </div>
        </div>
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Any past match:</b> this is independent of{' '}
            <a href="/watch-live" style={{ color: 'var(--info)' }}>Watch Live</a>, which stays synced to one specific broadcast. Pick any synced session below to scrub freely back and forth through it — closer in spirit to how{' '}
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

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">Match</div>
          </div>
          {fixturesLoading && <p className="secondary">Loading available matches…</p>}
          {fixturesError && <p className="secondary">Couldn't load the match list: {fixturesError}.</p>}
          {!fixturesLoading && !fixturesError && fixtures.length === 0 && (
            <p className="secondary">No synced sessions have enough data to replay yet.</p>
          )}
          {fixtures.length > 0 && (
            <select
              aria-label="Select a match to replay"
              value={selectedSessionId ?? ''}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {fixtureLabel(f)}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedSessionId && <RaceReplayViewer sessionId={selectedSessionId} />}
      </div>
    </div>
  );
}

export default RaceReplayPage;