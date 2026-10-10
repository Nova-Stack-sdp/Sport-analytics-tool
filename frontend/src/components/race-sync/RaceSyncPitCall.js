import { useMemo } from 'react';
import { teamClassFor } from '../race-replay/raceReplayHelpers';
import { driverCode } from './raceSyncDriverNames';
import { useRaceSyncSim } from './RaceSyncSimContext';
import { pitCallsAtLap } from './raceSyncSim';

// The pit wall's calls, flashed over the map the moment they happen — the
// graphic a broadcast cuts to, not a row to go and read. Blue is the call
// itself (window open, then "box, box"), green and red the verdict once the
// car is back out: ahead of or behind where it really was.
//
// Each banner is keyed by its MOMENT (driver, kind, stop), so it blinks once
// when the moment begins and then holds: the window counting down from three
// laps to one is one moment and does not re-blink every lap, while the step
// from window to box to verdict is three, and each one grabs the eye afresh.
const TAGS = {
  window: 'Pit window open',
  box: 'Box, box',
  gain: 'Stop pays off',
  loss: 'Stop costs',
};

function callDetail(call) {
  if (call.kind === 'window') {
    return `box in ${call.lapsToGo} ${call.lapsToGo === 1 ? 'lap' : 'laps'} · L${call.stopLap}`;
  }
  if (call.kind === 'box') return 'pits this lap';
  const where = call.position != null ? `P${call.position} · ` : '';
  if (call.places !== 0) {
    const n = Math.abs(call.places);
    return `${where}${n} ${n === 1 ? 'place' : 'places'} ${
      call.places > 0 ? 'up on' : 'down on'
    } the real race`;
  }
  return `${where}${Math.abs(call.seconds).toFixed(1)}s ${
    call.seconds < 0 ? 'up on' : 'down on'
  } the real race`;
}

function RaceSyncPitCall({ lap }) {
  const { sim, simLive, series } = useRaceSyncSim();
  const calls = useMemo(() => (simLive ? pitCallsAtLap(sim, lap) : []), [simLive, sim, lap]);
  const driversById = useMemo(
    () => new Map((series?.drivers ?? []).map((driver) => [driver.entryId, driver])),
    [series]
  );
  if (calls.length === 0) return null;

  return (
    <div className="racesync-pitcall-stack" role="status" aria-live="assertive">
      {calls.map((call) => {
        const driver = driversById.get(call.entryId);
        return (
          <div
            key={`${call.entryId}:${call.kind}:${call.stopLap}`}
            className={`racesync-pitcall is-${call.tone} is-${call.kind}`}
          >
            <span className="racesync-pitcall-tag">{TAGS[call.kind]}</span>
            <span className="racesync-pitcall-body">
              <span
                className={`racesync-pitcall-driver racesync-car-${teamClassFor(
                  driver?.teamName
                )}`}
              >
                {driverCode(driver?.driverName)}
              </span>
              {callDetail(call)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default RaceSyncPitCall;
