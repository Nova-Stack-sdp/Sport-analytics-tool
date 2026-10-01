// RaceSync's race picker — the top bar that decides which session the centre
// stage shows. The list itself comes from the same endpoint Race Replay
// builds its picker from (api/client.js's getFixtures), filtered to the
// sessions the backend has confirmed carry enough synced event data to
// replay, so the two pickers can never drift apart.
//
// Purely presentational: the page owns the fetch and the selected id (see
// SyncF1BroadcastPage), this just renders them.

function fixtureLabel(fixture) {
  return `${fixture.meetingName} ${fixture.season} · ${fixture.type}`;
}

function RaceSyncRacePicker({ fixtures, selectedId, onSelect, loading, error }) {
  const hasFixtures = fixtures.length > 0;

  return (
    <div className="racesync-picker">
      <span className="racesync-picker-eyebrow">Race replay</span>

      {hasFixtures && (
        <div className="racesync-picker-field">
          <label className="racesync-picker-label" htmlFor="racesync-race">
            Choose a race
          </label>
          <select
            id="racesync-race"
            className="racesync-picker-select"
            value={selectedId ?? ''}
            onChange={(event) => onSelect(event.target.value)}
          >
            {/* Nothing is preselected: the stage opens on its instructions,
                and this option brings them back after a race has loaded. */}
            <option value="">Select a race…</option>
            {fixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixtureLabel(fixture)}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p className="racesync-picker-note">Loading available races…</p>}
      {error && <p className="racesync-picker-note">Couldn't load the race list: {error}.</p>}
      {!loading && !error && !hasFixtures && (
        <p className="racesync-picker-note">No synced sessions have enough data to replay yet.</p>
      )}
    </div>
  );
}

export default RaceSyncRacePicker;
