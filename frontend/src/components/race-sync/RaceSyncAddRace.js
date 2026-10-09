import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAvailableRaces, getRaceSyncStatus, requestRaceSync } from '../../api/client';
import { useRaceSyncSelection } from './RaceSyncSelection';

// Adding a race the search doesn't have. The header's search opens this when
// a race isn't in the list: it shows one season's races as OpenF1 lists them,
// each marked with where it stands here, and a race that can be added is one
// click away from a sync (see backend routes/raceRequests.js). The sync runs
// on the server — a minute or two, OpenF1's rate limit sets the pace — and
// this view polls it; the moment the race is ready it is loaded into the
// stage, exactly as if it had been in the search all along.
//
// What was typed in the search narrows the season's list, so "Monaco" with no
// match lands on Monaco here. A year typed into the search picks the season.
const FIRST_SEASON = 2023;
// The sync takes seconds now (backend ingestion/openf1/), so the panel
// checks every second and shows each stage as it lands.
const POLL_MS = 1000;
// How long "Ready in …" stays on screen before the race opens.
const READY_PAUSE_MS = 1200;

// The sync's stages, as the panel names them (see syncSession.js's STAGES).
const STAGE_LABEL = {
  session: 'Finding the race',
  fetch: 'Downloading from OpenF1',
  dimensions: 'Drivers and teams',
  map: 'Checking the data',
  write: 'Saving the events',
  replay: 'Building the replay',
  derive: 'Statistics (finishing in the background)',
};

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// The race arriving: each stage with a tick once done, its detail and time,
// and the clock running at the top — or the total once it's ready.
function SyncProgress({ race }) {
  const stages = race.stages ?? [];
  // Only a race added here, now, has stages to show.
  if (stages.length === 0) return null;
  const ready = race.status === 'ready';
  return (
    <div className="racesync-addrace-progress" aria-live="polite">
      <div className="racesync-addrace-progress-head">
        {ready ? (
          <strong>Ready in {seconds(race.readyMs ?? race.elapsedMs ?? 0)}</strong>
        ) : (
          <span>Adding · {seconds(race.elapsedMs ?? 0)}</span>
        )}
      </div>
      <ol className="racesync-addrace-stages">
        {stages.map((stage) => (
          <li key={stage.stage} className={`is-${stage.state}`}>
            <span className="racesync-addrace-stage-mark" aria-hidden="true">
              {stage.state === 'done' ? '✓' : '•'}
            </span>
            <span className="racesync-addrace-stage-name">{STAGE_LABEL[stage.stage] ?? stage.stage}</span>
            {stage.detail && <span className="racesync-addrace-stage-detail">{stage.detail}</span>}
            {stage.ms != null && <span className="racesync-addrace-stage-ms mono">{seconds(stage.ms)}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
const IN_FLIGHT = new Set(['queued', 'syncing']);

const STATUS_LABEL = {
  ready: 'Ready',
  synced: 'No replay data',
  queued: 'Queued',
  syncing: 'Adding…',
  failed: 'Failed',
  upcoming: 'Not run yet',
  missing: 'Not added',
};

function seasonsUpTo(year) {
  const seasons = [];
  for (let season = year; season >= FIRST_SEASON; season -= 1) seasons.push(season);
  return seasons;
}

function RaceSyncAddRace({ query = '', onBack, onDone }) {
  const { refreshFixtures, selectRace } = useRaceSyncSelection();
  const thisYear = new Date().getFullYear();
  const typedYear = Number(query.match(/\b(20\d\d)\b/)?.[1]);
  const [year, setYear] = useState(
    typedYear >= FIRST_SEASON && typedYear <= thisYear ? typedYear : thisYear
  );
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // The race this reader asked for: it opens by itself once it is ready.
  const wantedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAvailableRaces(year)
      .then((result) => {
        if (!cancelled) setRaces(result.races ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.body?.error ?? err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const updateRace = (sessionKey, patch) =>
    setRaces((list) => list.map((race) => (race.sessionKey === sessionKey ? { ...race, ...patch } : race)));

  const open = useCallback(
    async (sessionId) => {
      await refreshFixtures();
      selectRace(sessionId);
      onDone?.();
    },
    [refreshFixtures, selectRace, onDone]
  );

  // Poll every request still on its way; a race that lands is offered (or,
  // if it is the one asked for here, opened).
  const inFlight = races.filter((race) => IN_FLIGHT.has(race.status)).map((race) => race.sessionKey);
  const inFlightKey = inFlight.join(',');
  useEffect(() => {
    if (!inFlightKey) return undefined;
    const keys = inFlightKey.split(',').map(Number);
    const timer = setInterval(async () => {
      for (const sessionKey of keys) {
        try {
          const status = await getRaceSyncStatus(sessionKey);
          updateRace(sessionKey, {
            status: status.status,
            sessionId: status.sessionId ?? null,
            error: status.error ?? null,
            stages: status.stages ?? [],
            elapsedMs: status.elapsedMs ?? null,
            readyMs: status.readyMs ?? null,
          });
          if (status.status === 'ready' && wantedRef.current === sessionKey) {
            // Let "Ready in …" land on screen, then open the race.
            wantedRef.current = null;
            setTimeout(() => open(status.sessionId), READY_PAUSE_MS);
          }
        } catch {
          // A missed poll is retried on the next tick.
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [inFlightKey, open]);

  const add = async (race) => {
    setNotice(null);
    try {
      const result = await requestRaceSync(race.sessionKey);
      if (result.status === 'ready') {
        open(result.sessionId);
        return;
      }
      wantedRef.current = race.sessionKey;
      updateRace(race.sessionKey, { status: result.status, error: null });
    } catch (err) {
      setNotice(
        err.status === 401
          ? 'Sign in to add a race.'
          : err.body?.error ?? 'Could not request that race. Please try again.'
      );
    }
  };

  const needle = query.replace(/\b20\d\d\b/, '').trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return races;
    const hits = races.filter((race) =>
      [race.name, race.location, race.circuit, race.country]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
    return hits.length > 0 ? hits : races;
  }, [races, needle]);

  return (
    <div className="racesync-addrace" aria-label="Add a race">
      <div className="racesync-addrace-head">
        <button type="button" className="racesync-addrace-back" onClick={onBack}>
          ← Back
        </button>
        <span className="racesync-addrace-title">Add a race from OpenF1</span>
        <select
          className="racesync-addrace-season"
          aria-label="Season"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {seasonsUpTo(thisYear).map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </div>
      <p className="racesync-search-note">
        Adding a race copies its laps, stops and positions from OpenF1 — usually a few seconds.
      </p>

      {notice && <p className="racesync-addrace-notice">{notice}</p>}
      {loading && <p className="racesync-search-note">Loading the {year} season…</p>}
      {error && <p className="racesync-search-note">Couldn't load the season: {error}.</p>}

      {!loading && !error && (
        <ul className="racesync-addrace-list" aria-label={`${year} races`}>
          {shown.map((race) => (
            <li key={race.sessionKey} className="racesync-addrace-row">
              <span className="racesync-addrace-name">
                {race.name}
                <span className="racesync-addrace-meta">
                  {race.location}
                  {race.dateStart ? ` · ${race.dateStart.slice(0, 10)}` : ''}
                </span>
              </span>
              <span
                className={`racesync-addrace-status is-${race.status}`}
                title={race.status === 'failed' ? race.error ?? undefined : undefined}
              >
                {STATUS_LABEL[race.status] ?? race.status}
              </span>
              {race.status === 'ready' ? (
                <button
                  type="button"
                  className="racesync-addrace-action"
                  onClick={() => open(race.sessionId)}
                >
                  Open
                </button>
              ) : race.status === 'missing' || race.status === 'failed' ? (
                <button
                  type="button"
                  className="racesync-addrace-action is-primary"
                  aria-label={`Add ${race.name}`}
                  onClick={() => add(race)}
                >
                  {race.status === 'failed' ? 'Retry' : 'Add'}
                </button>
              ) : (
                <span className="racesync-addrace-action is-idle" aria-hidden="true" />
              )}
              <SyncProgress race={race} />
            </li>
          ))}
          {shown.length === 0 && (
            <li className="racesync-search-note">OpenF1 lists no races for {year}.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default RaceSyncAddRace;
