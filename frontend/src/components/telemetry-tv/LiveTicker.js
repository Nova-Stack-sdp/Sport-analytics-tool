import { useEffect, useRef, useState } from 'react';

const DISPLAY_MS = 6000;

function LiveTicker({ events, error }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    setIndex(0);
  }, [events]);

  useEffect(() => {
    if (!events?.length || index >= events.length - 1) return undefined;
    timerRef.current = setTimeout(() => {
      setIndex((currentIndex) => Math.min(currentIndex + 1, events.length - 1));
    }, DISPLAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [events, index]);

  if (!events?.length) {
    return (
      <div className="tv-ticker">
        <div className="tv-ticker-viewport">
          <span className="tv-ticker-empty">{error ?? 'Awaiting commentary\u2026'}</span>
        </div>
      </div>
    );
  }

  const current = events[Math.min(index, events.length - 1)];

  return (
    <div className="tv-ticker">
      <div className="tv-ticker-viewport">
        <span className="tv-ticker-text" key={`${index}-${current.description}`}>
          {current.description}
        </span>
      </div>
    </div>
  );
}

export default LiveTicker;
