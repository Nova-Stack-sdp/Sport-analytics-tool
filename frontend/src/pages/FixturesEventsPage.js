import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFixtures, getFixtureEvents } from '../api/client';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString();
}

function fixtureStatusPill(fixture) {
  if (fixture.hasCorrections) return { className: 'pill pill-blue', label: 'Corrected' };
  if (fixture.status === 'live') return { className: 'pill pill-red live-blink', label: 'Live' };
  if (fixture.status === 'finished') return { className: 'pill pill-green', label: 'Completed' };
  return { className: 'pill pill-gray', label: 'Scheduled' };
}

function FixturesEventsPage() {
  const [fixtures, setFixtures] = useState([]);
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [fixturesError, setFixturesError] = useState(null);

  const [selectedFixtureId, setSelectedFixtureId] = useState(null);
  const [eventsData, setEventsData] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getFixtures()
      .then((result) => {
        if (cancelled) return;
        setFixtures(result.fixtures);
        if (result.fixtures.length > 0) setSelectedFixtureId(result.fixtures[0].id);
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

  useEffect(() => {
    if (!selectedFixtureId) return;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);

    getFixtureEvents(selectedFixtureId)
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
  }, [selectedFixtureId]);

  return (
    <div className="page" id="page-fixtures">
      <div className="pagehead">
        <div className="section-eyebrow">Core data model</div>
        <div className="section-title">Fixtures &amp; Events</div>
        <div className="section-desc">
          Every statistic the platform publishes is derived from a record of individual events in the order they occurred — this page is where that record lives.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the brief's basic tier is explicit that the platform is "built on event data" and statistics must be "derived from a record of the individual events that occurred during a single fixture... rather than stored as a total that somebody typed in." Nothing else in the app can be trusted unless this layer is visible and inspectable, so it gets its own page rather than being buried inside a dashboard widget.
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Fixtures</div>
            </div>
            {fixturesError && <p className="secondary">Couldn't reach the backend: {fixturesError}.</p>}
            {fixturesLoading && !fixturesError && <p className="secondary">Loading fixtures…</p>}
            {!fixturesLoading && !fixturesError && fixtures.length === 0 && (
              <p className="secondary">No fixtures synced yet.</p>
            )}
            {!fixturesLoading && !fixturesError && fixtures.length > 0 && (
              <table>
                <tbody>
                  <tr>
                    <th>Fixture</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                  {fixtures.map((f) => {
                    const pill = fixtureStatusPill(f);
                    const selected = f.id === selectedFixtureId;
                    return (
                      <tr
                        key={f.id}
                        className="clickable"
                        style={selected ? { background: 'var(--border-soft)' } : undefined}
                        onClick={() => setSelectedFixtureId(f.id)}
                      >
                        <td>{f.meetingName}</td>
                        <td className="secondary mono">{formatDate(f.startTime)}</td>
                        <td>
                          <span className={pill.className}>{pill.label}</span>
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
                  {eventsData ? `${eventsData.session.meetingName} · ${eventsData.session.type}` : '—'}
                </div>
              </div>
            </div>

            {eventsError && <p className="secondary">Couldn't reach the backend: {eventsError}.</p>}
            {eventsLoading && !eventsError && <p className="secondary">Loading events…</p>}
            {!eventsLoading && !eventsError && !selectedFixtureId && (
              <p className="secondary">Select a fixture to see its event log.</p>
            )}
            {!eventsLoading && !eventsError && eventsData && eventsData.events.length === 0 && (
              <p className="secondary">No events recorded for this fixture.</p>
            )}

            {!eventsLoading && !eventsError && eventsData && eventsData.events.length > 0 && (
              <div className="log-ticker">
                {eventsData.events.map((event) => (
                  <div className="log-row" key={event.id}>
                    <span className="log-time">{formatTime(event.occurredAt)}</span>
                    <span
                      className={event.corrected ? 'pill pill-blue' : 'pill pill-green'}
                      style={{ justifySelf: 'start' }}
                    >
                      {event.corrected ? 'Corrected' : 'Ingested'}
                    </span>
                    <span className="log-event">{event.driverName ?? '—'}</span>
                    <span className="mono secondary">
                      {event.eventType.toUpperCase()}
                      {event.lapNumber != null ? ` · Lap ${event.lapNumber}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {eventsData && (
              <div className="derived-note">
                <span className="dot"></span> {eventsData.derivedStatsCount} stat
                {eventsData.derivedStatsCount === 1 ? '' : 's'} recomputed from this fixture's event log ·{' '}
                <Link to="/statistics" style={{ color: 'var(--info)', textDecoration: 'none' }}>
                  view derived statistics
                </Link>
              </div>
            )}
            <div className="card-note">Correcting an event automatically recomputes every statistic derived from it — nothing needs re-entry.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FixturesEventsPage;