import { memo } from 'react';

const GUIDE_STEPS = [
  'Pick a race above to load its official broadcast replay.',
  'Press play and the lap cursor follows the video clock.',
  'Drag the lap slider to jump — the video seeks with it.',
  'Read the race report: pace, lead battle and the full classification.',
];

// Closes the list with a statement rather than more instructions, the same
// idea the RaceSync guide closes on for its own feature.
const GUIDE_PUNCHLINE = 'Watch the broadcast. Read the race.';

// What the page shows until a race is picked: no player, no data fetches —
// just how the replay works. A catalogue failure replaces the steps with the
// error so the empty state still says why.
const TelemetryTVGuide = memo(function TelemetryTVGuide({ error }) {
  return (
    <section className="card telemetry-tv-guide" aria-label="How to use Telemetry TV">
      <div className="card-head">
        <div>
          <div className="card-title">Telemetry TV</div>
          <div className="card-title-sub">Official INDYCAR broadcast replay, lap by lap</div>
        </div>
        <span className="pill pill-gray">Guide</span>
      </div>

      <div className="telemetry-tv-guide-body">
        {error ? (
          <p className="telemetry-tv-guide-error" role="status">{error}</p>
        ) : (
          <div className="telemetry-tv-guide-panel">
            <ul className="telemetry-tv-guide-list">
              {GUIDE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="telemetry-tv-guide-punchline">{GUIDE_PUNCHLINE}</p>
          </div>
        )}
      </div>
    </section>
  );
});

export default TelemetryTVGuide;
