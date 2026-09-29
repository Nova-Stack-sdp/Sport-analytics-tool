import { useState, useEffect, useCallback } from 'react';
import { submitData, listSubmissions, reviewSubmission } from '../../api/client';

const REVIEW_TABS = ['Pending', 'Approved', 'Rejected'];
const TAB_TO_STATUS = { Pending: 'pending', Approved: 'accepted', Rejected: 'rejected' };

// Submissions tab of the Developer page. Wired to POST/GET/PATCH
// /api/submissions. Batch submission is a session_key + JSON textarea for
// now, not drag-and-drop file upload — that's a follow-up.
function SubmissionsPanel() {
  const [activeTab, setActiveTab] = useState('Pending');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [sessionKey, setSessionKey] = useState('');
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
      setLoadError(err.message);
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
      setLoadError(err.message);
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
    try {
      const result = await submitData(body);
      setSubmitResult(result);
      if (activeTab === 'Pending') loadSubmissions('Pending');
    } catch (err) {
      if (err.body) setSubmitResult(err.body);
      else setSubmitError(err.message);
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
                {' — '}{submitResult.eventsWritten ?? 0} event(s) written
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
          <div className="card-head"><div className="card-title">Review &amp; approval queue</div></div>
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
          <div className="card-note" style={{ marginTop: 14 }}>Approve/reject require admin access.</div>
        </div>
      </div>
    </div>
  );
}

export default SubmissionsPanel;
