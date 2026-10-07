import { Fragment, useState, useEffect, useCallback } from 'react';
import { listCodeSubmissions, getCodeSubmission, reviewCodeSubmission } from '../../api/client';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };
const NO_DETAIL = { id: null, loading: false, error: null, data: null };

function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

// Submissions tab of the Admin page. Every row, count and status comes from
// the code_submission table via GET/PATCH /api/code-submissions; there is no
// mock data, so an unreachable backend shows an error or an empty queue.
function CodeSubmissionsPanel() {
  const [activeTab, setActiveTab] = useState('Pending');
  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [detail, setDetail] = useState(NO_DETAIL);

  const loadSubmissions = useCallback(async (tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listCodeSubmissions(TAB_TO_STATUS[tab]);
      setSubmissions(data.submissions || []);
      setCounts(data.counts || null);
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDetail(NO_DETAIL);
    loadSubmissions(activeTab);
  }, [activeTab, loadSubmissions]);

  async function handleReview(id, status) {
    try {
      await reviewCodeSubmission(id, status);
      setDetail(NO_DETAIL);
      loadSubmissions(activeTab);
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
            <div
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>
        {loading && <div className="card-note">Loading…</div>}
        {loadError && <div className="card-note" style={{ color: 'var(--status-red)' }}>{loadError}</div>}
        {!loading && !loadError && (
          <div className="table-scroll">
            <table>
              <tbody>
                <tr><th>Title</th><th>Language</th><th>Submitter</th><th>Submitted</th><th>Status</th><th></th></tr>
                {submissions.length === 0 && (
                  <tr><td colSpan={6} className="secondary">No code submissions</td></tr>
                )}
                {submissions.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td style={{ fontWeight: 600 }}>{s.title}</td>
                      <td className="mono secondary">{s.language}</td>
                      <td className="mono secondary">{s.submitterEmail || s.submitterId || '—'}</td>
                      <td className="secondary mono">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
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
                              <button className="btn btn-primary btn-sm" onClick={() => handleReview(s.id, 'approved')}>Approve</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleReview(s.id, 'rejected')}>Reject</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {detail.id === s.id && (
                      <tr>
                        <td colSpan={6}>
                          {detail.loading && <div className="card-note" style={{ marginTop: 0 }}>Loading code…</div>}
                          {detail.error && <div className="card-note" style={{ marginTop: 0, color: 'var(--status-red)' }}>{detail.error}</div>}
                          {detail.data && (
                            <>
                              {detail.data.description && <div className="secondary" style={{ marginBottom: 8 }}>{detail.data.description}</div>}
                              <pre className="mono" style={{ margin: 0, padding: 12, overflowX: 'auto', background: 'var(--border-soft)' }}>{detail.data.code}</pre>
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
          Approving a submission makes its derived statistic available on the platform; rejecting
          leaves it in the submitter's history. Both outcomes are recorded against the reviewing admin.
        </div>
      </div>
    </>
  );
}

export default CodeSubmissionsPanel;
