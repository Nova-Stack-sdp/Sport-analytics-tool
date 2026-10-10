import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { submitVideoRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { parseYouTubeId } from '../../features/video-requests/youtube';

// "Can't find your race?" — the card a viewer fills in to ask for a race video
// that isn't in Telemetry TV's list yet. They name the race and either paste
// the YouTube link (a watch link, a youtu.be link or the embed code all work,
// and the card previews the video it found) or describe where the video is
// hosted on YouTube when they can't share a link.
//
// Nothing goes live from here. The site is strict about copyright, so every
// request is checked by the developers first (backend routes/videoRequests.js)
// and the viewer is notified when it's live — or why it couldn't be added.
// That's also why the card asks them to sign in: the notification needs
// someone to go to.
function VideoRequestCard({ onClose }) {
  const { user } = useAuth() ?? {};
  const ids = { race: useId(), link: useId(), hosted: useId(), notes: useId() };
  const [raceName, setRaceName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [hostedDescription, setHostedDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);

  const youtubeId = useMemo(() => parseYouTubeId(videoUrl), [videoUrl]);
  const linkProblem = videoUrl.trim() && !youtubeId
    ? "That doesn't look like a YouTube video link. Paste the video's link or its embed code."
    : null;
  const hasSource = Boolean(youtubeId) || hostedDescription.trim().length >= 10;
  const ready = raceName.trim() && hasSource && !linkProblem && acknowledged && !sending;

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const { request } = await submitVideoRequest({
        raceName: raceName.trim(),
        videoUrl: youtubeId ? videoUrl.trim() : undefined,
        hostedDescription: hostedDescription.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSent(request ?? { raceName: raceName.trim() });
    } catch (err) {
      setError(
        err.status === 401
          ? 'Your session has expired — sign in again to send the video.'
          : err.body?.error ?? 'We could not send your request. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card ttv-video-request" aria-label="Add a race video">
      <div className="card-head">
        <div>
          <div className="card-title">Add a race video</div>
          <div className="card-title-sub">Can't find your race? Send us the broadcast and we'll add it.</div>
        </div>
        <button type="button" className="ttv-video-request-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {/* The policy comes first, before anything is typed, so nobody is
          surprised by the wait. */}
      <div className="ttv-video-request-policy" role="note">
        <span className="ttv-video-request-policy-mark" aria-hidden="true">©</span>
        <div>
          <strong>We are strict about copyright.</strong> Before any video goes live, our
          developers check that it isn't copyright-blocked and that it can be shown here. That
          check can take <strong>a few hours</strong> — you'll get a notification as soon as your
          video is live, or if we can't use it, with the reason.
        </div>
      </div>

      {sent ? (
        <div className="ttv-video-request-done" role="status">
          <div className="ttv-video-request-done-title">Request received — thank you.</div>
          <p>
            Your video for <strong>{sent.raceName}</strong> is in our copyright review. This usually
            takes a few hours. We'll notify you when it's live on Telemetry TV.
          </p>
          <button type="button" className="ttv-video-request-button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : !user ? (
        <div className="ttv-video-request-signin">
          <p>Sign in to send a video — we need to know who to notify once it has been checked.</p>
          <Link className="ttv-video-request-button" to="/sign-in">
            Sign in
          </Link>
        </div>
      ) : (
        <form className="ttv-video-request-form" onSubmit={submit} noValidate>
          <label htmlFor={ids.race}>Race</label>
          <input
            id={ids.race}
            type="text"
            maxLength={160}
            placeholder="e.g. Indy Toronto 2024"
            value={raceName}
            onChange={(event) => setRaceName(event.target.value)}
            required
          />

          <label htmlFor={ids.link}>YouTube link or embed code</label>
          <input
            id={ids.link}
            type="text"
            placeholder="https://www.youtube.com/watch?v=…  ·  https://youtu.be/…  ·  <iframe …>"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            aria-invalid={Boolean(linkProblem)}
            aria-describedby={`${ids.link}-hint`}
          />
          <div id={`${ids.link}-hint`} className={`ttv-video-request-hint${linkProblem ? ' is-error' : ''}`}>
            {linkProblem ?? 'On YouTube: Share → Copy link, or Share → Embed → Copy.'}
          </div>
          {youtubeId && (
            <div className="ttv-video-request-preview">
              <img
                src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`}
                alt="Preview of the linked YouTube video"
              />
              <div>
                <div className="ttv-video-request-preview-title">Video found</div>
                <div className="mono">ID {youtubeId}</div>
              </div>
            </div>
          )}

          <div className="ttv-video-request-or" aria-hidden="true">
            <span>or, if you can't share a link</span>
          </div>

          <label htmlFor={ids.hosted}>Where is it hosted on YouTube?</label>
          <textarea
            id={ids.hosted}
            rows={3}
            maxLength={1000}
            placeholder="The channel, the video's title, and roughly when it was uploaded — e.g. INDYCAR channel, “Full Race | 2024 Honda Indy Toronto”, July 2024."
            value={hostedDescription}
            onChange={(event) => setHostedDescription(event.target.value)}
          />

          <label htmlFor={ids.notes}>
            Anything else? <span className="ttv-video-request-optional">optional</span>
          </label>
          <textarea
            id={ids.notes}
            rows={2}
            maxLength={1000}
            placeholder="e.g. the race starts at 12:40 in the video"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          <label className="ttv-video-request-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand the video is checked for copyright before it goes live, and that it may
              take a few hours.
            </span>
          </label>

          {error && (
            <p className="ttv-video-request-error" role="alert">
              {error}
            </p>
          )}

          <div className="ttv-video-request-actions">
            {!hasSource && raceName.trim() && (
              <span className="ttv-video-request-hint">Add a YouTube link, or say where the video is hosted.</span>
            )}
            <button type="submit" className="ttv-video-request-button is-primary" disabled={!ready}>
              {sending ? 'Sending…' : 'Send for review'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default VideoRequestCard;
