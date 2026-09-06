import { useEffect, useState } from 'react';
import { getLiveVideo } from '../api/client';

const FALLBACK_EMBED_URL = 'https://www.youtube.com/embed/O3oYzBXzAIs?si=LDYbi9zAYU7namuA&start=5';

function WatchLivePage() {
  const [video, setVideo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLiveVideo()
      .then((data) => {
        if (!cancelled) setVideo(data.video || null);
      })
      .catch(() => {
        // Keep the static fallback embed if the request fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const embedUrl = video?.embedUrl || FALLBACK_EMBED_URL;

  return (
    <div className="page" id="page-watch-live">
      <div className="pagehead">
        <div className="section-eyebrow">Live</div>
        <div className="section-title">Watch Live</div>
        <div className="section-desc">
          <h1>Watch Live</h1>
         <p>{video?.title || 'Follow the session as it happens.'}</p>
        </div>
      </div>
      <div className="content">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="video-embed">
            <iframe
              src={embedUrl}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WatchLivePage;

