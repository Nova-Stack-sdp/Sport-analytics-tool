import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getFixtures } from '../api/client';
import RaceReplayViewer from '../components/race-replay/RaceReplayViewer';

function fixtureLabel(fixture) {
  return `${fixture.meetingName} ${fixture.season} · ${fixture.type}`;
}

// Picker options grouped by season, newest first (the API lists fixtures
// newest first already).
function groupBySeason(fixtures) {
  const groups = new Map();
  for (const f of fixtures) {
    const key = f.season ?? 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()];
}

function RaceReplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSession = searchParams.get('session');
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState(null);

  // Any past session stored in the backend, filtered to fixtures the
  // backend has confirmed have enough synced event data (laps, position
  // changes, a real classification) to reconstruct a watchable replay.
  // See fixtures.js's replayReady flag.
  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (!cancelled) setFixtures((result.fixtures ?? []).filter((f) => f.replayReady));
      })
      .catch((err) => { if (!cancelled) setFixturesError(err.message); })
      .finally(() => { if (!cancelled) setFixturesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ?session=<id> picks the session (so a replay can be linked to and
  // survives a refresh); otherwise the newest replayable one.
  const selectedSessionId = useMemo(() => {
    if (fixtures.some((f) => f.id === requestedSession)) return requestedSession;
    return fixtures[0]?.id ?? null;
  }, [fixtures, requestedSession]);
  const groups = useMemo(() => groupBySeason(fixtures), [fixtures]);

  return (
    <div className="page" id="page-replay">
      <div className="pagehead">
        <div className="section-eyebrow">Historical · not live</div>
        <div className="section-title">Race Replay</div>
        <div className="section-desc">
          Step through a synced race lap by lap: running order, tyre compounds and safety car periods, rebuilt from the event log of a finished session.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>What's real:</b> the running order, tyres and safety car periods come from the session's published event data. The event data has no car locations, so cars are spaced along the track in race order rather than placed where they really were. The track outline is a saved trace of the circuit (from FastF1, or from OpenF1 location data) when one exists, otherwise one traced live from OpenF1 location data for the session, otherwise an illustrative shape — the card says which.
          </div>
        </div>
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Related:</b> <Link className="data-link" to="/timetravel">Time-Travel</Link> shows how a single driver's result changed as data was corrected, and <Link className="data-link" to="/fixtures">Fixtures &amp; Events</Link> lists every event behind a session.{' '}
            The safety-car "fixed distance ahead of the leader" positioning is adapted from{' '}
            <a href="https://github.com/tomshaw3591/f1-race-replay" target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>F1 Race Replay</a>{' '}
            by Tom Shaw (MIT License).
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div className="card-title">Session</div>
            {selectedSessionId && (
              <Link className="data-link" to={`/fixtures?session=${encodeURIComponent(selectedSessionId)}`}>Open its event log</Link>
            )}
          </div>
          {fixturesLoading && <p className="secondary">Loading available sessions…</p>}
          {fixturesError && <p className="secondary">Couldn't load the session list: {fixturesError}.</p>}
          {!fixturesLoading && !fixturesError && fixtures.length === 0 && (
            <p className="secondary">No synced sessions have enough data to replay yet.</p>
          )}
          {fixtures.length > 0 && (
            <select
              aria-label="Select a session to replay"
              value={selectedSessionId ?? ''}
              onChange={(e) => setSearchParams({ session: e.target.value }, { replace: true })}
            >
              {groups.map(([season, sessions]) => (
                <optgroup key={season} label={String(season)}>
                  {sessions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {fixtureLabel(f)}
                    </option>
                  ))}
                </optgroup>
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
