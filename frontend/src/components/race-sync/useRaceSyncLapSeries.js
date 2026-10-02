import { useEffect, useState } from 'react';
import { getRaceReplayLapSeries } from '../../api/client';

// The race as a whole, for the panels under RaceSync's map: one fetch per
// picked session, then nothing — the series is the entire race, so unlike the
// lap-by-lap leaderboard beside it there is nothing to reload as the playhead
// moves. The panels slice it themselves, up to the lap on screen.
//
// A race switch clears the old series before the new one lands, so a panel can
// never draw one session's laps under another session's name.
export function useRaceSyncLapSeries(sessionId) {
  const [series, setSeries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setSeries(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setSeries(null);
    setError(null);
    getRaceReplayLapSeries(sessionId)
      .then((result) => {
        if (!cancelled) setSeries(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { series, error };
}
