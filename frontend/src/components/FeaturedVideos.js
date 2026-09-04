import { useEffect, useRef, useState } from 'react';
import { getPopularVideos } from '../api/client';

// Loads the YouTube IFrame Player API once, no matter how many times this
// component mounts. Returns the global YT namespace.
let ytApiPromise = null;
function loadYouTubeApi() {
  if (typeof window === 'undefined') return null;
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === 'function') prev();
        resolve(window.YT);
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

function VideoCard({ video }) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    let cancelled = false;
    let player = null;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !YT || !containerRef.current) return;
        player = new YT.Player(containerRef.current, {
          videoId: video.videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        // If the API can't load, the youtubeUrl fallback link still works.
      });

    return () => {
      cancelled = true;
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch (err) {
        // Player already gone — nothing to clean up.
      }
    };
  }, [playing, video.videoId]);

  return (
    <div className="video-card">
      <div className="video-thumb">
        {playing ? (
          <div className="video-player" ref={containerRef} title={video.title} />
        ) : (
          <>
            {video.thumbnailUrl && (
              <img src={video.thumbnailUrl} alt="" loading="lazy" />
            )}
            <span className="popular-badge">#{video.rank} trending</span>
            <button
              type="button"
              className="play-btn"
              aria-label={`Play ${video.title}`}
              onClick={() => setPlaying(true)}
            />
          </>
        )}
      </div>
      <div className="video-meta">
        <p className="video-title">
          {playing ? video.title : (
            <a href={video.youtubeUrl} target="_blank" rel="noopener noreferrer">
              {video.title}
            </a>
          )}
        </p>
        <p className="video-sub">{video.sub}</p>
      </div>
    </div>
  );
}

function FeaturedVideos() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPopularVideos()
      .then((data) => {
        if (!cancelled) {
          setVideos(data.videos || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="featured-videos-section">
        <div className="page">
          <div className="section-head">
            <div className="tag">Featured videos</div>
            <h2 className="section-title">Popular right now</h2>
            <p className="section-sub">Latest Formula 1 videos from the official YouTube channel, ranked by what's trending.</p>
          </div>
          <div className="video-row">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="video-card skeleton">
                <div className="video-thumb" />
                <div className="video-meta">
                  <div className="skeleton-title" />
                  <div className="skeleton-sub" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || videos.length === 0) {
    return (
      <section className="featured-videos-section">
        <div className="page">
          <div className="section-head">
            <div className="tag">Featured videos</div>
            <h2 className="section-title">Popular right now</h2>
            <p className="section-sub">Latest Formula 1 videos from the official YouTube channel.</p>
          </div>
          <p className="video-unavailable">
            Featured videos are temporarily unavailable. Browse the official{' '}
            <a
              href="https://www.youtube.com/@Formula1/videos"
              target="_blank"
              rel="noopener noreferrer"
            >
              FORMULA 1 YouTube channel
            </a>{' '}
            instead.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="featured-videos-section">
      <div className="page">
        <div className="section-head">
          <div className="tag">Featured videos</div>
          <h2 className="section-title">Popular right now</h2>
          <p className="section-sub">Latest Formula 1 videos from the official YouTube channel, ranked by what's trending.</p>
        </div>
        <div className="video-row">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedVideos;
