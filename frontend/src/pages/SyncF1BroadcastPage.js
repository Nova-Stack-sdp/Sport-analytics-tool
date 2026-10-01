// RaceSync — the race-replay workspace. The centre stage hosts the circuit
// map the replay will run on (see RaceSyncTrackStage); everything around it
// is still to come.
import RaceSyncTrackStage from '../components/race-sync/RaceSyncTrackStage';

function SyncF1BroadcastPage() {
  return (
    <div className="page" id="page-sync-f1-broadcast">
      <div className="content">
        <RaceSyncTrackStage />
      </div>
    </div>
  );
}

export default SyncF1BroadcastPage;
