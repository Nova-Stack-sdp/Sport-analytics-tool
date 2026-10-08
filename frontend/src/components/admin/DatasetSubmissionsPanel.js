import { Fragment, useState, useEffect, useCallback } from 'react';
import {
  listAdminDatasets,
  getAdminDataset,
  downloadAdminDataset,
  deleteAdminDataset,
  restoreAdminDataset,
  reviewSubmission,
} from '../../api/client';

// Admin tabs map 1:1 to the backend's ?view= values.
const VIEWS = [
  { view: 'pending', label: 'Pending' },
  { view: 'accepted', label: 'Accepted' },
  { view: 'rejected', label: 'Rejected' },
  { view: 'test', label: 'Test data' },
  { view: 'deleted', label: 'Deleted' },
];
const NO_DETAIL = { id: null, loading: false, error: null, data: null };

function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sessionText(session) {
  if (!session) return '—';
  const name = session.meetingName ? `${session.meetingName} · ${session.type}` : session.type;
  return session.season ? `${name} ${session.season}` : name;
}

function recordsText(d) {
  if (d.validRecords == null) return `${d.eventCount} event(s)`;
  return `${d.validRecords} valid · ${d.rejectedRecords} rejected`;
}

function StatusPill({ dataset }) {
  if (dataset.deletedAt) return <span className="pill pill-gray">Deleted</span>;
  if (dataset.purpose === 'code_test') return <span className="pill pill-blue">Test data</span>;
  if (dataset.status === 'pending') return <span className="pill pill-amber">Pending</span>;
  if (dataset.status === 'rejected') return <span className="pill status-rejected">Rejected</span>;
  return <span className="pill pill-green">Accepted</span>;
}

// Saves a Blob through a temporary link; the object URL is released at once.
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Dataset Submissions tab of the Admin page. Lists developer-uploaded
// datasets by review state via GET /api/admin/datasets, and lets an admin
// inspect, download, accept/reject (race data only), delete and restore
// them. Deleting is a soft delete: the dataset and its events are hidden
// everywhere but can be restored from the Deleted tab.
function DatasetSubmissionsPanel() {
  const [view, setView] = useState('pending');
  const [datasets, setDatasets] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(NO_DETAIL);

  const load = useCallback(async (currentView) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listAdminDatasets(currentView);
      setDatasets(data.datasets || []);
      setCounts(data.counts || null);
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDetail(NO_DETAIL);
    setNotice(null);
    load(view);
  }, [view, load]);

  // Runs an action on one row, shows the outcome, and reloads the list.
  async function act(dataset, action) {
    setBusyId(dataset.id);
    setNotice(null);
    setLoadError(null);
    try {
      const message = await action();
      setNotice(message);
      setDetail(NO_DETAIL);
      await load(view);
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  const label = (d) => sessionText(d.session);

  const handleReview = (d, status) => act(d, async () => {
    await reviewSubmission(d.id, status);
    return status === 'accepted'
      ? `Dataset for ${label(d)} accepted. Its events now count toward statistics.`
      : `Dataset for ${label(d)} rejected.`;
  });

  const handleDelete = (d) => {
    const warning = d.status === 'accepted' && d.purpose === 'race_data'
      ? ' Its events will stop counting and the statistics for this session will be recalculated.'
      : '';
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete this dataset for ${label(d)}?${warning} You can restore it from the Deleted tab.`)) return;
    act(d, async () => {
      const result = await deleteAdminDataset(d.id);
      if (result.warning) return `Deleted, but: ${result.warning}`;
      return `Dataset deleted.${result.statisticsRecalculated ? ' Statistics recalculated.' : ''} Restore it from the Deleted tab if needed.`;
    });
  };

  const handleRestore = (d) => act(d, async () => {
    const result = await restoreAdminDataset(d.id);
    if (result.warning) return `Restored, but: ${result.warning}`;
    return `Dataset restored.${result.statisticsRecalculated ? ' Statistics recalculated.' : ''}`;
  });

  async function handleDownload(d) {
    setBusyId(d.id);
    setLoadError(null);
    try {
      const { blob, kind } = await downloadAdminDataset(d.id);
      saveBlob(blob, kind === 'rebuilt' ? `dataset-${d.id}-rebuilt.json` : `dataset-${d.id}.json`);
      setNotice(kind === 'rebuilt'
        ? 'Downloaded a rebuilt file: this dataset was uploaded before original files were kept.'
        : 'Downloaded the original upload.');
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDetail(id) {
    if (detail.id === id) {
      setDetail(NO_DETAIL);
      return;
    }
    setDetail({ id, loading: true, error: null, data: null });
    try {
      const data = await getAdminDataset(id);
      setDetail((current) => (current.id === id ? { id, loading: false, error: null, data } : current));
    } catch (err) {
      setDetail((current) => (current.id === id ? { id, loading: false, error: describeError(err), data: null } : current));
    }
  }

  return (
    <>
      {counts && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-mini"><div className="l">Pending review</div><div className="v warn">{counts.pending}</div></div>
          <div className="stat-mini"><div className="l">Accepted</div><div className="v ok">{counts.accepted}</div></div>
          <div className="stat-mini"><div className="l">Test data</div><div className="v">{counts.test}</div></div>
          <div className="stat-mini"><div className="l">Deleted</div><div className="v accent">{counts.deleted}</div></div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Dataset submissions</div>
            <div className="card-title-sub">Race data waiting for review, and test data uploaded alongside code</div>
          </div>
        </div>
        <div className="tabs">
          {VIEWS.map((v) => (
            <div
              key={v.view}
              className={`tab${view === v.view ? ' active' : ''}`}
              onClick={() => setView(v.view)}
            >
              {v.label}{counts ? ` (${counts[v.view]})` : ''}
            </div>
          ))}
        </div>
        {notice && <div className="card-note" role="status" style={{ color: 'var(--status-green)' }}>{notice}</div>}
        {loadError && <div className="card-note" role="alert" style={{ color: 'var(--status-red)' }}>{loadError}</div>}
        {loading && <div className="card-note">Loading…</div>}
        {!loading && (
          <div className="table-scroll">
            <table>
              <tbody>
                <tr><th>Session</th><th>Submitter</th><th>Submitted</th><th>Records</th><th>Status</th><th></th></tr>
                {datasets.length === 0 && (
                  <tr><td colSpan={6} className="secondary">No datasets</td></tr>
                )}
                {datasets.map((d) => {
                  const busy = busyId === d.id;
                  return (
                    <Fragment key={d.id}>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600 }}>{sessionText(d.session)}</div>
                          <div className="mono secondary" style={{ fontSize: 10.5 }}>session_key {d.session?.sessionKey ?? '—'}</div>
                        </td>
                        <td className="mono secondary">{d.submitterId}</td>
                        <td className="secondary mono">{formatDate(d.submittedAt)}</td>
                        <td className="secondary">{recordsText(d)}</td>
                        <td><StatusPill dataset={d} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleDetail(d.id)}>
                              {detail.id === d.id ? 'Hide' : 'View'}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleDownload(d)}>Download</button>
                            {!d.deletedAt && d.purpose === 'race_data' && d.status === 'pending' && (
                              <>
                                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => handleReview(d, 'accepted')}>Accept</button>
                                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleReview(d, 'rejected')}>Reject</button>
                              </>
                            )}
                            {d.deletedAt ? (
                              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleRestore(d)}>Restore</button>
                            ) : (
                              <button className="btn btn-ghost btn-sm" disabled={busy} style={{ color: 'var(--status-red)' }} onClick={() => handleDelete(d)}>Delete</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {detail.id === d.id && (
                        <tr>
                          <td colSpan={6}>
                            {detail.loading && <div className="card-note" style={{ marginTop: 0 }}>Loading dataset…</div>}
                            {detail.error && <div className="card-note" style={{ marginTop: 0, color: 'var(--status-red)' }}>{detail.error}</div>}
                            {detail.data && (
                              <div>
                                <div className="kv"><span>Purpose</span><b>{detail.data.purpose === 'code_test' ? 'Test data for code review (never added to statistics)' : 'Race data'}</b></div>
                                <div className="kv"><span>Events written</span><b>{detail.data.eventCount}</b></div>
                                <div className="kv"><span>Reviewed</span><b>{detail.data.reviewedAt ? `${formatDate(detail.data.reviewedAt)} by ${detail.data.reviewedBy}` : '—'}</b></div>
                                {detail.data.deletedAt && (
                                  <div className="kv"><span>Deleted</span><b>{`${formatDate(detail.data.deletedAt)} by ${detail.data.deletedBy}`}</b></div>
                                )}
                                <div className="kv">
                                  <span>Download</span>
                                  <b>
                                    {detail.data.upload.kind === 'original'
                                      ? `Original upload, ${formatSize(detail.data.upload.sizeBytes)} · SHA-256 ${detail.data.upload.sha256.slice(0, 12)}…`
                                      : detail.data.upload.note}
                                  </b>
                                </div>
                                {detail.data.rejections.length > 0 && (
                                  <table style={{ marginTop: 10 }}>
                                    <tbody>
                                      <tr><th>Rejected record</th><th>Reason</th></tr>
                                      {detail.data.rejections.map((r, i) => (
                                        // eslint-disable-next-line react/no-array-index-key
                                        <tr key={i}>
                                          <td className="mono">{r.eventType}</td>
                                          <td className="secondary">{r.reason}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-note" style={{ marginTop: 14 }}>
          Accepting race data makes its events count toward statistics. Test data is checked and kept for
          reviewing the code it was uploaded with, but never added to statistics. Deleting hides a dataset and
          its events everywhere (statistics are recalculated if it had been accepted); it can be restored from
          the Deleted tab.
        </div>
      </div>
    </>
  );
}

export default DatasetSubmissionsPanel;
