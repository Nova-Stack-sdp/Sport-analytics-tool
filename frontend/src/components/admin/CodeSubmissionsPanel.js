import { useState, useEffect, useCallback } from 'react';
import { listCodeSubmissions, reviewCodeSubmission } from '../../api/client';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'pending', Approved: 'accepted', Rejected: 'rejected' };

// Prefer the backend's own explanation over the generic "failed with status N"
// (same contract as the data-submissions panel).
function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

// "Code Submissions" tab of the Admin page — the review half of the pipeline
// the /code-submissions page starts. Wired to GET/PATCH /api/code-submissions;
// no mock rows, so an unwired backend shows up as an honest error or an empty
// queue rather than fabricated submissions.
function CodeSubmissionsPanel() {
  const [activeTab, setActiveTab] = useState('Pending');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadSubmissions = useCallback(async (tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listCodeSubmissions(TAB_TO_STATUS[tab]);
      setSubmissions(data.submissions || []);
    } catch (err) {
      setLoadError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions(activeTab);
  }, [activeTab, loadSubmissions]);

  async function handleReview(id, status) {
    try {
      await reviewCodeSubmission(id, status);
      loadSubmissions(activeTab);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  return (
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
        <table>
          <tbody>
            <tr><th>Title</th><th>Language</th><th>Submitter</th><th>Submitted</th><th>Status</th><th></th></tr>
            {submissions.length === 0 && (
              <tr><td colSpan={6} className="secondary">No code submissions</td></tr>
            )}
            {submissions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600 }}>{s.title}</td>
                <td className="mono secondary">{s.language}</td>
                <td className="mono secondary">{s.submitterId || '—'}</td>
                <td className="secondary mono">
                  {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
                </td>
                <td>
                  {s.status === 'pending' && <span className="pill pill-amber">Pending</span>}
                  {s.status === 'accepted' && <span className="pill pill-green">Approved</span>}
                  {s.status === 'rejected' && <span className="pill status-rejected">Rejected</span>}
                </td>
                <td>
                  {s.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleReview(s.id, 'accepted')}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleReview(s.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card-note" style={{ marginTop: 14 }}>
        Accepting a submission makes its derived statistic available on the platform; rejecting
        leaves it in the submitter's history. Both outcomes are recorded against the reviewing admin.
      </div>
    </div>
  );
}

export default CodeSubmissionsPanel;
