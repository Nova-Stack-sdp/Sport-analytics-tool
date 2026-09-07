import { useEffect, useRef, useState } from 'react';

const DISPLAY_MS = 5000;
const SLIDE_MS = 800;

function LiveTicker({ events, error }) {
  const [index, setIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!events?.length) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % events.length);
      setAnimKey((prev) => prev + 1);
    }, DISPLAY_MS + SLIDE_MS);
    return () => clearInterval(timerRef.current);
  }, [events]);

  if (!events?.length) {
    return (
      <div className="tv-ticker">
        <div className="tv-ticker-viewport">
          <span className="tv-ticker-empty">{error ?? 'Awaiting commentary\u2026'}</span>
        </div>
      </div>
    );
  }

  const current = events[index];

  return (
    <div className="tv-ticker">
      <div className="tv-ticker-viewport">
        <span className="tv-ticker-text" key={animKey}>
          {current.description}
        </span>
      </div>
    </div>
  );
}

export default LiveTicker;
