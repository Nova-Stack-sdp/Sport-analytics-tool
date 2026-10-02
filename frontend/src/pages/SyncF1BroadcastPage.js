// RaceSync — the race-replay workspace. The race is chosen in the header's
// search box (see RaceSyncSelection, which this page and the header share),
// so the page itself only has to place the centre stage: its "how to use
// this" map until a race is picked, that race's trace and field afterwards.
import { useRaceSyncSelection } from '../components/race-sync/RaceSyncSelection';
import RaceSyncTrackStage from '../components/race-sync/RaceSyncTrackStage';

function SyncF1BroadcastPage() {
  const selection = useRaceSyncSelection();
  const selected = selection?.selected ?? null;

  return (
    <div className="page" id="page-sync-f1-broadcast">
      <div className="content">
        <RaceSyncTrackStage sessionId={selected?.id} race={selected} />
      </div>
    </div>
  );
}

export default SyncF1BroadcastPage;
