import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { dwellMs, initialNarratorState, stepNarrator, surname } from '../../features/telemetry-tv/narrator';

// How often the narrator re-reads the race. Fast enough that a breaking
// moment cuts in within half a second of airing.
const TICK_MS = 500;

// The line, with every driver it names in bold — the eye finds who before
// what, the way a broadcast caption reads.
function Highlighted({ text, drivers }) {
  const names = [...new Set((drivers ?? []).map(surname).filter((name) => name.length > 2))];
  if (names.length === 0) return text;
  const pattern = new RegExp(
    `\\b(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  );
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="tv-narrator-name">
        {part}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}

// A div with a region role rather than a <section>: the site stylesheet pads
// every <section> 64px top and bottom (globals.css), which would crush this
// thin strip and hide the line it carries.

/**
 * The broadcast crawl under the player: the narrator's current line — what
 * happened, then the context that says why it matters — travelling right to
 * left beside a LIVE block and a tag saying what kind of moment it is. WHAT is said, and when, is the narrator's call (see
 * features/telemetry-tv/narrator.js): the most important unsaid moment is
 * picked by weight, freshness and variety; a breaking one cuts in at once and
 * is set bold with a BREAKING tag and a flash of the page's red.
 *
 * Props: `candidates` (the narrator's input), `now` (race clock, in the
 * candidates' unit), `scale` (half-life scale for that unit), `frontRunners`
 * (surnames of the top three), `label` (e.g. "LAP 31").
 */
function LiveTicker({ candidates, now, scale = 1, frontRunners, label, error }) {
  // The opening line is chosen on the first render, so the crawl never
  // mounts empty when there is already something to say.
  const [narration, setNarration] = useState(() =>
    now == null
      ? initialNarratorState
      : stepNarrator(initialNarratorState, candidates, now, Date.now(), { scale, frontRunners })
  );
  const inputs = useRef({ candidates, now, scale, frontRunners });
  inputs.current = { candidates, now, scale, frontRunners };

  // Step once whenever the race moves (so a new moment airs at once) and on
  // a steady tick (so a line that has had its time hands over to the next).
  useEffect(() => {
    if (now == null) return;
    setNarration((state) =>
      stepNarrator(state, candidates, now, Date.now(), { scale, frontRunners })
    );
  }, [candidates, now, scale, frontRunners]);

  useEffect(() => {
    const timer = setInterval(() => {
      const { candidates: list, now: clock, scale: unit, frontRunners: front } = inputs.current;
      if (clock == null) return;
      setNarration((state) => {
        const next = stepNarrator(state, list, clock, Date.now(), { scale: unit, frontRunners: front });
        return next.current === state.current ? state : next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const current = narration.current;
  const duration = useMemo(() => (current ? dwellMs(current) : 0), [current]);

  if (!current) {
    return (
      <div className="tv-narrator is-idle" role="region" aria-label="Live commentary">
        <div className="tv-narrator-live">
          <span className="tv-narrator-dot" aria-hidden="true" />
          LIVE
          {label && <span className="tv-narrator-lap mono">{label}</span>}
        </div>
        <div className="tv-narrator-track">
          <span className="tv-narrator-empty">{error ?? 'Awaiting commentary…'}</span>
        </div>
      </div>
    );
  }

  const breaking = current.tier === 'breaking';
  return (
    <div
      className={`tv-narrator is-${current.tier} tone-${current.tone}`}
      role="region"
      aria-label="Live commentary"
      data-tier={current.tier}
    >
      <div className="tv-narrator-live">
        <span className="tv-narrator-dot" aria-hidden="true" />
        LIVE
        {label && <span className="tv-narrator-lap mono">{label}</span>}
      </div>
      <div className="tv-narrator-tag" key={`tag-${current.id}`}>
        {breaking && <span className="tv-narrator-breaking">Breaking</span>}
        <span className="tv-narrator-category">{current.label}</span>
      </div>
      <div className="tv-narrator-track" aria-live={breaking ? 'assertive' : 'polite'}>
        <span
          className="tv-narrator-text"
          key={current.id}
          style={{ animationDuration: `${duration}ms` }}
        >
          <Highlighted text={current.text} drivers={current.drivers} />
          {current.context && (
            <span className="tv-narrator-context">
              {' — '}
              <Highlighted text={current.context} drivers={current.drivers} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export default LiveTicker;
