import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRaceSyncLapSeries } from './useRaceSyncLapSeries';
import { anyTweakActive, DEFAULT_TWEAK, simulateRace, tweakIsNoop } from './raceSyncSim';

// The simulation surface every RaceSync child reads. The lap series is
// fetched here, once, so the stage, the graphs and the spine all draw the
// same race from the same payload instead of each keeping their own copy —
// the panels used to own this fetch; it moved up so the sim and the readings
// can never disagree about what the race was.
//
// The sim itself is a pure function of (series, tweaks): it is recomputed
// whole-race on every tweak change, which at race scale is cheap, and the
// playhead projection the UI renders stays in the sim module. `seed` is
// reserved for the reliability pillar — the signature already carries it.
const RaceSyncSimContext = createContext(null);

export function RaceSyncSimProvider({ sessionId, children }) {
  const { series, error } = useRaceSyncLapSeries(sessionId);
  const [mode, setMode] = useState('replay'); // 'replay' | 'sim'
  const [tweaks, setTweaks] = useState({}); // entryId -> { pitShift, paceDelta }

  const sim = useMemo(
    () => (series ? simulateRace(series, tweaks) : null),
    [series, tweaks]
  );

  // Merging a tweak into a driver. A tweak that arrives back at nothing is
  // dropped from the roster rather than kept as a row of zeros, and touching
  // any control enters sim mode — the cause must be visible the moment it
  // exists, not after a separate "run" step.
  const updateTweak = useCallback((entryId, patch) => {
    setTweaks((previous) => {
      const merged = { ...DEFAULT_TWEAK, ...previous[entryId], ...patch };
      const next = { ...previous };
      if (tweakIsNoop(merged)) delete next[entryId];
      else next[entryId] = merged;
      return next;
    });
    setMode('sim');
  }, []);

  const resetTweak = useCallback((entryId) => {
    setTweaks((previous) => {
      if (!(entryId in previous)) return previous;
      const next = { ...previous };
      delete next[entryId];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      tweaks,
      updateTweak,
      resetTweak,
      series,
      seriesError: error,
      sim,
      // Sim only speaks when it has something to say: sim mode chosen and at
      // least one driver actually carrying a tweak. Everything the UI ghosts
      // or solidifies keys off this one flag.
      simLive: mode === 'sim' && !!sim && anyTweakActive(tweaks),
    }),
    [mode, tweaks, updateTweak, resetTweak, series, error, sim]
  );

  return <RaceSyncSimContext.Provider value={value}>{children}</RaceSyncSimContext.Provider>;
}

export function useRaceSyncSim() {
  return useContext(RaceSyncSimContext);
}
