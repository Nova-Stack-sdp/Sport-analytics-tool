import { useEffect, useState } from 'react';
import {
  getTimeTravelContext,
  getTimeTravelChangelog,
  getTimeTravelAsOf,
} from '../api/client';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatLapTime(ms) {
  if (ms == null) return '—';
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(3);
  return `${minutes}:${seconds.padStart(6, '0')}`;
}

function CompareRow({ label, before, after, format = (v) => v ?? '—' }) {
  const same = before === after;
  return (
    <tr>
      <td>{label}</td>
      <td className={same ? 'mono secondary' : 'mono'}>
        {same ? format(before) : <span className="diff-rem">{format(before)}</span>}
      </td>
      <td className={same ? 'mono secondary' : 'mono'}>
        {same ? format(after) : <span className="diff-add">{format(after)}</span>}
      </td>
    </tr>
  );
}

function TimeTravelPage() {
  const [availableSessions, setAvailableSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState(null);

  const [checkpointAIdx, setCheckpointAIdx] = useState(0);
  const [checkpointBIdx, setCheckpointBIdx] = useState(0);

  const [changelog, setChangelog] = useState(null);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState(null);

  const [asOfA, setAsOfA] = useState(null);
  const [asOfB, setAsOfB] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState(null);

  // Fixture context: checkpoints (real submission ingestion history) and
  // the driver list, for whichever fixture is selected.
  useEffect(() => {
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);

    getTimeTravelContext(selectedSessionId)
      .then((result) => {
        if (cancelled) return;
        setAvailableSessions(result.availableSessions);
        setCheckpoints(result.checkpoints);
        setEntries(result.entries);
        if (!selectedSessionId && result.session) setSelectedSessionId(result.session.id);
        if (result.entries.length > 0) setSelectedEntryId(result.entries[0].entryId);
        setCheckpointAIdx(0);
        setCheckpointBIdx(Math.max(0, result.checkpoints.length - 1));
      })
      .catch((err) => {
        if (!cancelled) setContextError(err.message);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  // Real audit trail for the selected driver's classification (points/final
  // position) — every version ever ingested, in order.
  useEffect(() => {
    if (!selectedEntryId) return;
    let cancelled = false;
    setChangelogLoading(true);
    setChangelogError(null);

    getTimeTravelChangelog(selectedEntryId)
      .then((result) => {
        if (!cancelled) setChangelog(result);
      })
      .catch((err) => {
        if (!cancelled) setChangelogError(err.message);
      })
      .finally(() => {
        if (!cancelled) setChangelogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEntryId]);

  // Reconstruct stats as of both selected checkpoints, for the diff table.
  useEffect(() => {
    const checkpointA = checkpoints[checkpointAIdx];
    const checkpointB = checkpoints[checkpointBIdx];
    if (!selectedSessionId || !selectedEntryId || !checkpointA || !checkpointB) return;

    let cancelled = false;
    setCompareLoading(true);
    setCompareError(null);

    Promise.all([
      getTimeTravelAsOf({ sessionId: selectedSessionId, entryId: selectedEntryId, date: checkpointA.date }),
      getTimeTravelAsOf({ sessionId: selectedSessionId, entryId: selectedEntryId, date: checkpointB.date }),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setAsOfA(a);
        setAsOfB(b);
      })
      .catch((err) => {
        if (!cancelled) setCompareError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, selectedEntryId, checkpointAIdx, checkpointBIdx, checkpoints]);

  const selectedCheckpoint = checkpoints[checkpointAIdx];

  return (
    <div className="page" id="page-timetravel">
      <div className="pagehead">
        <div className="section-eyebrow">Advanced · historical state</div>
        <div className="section-title">Time-Travel &amp; Audit</div>
        <div className="section-desc">
          What a statistic was as of a given date, and how it changed — reconstructed from the same
          event log everything else on the site reads from, not a separate snapshot system.
        </div>
      </div>
      <div className="content">
        <div className="rationale">
          <span className="ic">◆</span>
          <div>
            <b>Why this page:</b> the advanced tier asks the platform to say what a statistic was as
            of a given date, not just what it is now. This page reconstructs that directly from the
            event log's correction chain (<code>supersededBy</code>) and each submission's real
            ingestion timestamp — there is no separate "dataset release" table in the database yet,
            so unlike the rest of this page, a release-to-release comparison isn't included here; it
            would need a new table and migration, not just a query.
          </div>
        </div>

        {contextError && <p className="secondary">Couldn't reach the backend: {contextError}.</p>}

        {!contextError && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">
                <div className="card-title">Fixture</div>
              </div>
              {availableSessions.length > 0 && (
                <select
                  value={selectedSessionId ?? ''}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  style={{ marginBottom: 12 }}
                >
                  {availableSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}

              {contextLoading && <p className="secondary">Loading checkpoints…</p>}

              {!contextLoading && checkpoints.length === 0 && (
                <p className="secondary">This fixture has no submission history yet.</p>
              )}

              {!contextLoading && checkpoints.length > 0 && (
                <div className="timeline-wrap">
                  <div className="timeline-track">
                    <div
                      className="timeline-fill"
                      style={{
                        width: `${checkpoints.length > 1 ? (checkpointAIdx / (checkpoints.length - 1)) * 100 : 0}%`,
                      }}
                    ></div>
                    {checkpoints.map((cp, i) => {
                      const left = checkpoints.length > 1 ? (i / (checkpoints.length - 1)) * 100 : 0;
                      return (
                        <div key={cp.submissionId}>
                          <div
                            className={`tl-point${i <= checkpointAIdx ? ' done' : ''}${i === checkpointAIdx ? ' selected' : ''}`}
                            style={{ left: `${left}%`, cursor: 'pointer' }}
                            onClick={() => setCheckpointAIdx(i)}
                          ></div>
                          <div className="tl-label" style={{ left: `${left}%` }}>
                            <div className="d">{new Date(cp.date).toLocaleDateString()}</div>
                            <div className="s">{cp.label}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedCheckpoint && (
                <div className="selected-banner">
                  ● Selected state: {formatDateTime(selectedCheckpoint.date)} ({selectedCheckpoint.label})
                </div>
              )}
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Change log</div>
                    <div className="card-title-sub">
                      {changelog ? `${changelog.driverName} · Points scored` : '—'}
                    </div>
                  </div>
                </div>

                {entries.length > 0 && (
                  <select
                    value={selectedEntryId ?? ''}
                    onChange={(e) => setSelectedEntryId(e.target.value)}
                    style={{ marginBottom: 12 }}
                  >
                    {entries.map((e) => (
                      <option key={e.entryId} value={e.entryId}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}

                {changelogError && <p className="secondary">Couldn't reach the backend: {changelogError}.</p>}
                {changelogLoading && !changelogError && <p className="secondary">Loading history…</p>}
                {!changelogLoading && !changelogError && changelog?.history.length === 0 && (
                  <p className="secondary">No classification history for this driver yet.</p>
                )}

                {!changelogLoading && !changelogError && changelog?.history.length > 0 && (
                  <>
                    {changelog.history.map((h) => (
                      <div className="audit-entry" key={h.eventId}>
                        <div className={`audit-dot${h.wasCorrectedLater ? ' flag' : ''}`}></div>
                        <div>
                          <div className="audit-time">{formatDateTime(h.ingestedAt)}</div>
                          <div className="audit-head">
                            {h.isOriginal ? 'Original record' : 'Correction'}
                          </div>
                          <div className="audit-meta">
                            Points scored: <b>{h.payload.points ?? '—'}</b> · final position{' '}
                            <b>{h.payload.final_position ?? '—'}</b>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="card-note">
                      Nothing is overwritten — every row above is a real, distinct event row, ordered by
                      when it was ingested.
                    </div>
                  </>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <div className="card-title">Compare two points in time</div>
                </div>
                <div className="compare-select">
                  <select value={checkpointAIdx} onChange={(e) => setCheckpointAIdx(Number(e.target.value))}>
                    {checkpoints.map((cp, i) => (
                      <option key={cp.submissionId} value={i}>
                        {new Date(cp.date).toLocaleDateString()} · {cp.label}
                      </option>
                    ))}
                  </select>
                  <span className="secondary">vs.</span>
                  <select value={checkpointBIdx} onChange={(e) => setCheckpointBIdx(Number(e.target.value))}>
                    {checkpoints.map((cp, i) => (
                      <option key={cp.submissionId} value={i}>
                        {new Date(cp.date).toLocaleDateString()} · {cp.label}
                      </option>
                    ))}
                  </select>
                </div>

                {compareError && <p className="secondary">Couldn't reach the backend: {compareError}.</p>}
                {compareLoading && !compareError && <p className="secondary">Reconstructing…</p>}

                {!compareLoading && !compareError && asOfA && asOfB && (
                  <table>
                    <tbody>
                      <tr>
                        <th>Field</th>
                        <th>Checkpoint A</th>
                        <th>Checkpoint B</th>
                      </tr>
                      <CompareRow label="Points" before={asOfA.stats.points} after={asOfB.stats.points} />
                      <CompareRow
                        label="Final position"
                        before={asOfA.stats.finalPosition}
                        after={asOfB.stats.finalPosition}
                      />
                      <CompareRow
                        label="Fastest lap"
                        before={asOfA.stats.fastestLapMs}
                        after={asOfB.stats.fastestLapMs}
                        format={formatLapTime}
                      />
                    </tbody>
                  </table>
                )}
                <div className="card-note">
                  Compares this driver's reconstructed stats as of two real submission checkpoints for
                  this fixture — not a published dataset release, which isn't built yet.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TimeTravelPage;