import { useEffect, useRef, useState } from 'react';

// TV-style news ticker that scrolls race commentary from right to left,
// like a live broadcast announcer feed.
function LiveTicker({ events, error }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const offsetRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReducedMotion || !events?.length || isPaused) return;

    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    const containerWidth = container.offsetWidth;
    const singleSetWidth = track.scrollWidth / 2;
    if (singleSetWidth === 0) return;

    let lastTime = performance.now();
    let frameId;
    const pxPerSec = 55;

    const tick = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      offsetRef.current += pxPerSec * dt;

      if (offsetRef.current >= singleSetWidth) {
        offsetRef.current -= singleSetWidth;
      }

      track.style.transform = `translateX(${containerWidth - offsetRef.current}px)`;
      frameId = requestAnimationFrame(tick);
    };

    offsetRef.current = 0;
    track.style.transform = `translateX(${containerWidth}px)`;
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [events, isPaused, prefersReducedMotion]);

  if (!events?.length) {
    return (
      <div className="tv-ticker">
        <div className="tv-ticker-badge">LIVE</div>
        <div className="tv-ticker-viewport">
          <span className="tv-ticker-empty">{error ?? 'Awaiting commentary\u2026'}</span>
        </div>
      </div>
    );
  }

  // Duplicate events for seamless wrap-around loop.
  const doubled = [...events, ...events];

  return (
    <div className="tv-ticker">
      <div className="tv-ticker-badge">LIVE</div>
      <div
        className="tv-ticker-viewport"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="tv-ticker-track" ref={trackRef}>
          {doubled.map((event, i) => (
            <span className="tv-ticker-item" key={`${event.startSeconds}-${i}`}>
              <span className="tv-ticker-text">{event.description}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveTicker;
