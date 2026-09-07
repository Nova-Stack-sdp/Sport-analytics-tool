import { useEffect, useRef, useState } from 'react';

// Renders transcript anchors for the current playback state as a horizontal crawl.
function formatPlaybackTime(seconds) {
  const totalSeconds = Math.floor(seconds ?? 0);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function LiveTicker({ events, error }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [offset, setOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [visibleEvents, setVisibleEvents] = useState(events);
  const [trackWidth, setTrackWidth] = useState(0);
  const animationFrameRef = useRef(null);
  const lastOffsetRef = useRef(0);

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Update visible events when new events arrive
  useEffect(() => {
    setVisibleEvents(events);
  }, [events]);

  // Animation loop for horizontal crawl
  useEffect(() => {
    if (prefersReducedMotion || visibleEvents.length === 0 || isPaused) {
      return;
    }

    const container = containerRef.current;
    const track = trackRef.current;

    if (!container || !track) return;

    const containerWidth = container.offsetWidth;
    const calculatedTrackWidth = track.offsetWidth;
    setTrackWidth(calculatedTrackWidth);

    // If track fits in container, don't scroll
    if (calculatedTrackWidth <= containerWidth) {
      setOffset(0);
      return;
    }

    let lastTime = Date.now();
    const pixelsPerSecond = 30; // Adjust crawl speed

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      setOffset((prevOffset) => {
        const newOffset = prevOffset + pixelsPerSecond * deltaTime;
        const maxOffset = calculatedTrackWidth + containerWidth;

        // Wrap around
        if (newOffset > maxOffset) {
          return 0;
        }

        lastOffsetRef.current = newOffset;
        return newOffset;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [visibleEvents, isPaused, prefersReducedMotion]);

  // Evict events that have scrolled completely past
  useEffect(() => {
    const track = trackRef.current;
    if (!track || visibleEvents.length === 0) return;

    const items = track.querySelectorAll('.ticker-item');
    let cumulativeWidth = 0;

    items.forEach((item, index) => {
      const itemWidth = item.offsetWidth;
      const itemEnd = cumulativeWidth + itemWidth;

      // If item end is before the current offset, it's completely past
      if (itemEnd < lastOffsetRef.current) {
        // Don't actually remove - just track for optimization
      }

      cumulativeWidth += itemWidth;
    });
  }, [offset, visibleEvents]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  if (visibleEvents.length === 0) {
    return (
      <div className="card ticker-card">
        <div className="card-head">
          <div>
            <div className="card-title">Live text ticker</div>
            <div className="card-title-sub">Narrative feed</div>
          </div>
          <span className="pill pill-red">Moment-to-moment</span>
        </div>

        <div className="ticker-empty-state">
          {error ?? 'No playback events available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="card ticker-card">
      <div className="card-head">
        <div>
          <div className="card-title">Live text ticker</div>
          <div className="card-title-sub">Narrative feed</div>
        </div>
        <span className="pill pill-red">Moment-to-moment</span>
      </div>

      <div
        className="ticker-container"
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="ticker-track"
          ref={trackRef}
          style={{
            transform: `translateX(-${offset}px)`,
          }}
        >
          {visibleEvents.map((event, index) => (
            <div key={`${event.startSeconds}-${event.description}-${index}`} className="ticker-item">
              <span className="ticker-time">{formatPlaybackTime(event.startSeconds)}</span>
              <span className="ticker-point" />
              <span className="ticker-text">{event.description}</span>
              {index < visibleEvents.length - 1 && <span className="ticker-divider">•</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveTicker;