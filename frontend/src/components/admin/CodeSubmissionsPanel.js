import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import {
  listCodeSubmissions,
  getCodeSubmission,
  reviewCodeSubmission,
  removePublishedCode,
  downloadAdminDataset,
} from '../../api/client';
import { saveBlob, datasetFilename } from '../../utils/download';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };
const NO_DETAIL = { id: null, loading: false, error: null, data: null };

function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

// Submissions tab of the Admin page. Every row, count and status comes from
// GET/PATCH /api/code-submissions; there is no mock data, so an unreachable
// backend shows an error or an empty queue. Pending and rejected scripts are
// read from code_submission; approving MOVES a script into verified_code,
// which is where the Approved tab reads from.
function CodeSubmissionsPanel() {
  const loadRequest = useRef(0);
  const [activeTab, setActiveTab] = useState('Pending');
  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [detail, setDetail] = useState(NO_DETAIL);
  const [notice, setNotice] = useState(null);

  const loadSubmissions = useCallback(async (tab) => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setCounts(null);
    setLoadError(null);
    try {
      const data = await listCodeSubmissions(TAB_TO_STATUS[tab]);
      if (requestId !== loadRequest.current) return;
      setSubmissions(data.submissions || []);
      setCounts(data.counts || null);
    } catch (err) {
      if (requestId !== loadRequest.current) return;
      setLoadError(describeError(err));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDetail(NO_DETAIL);
    setNotice(null);
    loadSubmissions(activeTab);
    return () => { loadRequest.current += 1; };
  }, [activeTab, loadSubmissions]);

  async function handleReview(submission, status) {
    setNotice(null);
    try {
      await reviewCodeSubmission(submission.id, status);
      setDetail(NO_DETAIL);
      const testDataNote = submission.testDatasetId ? ' Its test data was retired with it.' : '';
      setNotice(status === 'approved'
        ? `“${submission.title}” approved and moved to the Approved tab. It is now in the public API.`
        : `“${submission.title}” rejected. Rejected scripts are deleted automatically after 7 days.${testDataNote}`);
      loadSubmissions(activeTab);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  // Takes an approved script off the public API. Permanent, so it asks first.
  async function handleRemove(submission) {
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Remove “${submission.title}” from the public API? Its address will stop working and this cannot be undone.`
      + (submission.testDatasetId ? ' Its test data will be retired too.' : ''),
    );
    if (!confirmed) return;
    setNotice(null);
    try {
      const result = await removePublishedCode(submission.verifiedCodeId);
      setDetail(NO_DETAIL);
      setNotice(`“${submission.title}” removed from the public API.${result.testDataRetired
        ? ' Its test data was retired (restorable under Dataset Submissions → Deleted).' : ''}`);
      loadSubmissions(activeTab);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function handleDownloadTestData(dataset) {
    try {
      const { blob, kind } = await downloadAdminDataset(dataset.id);
      saveBlob(blob, datasetFilename(dataset.id, kind));
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function toggleDetail(id) {
    if (detail.id === id) {
      setDetail(NO_DETAIL);
      return;
    }
    setDetail({ id, loading: true, error: null, data: null });
    try {
      const data = await getCodeSubmission(id);
      setDetail((current) => (current.id === id ? { id, loading: false, error: null, data } : current));
    } catch (err) {
      setDetail((current) => (current.id === id ? { id, loading: false, error: describeError(err), data: null } : current));
    }
  }

  const total = counts ? counts.pending + counts.approved + counts.rejected : 0;

  return (
    <>
      {counts && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-mini"><div className="l">Total</div><div className="v">{total}</div></div>
          <div className="stat-mini"><div className="l">Pending</div><div className="v warn">{counts.pending}</div></div>
          <div className="stat-mini"><div className="l">Approved</div><div className="v ok">{counts.approved}</div></div>
          <div className="stat-mini"><div className="l">Rejected</div><div className="v accent">{counts.rejected}</div></div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Code submissions</div>
            <div className="card-title-sub">Review submitted scripts before they enter the platform</div>
          </div>
        </div>
        <div className="tabs">
          {REVIEW_TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        {notice && <div className="card-note" role="status" style={{ color: 'var(--status-green)' }}>{notice}</div>}
        {loading && <div className="card-note">Loading…</div>}
        {loadError && <div className="card-note" role="alert" style={{ color: 'var(--status-red)' }}>{loadError} <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadSubmissions(activeTab)}>Retry</button></div>}
        {!loading && !loadError && (
          <div className="table-scroll">
            <table>
              <tbody>
                <tr><th>Title</th><th>Language</th><th>Submitter</th><th>Submitted</th><th>Reviewed</th><th>Status</th><th></th></tr>
                {submissions.length === 0 && (
                  <tr><td colSpan={7} className="secondary">No code submissions</td></tr>
                )}
                {submissions.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>
                        {s.title}
                        {s.testDatasetId && <span className="pill pill-blue" style={{ marginLeft: 6 }}>Test data</span>}
                      </td>
                      <td className="mono secondary">{s.language}</td>
                      <td className="mono secondary">{s.submitterEmail || s.submitterId || '—'}</td>
                      <td className="secondary mono">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
                      </td>
                      <td className="secondary mono">
                        {s.reviewedAt ? new Date(s.reviewedAt).toLocaleString() : '—'}
                      </td>
                      <td>
                        {s.status === 'pending' && <span className="pill pill-amber">Pending</span>}
                        {s.status === 'approved' && <span className="pill pill-green">Approved</span>}
                        {s.status === 'rejected' && <span className="pill status-rejected">Rejected</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleDetail(s.id)}>
                            {detail.id === s.id ? 'Hide code' : 'View code'}
                          </button>
                          {s.status === 'pending' && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => handleReview(s, 'approved')}>Approve</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleReview(s, 'rejected')}>Reject</button>
                            </>
                          )}
                          {s.status === 'approved' && s.verifiedCodeId && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-red)' }} onClick={() => handleRemove(s)}>
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {detail.id === s.id && (
                      <tr>
                        <td colSpan={7}>
                          {detail.loading && <div className="card-note" style={{ marginTop: 0 }}>Loading code…</div>}
                          {detail.error && <div className="card-note" style={{ marginTop: 0, color: 'var(--status-red)' }}>{detail.error}</div>}
                          {detail.data && (
                            <>
                              {detail.data.description && <div className="secondary" style={{ marginBottom: 8 }}>{detail.data.description}</div>}
                              <pre className="mono" style={{ margin: 0, padding: 12, overflowX: 'auto', background: 'var(--border-soft)' }}>{detail.data.code}</pre>
                              <div className="kv" style={{ marginTop: 10 }}>
                                <span>Test data</span>
                                {detail.data.testDataset ? (
                                  <b style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span>
                                      {detail.data.testDataset.sessionLabel || `session_key ${detail.data.testDataset.sessionKey}`}
                                      {detail.data.testDataset.validRecords != null && ` · ${detail.data.testDataset.validRecords} valid record(s)`}
                                    </span>
                                    {detail.data.testDataset.deleted && <span className="pill pill-gray">Retired</span>}
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleDownloadTestData(detail.data.testDataset)}>
                                      Download test data
                                    </button>
                                  </b>
                                ) : (
                                  <b className="secondary">None attached</b>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-note" style={{ marginTop: 14 }}>
          Approving a script moves it out of the review queue into the verified code library, so it is
          stored once, under the Approved tab. Rejected scripts stay under the Rejected tab for 7 days and
          are then deleted automatically. Both outcomes are recorded against the reviewing admin.
        </div>
      </div>
    </>
  );
}

export default CodeSubmissionsPanel;
