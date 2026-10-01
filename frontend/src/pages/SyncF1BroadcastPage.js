// RaceSync — the race-replay workspace. The race list, its replay-ready
// filter, and the stage's data all come from the same read-only endpoints
// Race Replay serves, so this page never grows a second, stale source of
// truth about which races exist.
import { useEffect, useState } from 'react';
import { getFixtures } from '../api/client';
import RaceSyncRacePicker from '../components/race-sync/RaceSyncRacePicker';
import RaceSyncTrackStage from '../components/race-sync/RaceSyncTrackStage';

function SyncF1BroadcastPage() {
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Same fetch-and-filter RaceReplayPage does: only the sessions the backend
  // has confirmed have enough synced event data (laps, position changes, a
  // real classification) to reconstruct a watchable replay are offered.
  // Deliberately nothing is preselected — the stage opens on its "how to use
  // this" map, and only a deliberate pick loads a session.
  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (cancelled) return;
        setFixtures((result.fixtures ?? []).filter((f) => f.replayReady));
      })
      .catch((err) => { if (!cancelled) setFixturesError(err.message); })
      .finally(() => { if (!cancelled) setFixturesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selected = fixtures.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="page" id="page-sync-f1-broadcast">
      <div className="content">
        <RaceSyncRacePicker
          fixtures={fixtures}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={fixturesLoading}
          error={fixturesError}
        />
        <RaceSyncTrackStage sessionId={selected?.id} race={selected} />
      </div>
    </div>
  );
}

export default SyncF1BroadcastPage;
