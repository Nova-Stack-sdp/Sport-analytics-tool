import { useCallback, useEffect, useState } from 'react';
import { getVideoRequests, reviewVideoRequest } from '../../api/client';

// The copyright review queue for race videos users asked to have added to
// Telemetry TV (see backend routes/videoRequests.js). An admin watches the
// video, checks it isn't copyright-blocked, links it to its race, and then
// approves it — or rejects it with the reason. Either way the user is
// notified; a rejection needs a reason because the user is told it.
const STATUSES = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function Source({ request }) {
  if (request.youtubeId) {
    const watch = `https://www.youtube.com/watch?v=${request.youtubeId}`;
    return (
      <a href={watch} target="_blank" rel="noreferrer" className="video-request-source">
        <img
          src={`https://i.ytimg.com/vi/${request.youtubeId}/default.jpg`}
          alt=""
          width={80}
          height={45}
        />
        <span className="mono">{request.youtubeId}</span>
      </a>
    );
  }
  return <div className="secondary">{request.hostedDescription}</div>;
}

function ReviewActions({ request, onReviewed }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const decide = async (status) => {
    setBusy(true);
    setError(null);
    try {
      const { request: updated } = await reviewVideoRequest(request.id, {
        status,
        reviewNote: status === 'rejected' ? reason.trim() : undefined,
      });
      onReviewed(updated);
    } catch (err) {
      setError(err.body?.error ?? 'The review could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (rejecting) {
    return (
      <div className="video-request-reject">
        <textarea
          rows={2}
          aria-label={`Reason for rejecting ${request.raceName}`}
          placeholder="Why it can't be added — the user is told this"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !reason.trim()}
            onClick={() => decide('rejected')}
          >
            Reject and notify
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
        {error && <div className="video-request-error">{error}</div>}
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => decide('approved')}
          aria-label={`Approve ${request.raceName}`}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setRejecting(true)}
          aria-label={`Reject ${request.raceName}`}
        >
          Reject
        </button>
      </div>
      {error && <div className="video-request-error">{error}</div>}
    </div>
  );
}

function VideoRequestsTab() {
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getVideoRequests(status);
      setRequests(result.requests ?? []);
    } catch (err) {
      setError(err.status === 403 ? 'Admin access is required.' : 'The review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const onReviewed = (updated) =>
    setRequests((list) => list.filter((request) => request.id !== updated.id));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Race video requests</div>
          <div className="card-title-sub">
            Check each video isn't copyright-blocked and link it to its race before approving
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Request status">
          {STATUSES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={status === option.key}
              className={`tab${status === option.key ? ' active' : ''}`}
              onClick={() => setStatus(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="card-note">Loading requests…</div>}
      {error && <div className="card-note">{error}</div>}
      {!loading && !error && requests.length === 0 && (
        <div className="card-note">No {status} requests.</div>
      )}
      {!loading && !error && requests.length > 0 && (
        <table>
          <tbody>
            <tr>
              <th>Race</th>
              <th>Video</th>
              <th>Notes</th>
              <th>Requested by</th>
              <th>{status === 'pending' ? 'Review' : 'Outcome'}</th>
            </tr>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{request.raceName}</div>
                  <div className="mono secondary" style={{ fontSize: 10.5 }}>
                    {formatDate(request.createdAt)}
                  </div>
                </td>
                <td>
                  <Source request={request} />
                </td>
                <td className="secondary">{request.notes ?? '—'}</td>
                <td className="mono secondary">{request.userEmail ?? request.userId}</td>
                <td>
                  {request.status === 'pending' ? (
                    <ReviewActions request={request} onReviewed={onReviewed} />
                  ) : (
                    <div>
                      <span className={`pill ${request.status === 'approved' ? 'pill-green' : 'pill-amber'}`}>
                        {request.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                      {request.reviewNote && <div className="secondary">{request.reviewNote}</div>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card-note">
        Approving notifies the user that their video is live on Telemetry TV — link the video to its
        race first. Rejecting sends them the reason you give.
      </div>
    </div>
  );
}

export default VideoRequestsTab;
