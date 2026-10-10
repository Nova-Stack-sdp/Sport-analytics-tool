// RaceSync — the race-replay workspace. The race is chosen in the header's
// search box (see RaceSyncSelection, which this page and the header share),
// so the page itself only has to place the centre stage: its "how to use
// this" map until a race is picked, that race's trace and field afterwards.
// The stage, the analysis panels and the workflow spine all read the same
// lap series and the same simulation through one provider — one fetch, one
// sim — so no two surfaces can disagree about what the race was or what a
// change did to it.
import { useRaceSyncSelection } from '../components/race-sync/RaceSyncSelection';
import { RaceSyncSimProvider } from '../components/race-sync/RaceSyncSimContext';
import RaceSyncTrackStage from '../components/race-sync/RaceSyncTrackStage';

function SyncF1BroadcastPage() {
  const selection = useRaceSyncSelection();
  const selected = selection?.selected ?? null;
  const sessionId = selected?.id;

  return (
    <div className="page" id="page-sync-f1-broadcast">
      <div className="content">
        <RaceSyncSimProvider sessionId={sessionId}>
          <RaceSyncTrackStage sessionId={sessionId} race={selected} />
        </RaceSyncSimProvider>
      </div>
    </div>
  );
}

export default SyncF1BroadcastPage;
