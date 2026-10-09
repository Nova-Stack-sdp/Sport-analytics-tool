import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getFixtures, getFixtureEvents } from '../api/client';
import { useDateTimeFormat } from '../context/PreferencesContext';
import { eventTypeLabel } from '../utils/eventLabels';
import { eventDetail } from '../utils/eventDetails';

// Every session is synced after it finishes, so "finished" is the normal
// state. The other statuses exist in the schema and are shown plainly.
const STATUS_PILLS = {
  finished: { className: 'pill pill-green', label: 'Finished' },
  live: { className: 'pill pill-red', label: 'Live' },
  scheduled: { className: 'pill pill-gray', label: 'Scheduled' },
};

// Filter options for the event log, in the order a race unfolds.
const EVENT_TYPE_FILTERS = [
  'lap_completed', 'pit_stop', 'tyre_stint', 'position_change', 'classification',
  'grid_position', 'flag_event', 'race_control_message', 'weather_snapshot',
];

const ALL_SEASONS = 'all';

function FixturesEventsPage() {
  // Follows the clock / time zone choices in Profile → Settings.
  const { formatDate, formatTime } = useDateTimeFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSession = searchParams.get('session');

  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState(null);
  const [season, setSeason] = useState(null);

  const [eventType, setEventType] = useState('');
  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const [eventsData, setEventsData] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (!cancelled) setFixtures(result.fixtures);
      })
      .catch((err) => {
        if (!cancelled) setFixturesError(err.message);
      })
      .finally(() => {
        if (!cancelled) setFixturesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The fixture in the URL (?session=<id>) when it exists, otherwise the
  // newest one. Links from the welcome and overview pages open a fixture
  // this way, and the address can be shared.
  const selectedFixture = useMemo(
    () => fixtures.find((f) => f.id === requestedSession) ?? fixtures[0] ?? null,
    [fixtures, requestedSession]
  );
  const selectedFixtureId = selectedFixture?.id ?? null;

  const seasons = useMemo(
    () => [...new Set(fixtures.map((f) => f.season).filter((s) => s != null))].sort((a, b) => b - a),
    [fixtures]
  );
  // The season list starts on the selected fixture's season.
  const shownSeason = season ?? selectedFixture?.season ?? ALL_SEASONS;
  const shownFixtures = shownSeason === ALL_SEASONS
    ? fixtures
    : fixtures.filter((f) => f.season === shownSeason);

  function selectFixture(id) {
    setSearchParams({ session: id }, { replace: true });
  }

  useEffect(() => {
    if (!selectedFixtureId) return undefined;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    getFixtureEvents(selectedFixtureId, { type: eventType || undefined, includeSuperseded })
      .then((result) => {
        if (!cancelled) setEventsData(result);
      })
      .catch((err) => {
        if (!cancelled) setEventsError(err.message);
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFixtureId, eventType, includeSuperseded]);

  async function loadMore() {
    const cursor = eventsData?.page?.nextCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const next = await getFixtureEvents(selectedFixtureId, {
        type: eventType || undefined,
        includeSuperseded,
        cursor,
      });
      setEventsData((current) => ({
        ...next,
        events: [...(current?.events ?? []), ...next.events],
      }));
    } catch (err) {
      setEventsError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const events = eventsData?.events ?? [];
  const total = eventsData?.page?.total ?? events.length;
  const session = eventsData?.session;

  return (
    <div className="page" id="page-fixtures">
      <div className="pagehead">
        <div className="section-eyebrow">Event data</div>
        <div className="section-title">Fixtures &amp; Events</div>
        <div className="section-desc">
          Every synced session and its event log: the laps, pit stops, position changes and results that every statistic on the site is calculated from.
        </div>
      </div>
      <div className="content">
        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Fixtures</div>
              {seasons.length > 1 && (
                <label className="secondary">
                  Season{' '}
                  <select
                    aria-label="Season"
                    value={shownSeason}
                    onChange={(e) => setSeason(e.target.value === ALL_SEASONS ? ALL_SEASONS : Number(e.target.value))}
                  >
                    {seasons.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value={ALL_SEASONS}>All seasons</option>
                  </select>
                </label>
              )}
            </div>
            {fixturesError && <p className="secondary">Couldn't load the fixtures: {fixturesError}.</p>}
            {fixturesLoading && !fixturesError && <p className="secondary">Loading fixtures…</p>}
            {!fixturesLoading && !fixturesError && fixtures.length === 0 && (
              <p className="secondary">No fixtures synced yet.</p>
            )}
            {!fixturesLoading && !fixturesError && fixtures.length > 0 && (
              <table>
                <tbody>
                  <tr>
                    <th>Fixture</th>
                    <th>Session</th>
                    <th>Date</th>
                    <th>Events</th>
                    <th>Status</th>
                  </tr>
                  {shownFixtures.map((f) => {
                    const pill = STATUS_PILLS[f.status] ?? { className: 'pill pill-gray', label: f.status };
                    const selected = f.id === selectedFixtureId;
                    return (
                      <tr
                        key={f.id}
                        className="clickable"
                        aria-selected={selected}
                        style={selected ? { background: 'var(--border-soft)' } : undefined}
                        onClick={() => selectFixture(f.id)}
                      >
                        <td>{f.meetingName}</td>
                        <td className="secondary">{f.type}</td>
                        <td className="secondary mono">{formatDate(f.startTime)}</td>
                        <td className="secondary mono">{(f.eventCount ?? 0).toLocaleString()}</td>
                        <td>
                          <span className={pill.className}>{pill.label}</span>
                          {f.hasCorrections && (
                            <span className="pill pill-blue" style={{ marginLeft: 4 }} title="Some events in this fixture were corrected after they were first recorded">
                              Corrected
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Event log</div>
                <div className="card-title-sub">
                  {session
                    ? `${session.meetingName} · ${session.type} · ${formatDate(session.startTime)}`
                    : '—'}
                </div>
              </div>
            </div>

            {selectedFixtureId && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <label className="secondary">
                  Show{' '}
                  <select aria-label="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                    <option value="">All events</option>
                    {EVENT_TYPE_FILTERS.map((t) => (
                      <option key={t} value={t}>{eventTypeLabel(t)}</option>
                    ))}
                  </select>
                </label>
                <label className="secondary">
                  <input
                    type="checkbox"
                    checked={includeSuperseded}
                    onChange={(e) => setIncludeSuperseded(e.target.checked)}
                  />{' '}
                  Include versions later corrected
                </label>
              </div>
            )}

            {eventsError && <p className="secondary">Couldn't load the event log: {eventsError}.</p>}
            {eventsLoading && !eventsError && <p className="secondary">Loading events…</p>}
            {!eventsLoading && !eventsError && !selectedFixtureId && (
              <p className="secondary">Select a fixture to see its event log.</p>
            )}
            {!eventsLoading && !eventsError && eventsData && events.length === 0 && (
              <p className="secondary">No events recorded for this fixture.</p>
            )}

            {!eventsLoading && !eventsError && events.length > 0 && (
              <>
                <div className="log-ticker">
                  {events.map((event) => {
                    const detail = eventDetail(event);
                    return (
                      <div className="log-row" key={event.id}>
                        <span className="log-time">{formatTime(event.occurredAt)}</span>
                        <span>
                          {eventTypeLabel(event.eventType)}
                          {event.isCorrection && (
                            <span className="pill pill-blue" style={{ marginLeft: 6 }} title="This event replaced an earlier version">Correction</span>
                          )}
                          {event.superseded && (
                            <span className="pill pill-gray" style={{ marginLeft: 6 }} title="A later correction replaced this version">Replaced</span>
                          )}
                        </span>
                        <span className="log-event">{event.driverName ?? '—'}</span>
                        <span className="mono secondary">
                          {[detail, event.lapNumber != null ? `Lap ${event.lapNumber}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="card-note">
                  Showing {events.length.toLocaleString()} of {total.toLocaleString()} events.
                  {eventsData?.page?.nextCursor && (
                    <>
                      {' '}
                      <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? 'Loading…' : 'Load more'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {eventsData && selectedFixtureId && (
              <div className="derived-note">
                <span className="dot"></span>{' '}
                {eventsData.derivedStatsCount > 0
                  ? `Session statistics for ${eventsData.derivedStatsCount} driver${eventsData.derivedStatsCount === 1 ? '' : 's'} are derived from this event log · `
                  : 'No statistics have been derived from this event log yet · '}
                <Link
                  to={`/statistics?view=fixture&session=${encodeURIComponent(selectedFixtureId)}`}
                  style={{ color: 'var(--info)', textDecoration: 'none' }}
                >
                  view this fixture's statistics
                </Link>
              </div>
            )}
            <div className="card-note">
              Only published data is shown: OpenF1 syncs and developer uploads an admin has accepted. When an event is corrected, the statistics derived from it are recalculated.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FixturesEventsPage;
