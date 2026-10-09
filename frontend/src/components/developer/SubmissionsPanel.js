import { useState, useEffect, useCallback } from 'react';
import { submitData, listSubmissions, reviewSubmission } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'pending', Approved: 'accepted', Rejected: 'rejected' };

// Prefer the backend's own explanation over the generic "failed with status N".
function describeError(err) {
  if (err.status === 401) return 'You need to be signed in to do this. Please sign in again.';
  return err.body?.error || err.message;
}

// Submissions tab of the Developer page. Wired to POST/GET/PATCH
// /api/submissions. Batch submission is a session_key + JSON textarea for
// now, not drag-and-drop file upload — that's a follow-up.
//
// Admins see every submission and can approve/reject from here. Developers
// see only their own submissions (the backend scopes the list) and no review
// buttons, since the backend would refuse the action anyway.
function SubmissionsPanel() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('Pending');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [sessionKey, setSessionKey] = useState('');
  // race_data counts toward the platform once accepted; code_test is sample
  // data for an admin to test submitted code with, never added to the stats.
  const [purpose, setPurpose] = useState('race_data');
  const [payloadText, setPayloadText] = useState('{\n  "laps": []\n}');
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSubmissions = useCallback(async (tab) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listSubmissions(TAB_TO_STATUS[tab]);
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
      await reviewSubmission(id, status);
      loadSubmissions(activeTab);
    } catch (err) {
      setLoadError(describeError(err));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    let body;
    try {
      body = JSON.parse(payloadText);
    } catch {
      setSubmitError('Event data is not valid JSON');
      setSubmitting(false);
      return;
    }
    body.session_key = Number(sessionKey);
    // Race data is the backend's default, so only test data needs saying.
    if (purpose !== 'race_data') body.purpose = purpose;
    try {
      const result = await submitData(body);
      setSubmitResult(result);
      if (activeTab === 'Pending') loadSubmissions('Pending');
    } catch (err) {
      // A 422 is a real submission outcome (status: 'rejected' plus the
      // per-record reasons) — show it as a result. Anything else (401 not
      // signed in, 403 no developer access, 404 unknown session_key, …) is
      // an error body like { error: '...' } and must not be rendered as a
      // "✓ undefined" success.
      if (err.body?.status) setSubmitResult(err.body);
      else setSubmitError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="developer-panel" id="developer-submissions">
      <div className="rationale">
        <span className="ic">◆</span>
        <div>
          <b>Why this tab:</b> the brief treats submission as its own pipeline, not a side effect of an admin panel: "a submission... should be checked against the platform's event schema before it is accepted, and a rejection should tell the submitter what was wrong."
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Submit a batch</div>
          <div className="card-title-sub" style={{ marginBottom: 12 }}>OpenF1-shaped JSON, checked against the event schema</div>
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Session key
              <input
                type="number"
                value={sessionKey}
                onChange={(e) => setSessionKey(e.target.value)}
                required
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              What is this data for?
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              >
                <option value="race_data">Race data for the platform (counts once an admin accepts it)</option>
                <option value="code_test">Test data for my submitted code (never added to statistics)</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              Event data (JSON — e.g. {"{"}"laps": [...]{"}"})
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={8}
                style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'monospace' }}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit batch'}
            </button>
          </form>

          {submitError && (
            <div className="error-box" style={{ marginTop: 12 }}>
              <div className="eh">⚠ {submitError}</div>
            </div>
          )}

          {submitResult && (
            <div className="error-box" style={{ marginTop: 12 }}>
              <div className="eh">
                {submitResult.status === 'rejected' ? '⚠ Rejected' : `✓ ${submitResult.status}`}
                {' — '}
                {submitResult.purpose === 'code_test'
                  ? `${submitResult.validRecords ?? 0} valid record(s) checked; test data is kept for review but not added to the event log`
                  : `${submitResult.eventsWritten ?? 0} event(s) written`}
              </div>
              {submitResult.rejections?.length > 0 && (
                <table>
                  <tbody>
                    <tr><th>Type</th><th>Reason</th></tr>
                    {submitResult.rejections.map((r, i) => (
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
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">{isAdmin ? 'Review & approval queue' : 'My submissions'}</div>
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
                <tr><th>Session</th><th>Submitted</th><th>Status</th><th></th></tr>
                {submissions.length === 0 && (
                  <tr><td colSpan={4} className="secondary">No submissions</td></tr>
                )}
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="mono secondary">{s.sessionId}</td>
                    <td className="secondary mono">{new Date(s.submittedAt).toLocaleString()}</td>
                    <td>
                      {s.status === 'pending' && <span className="pill pill-amber">Pending</span>}
                      {s.status === 'accepted' && <span className="pill pill-green">Approved</span>}
                      {s.status === 'rejected' && <span className="pill status-rejected">Rejected</span>}
                      {s.purpose === 'code_test' && <span className="pill pill-blue" style={{ marginLeft: 4 }}>Test data</span>}
                      {s.deletedAt && <span className="pill pill-gray" style={{ marginLeft: 4 }}>Deleted by admin</span>}
                    </td>
                    <td>
                      {isAdmin && s.status === 'pending' && (
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
            {isAdmin
              ? 'You are an admin, so this lists every submitter\'s batches.'
              : 'Only you can see your submissions here. An admin reviews each pending batch.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubmissionsPanel;
