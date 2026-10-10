import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getFixtures } from '../../api/client';

// Which race the RaceSync workspace is looking at — shared between the
// header's race search and the page's centre stage, since they sit on either
// side of the app frame (see AppFrame in App.js).
//
// The list is Race Replay's own fixtures endpoint, filtered to the sessions
// the backend has confirmed carry enough synced event data to replay, so the
// two pages can never disagree about what's available. Nothing is selected by
// default: the stage opens on its "how to use this" map, and only a
// deliberate pick loads a session.
//
// Alongside the race, this holds what the header's view menu is showing: the
// scope itself (see raceSyncViewScope for its shape and its filter) and the
// roster it lists. The roster comes from the stage, which is the component
// that owns the leaderboard fetch — the header never asks for the same
// session a second time.
const RaceSyncSelectionContext = createContext(null);

export function RaceSyncSelectionProvider({ children }) {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [scope, setScope] = useState(null);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (cancelled) return;
        setFixtures((result.fixtures ?? []).filter((f) => f.replayReady));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read the list after a race has been added (see RaceSyncAddRace), so
  // the new race is in the search — and can be picked — without a reload.
  const refreshFixtures = useCallback(async () => {
    const result = await getFixtures();
    const ready = (result.fixtures ?? []).filter((f) => f.replayReady);
    setFixtures(ready);
    setError(null);
    return ready;
  }, []);

  const selected = useMemo(
    () => fixtures.find((f) => f.id === selectedId) ?? null,
    [fixtures, selectedId]
  );

  // A scope names drivers and teams of one session, so it cannot outlive a
  // race switch — the same names would simply not be in the new field.
  useEffect(() => {
    setScope(null);
  }, [selectedId]);

  const value = useMemo(
    () => ({
      fixtures,
      loading,
      error,
      selected,
      selectedId,
      selectRace: setSelectedId,
      refreshFixtures,
      scope,
      setScope,
      roster,
      setRoster,
    }),
    [fixtures, loading, error, selected, selectedId, scope, roster, refreshFixtures]
  );

  return (
    <RaceSyncSelectionContext.Provider value={value}>
      {children}
    </RaceSyncSelectionContext.Provider>
  );
}

export function useRaceSyncSelection() {
  return useContext(RaceSyncSelectionContext);
}
