import { memo } from 'react';
import { formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

// The analysis twin of Pace Trend: what the tyres are doing, when the next
// stop pressure builds, and how the selected lap compares to the fastest one
// already run. The three rows are derived (spoiler-safe) numbers; the
// curated intelligence — strategy signals, conditions, narrative — renders
// underneath whenever the race carries it.
const StrategyCard = memo(function StrategyCard({ strategy, raceIntelligence }) {
  if (!strategy) return null;

  const { tyre, pit, paceDelta, fastest } = strategy;

  const tyreValue = tyre.status === 'degrading'
    ? `+${tyre.drift.toFixed(2)}s late-run`
    : tyre.status === 'holding'
      ? 'Holding pace'
      : 'Too early to call';
  const tyreSub = tyre.status === 'insufficient'
    ? 'Needs four timed green laps in the current run'
    : `Green laps ${tyre.fromLap}–${tyre.toLap}, early vs late average`;
  const tyreTone = tyre.status === 'degrading' ? ' is-yellow' : tyre.status === 'holding' ? ' is-good' : '';

  const pitValue = pit.lapsSinceLastStop != null
    ? `${pit.lapsSinceLastStop} ${pit.lapsSinceLastStop === 1 ? 'lap' : 'laps'} since last stop`
    : 'Opening stint';
  const pitSub = pit.lastStopLap != null
    ? `Last called: ${pit.lastStopDriver ?? `car ${pit.lastStopCar ?? '--'}`}, lap ${pit.lastStopLap}`
    : 'No stops recorded yet';

  const paceValue = paceDelta == null
    ? '--'
    : paceDelta.isFastest
      ? 'Fastest lap'
      : `+${paceDelta.seconds.toFixed(3)}s vs fastest`;
  const paceSub = fastest
    ? `Fastest so far: ${formatLapSeconds(fastest.seconds)} (lap ${fastest.lap})`
    : 'No timed laps yet';

  const signals = raceIntelligence?.strategySignals ?? [];
  const weather = raceIntelligence?.weather ?? null;
  const narrative = raceIntelligence?.narrative ?? null;

  return (
    <section className="card strategy-card" aria-label="Strategy and tyre analysis">
      <div className="card-head">
        <div>
          <div className="card-title">Strategy / Tyre Analysis</div>
          <div className="card-title-sub">Tyre, pit window and pace, read from the laps already run</div>
        </div>
        <span className="pill pill-blue">Analysis</span>
      </div>

      <div className="strategy-metrics">
        <div className="strategy-metric">
          <span className="strategy-metric-label">Tyre degradation</span>
          <span className={`strategy-metric-value${tyreTone}`}>{tyreValue}</span>
          <span className="strategy-metric-sub">{tyreSub}</span>
        </div>
        <div className="strategy-metric">
          <span className="strategy-metric-label">Pit window</span>
          <span className="strategy-metric-value">{pitValue}</span>
          <span className="strategy-metric-sub">{pitSub}</span>
        </div>
        <div className="strategy-metric">
          <span className="strategy-metric-label">Pace delta</span>
          <span className="strategy-metric-value">{paceValue}</span>
          <span className="strategy-metric-sub">{paceSub}</span>
        </div>
      </div>

      {signals.length > 0 && (
        <div className="weather-signals strategy-signals">
          {signals.map((signal) => (
            <div key={signal.label} className="weather-signal-item">
              <div className="weather-signal-label">{signal.label}</div>
              <div className="weather-signal-value">{signal.value}</div>
              <div className="weather-signal-detail">{signal.detail}</div>
            </div>
          ))}
        </div>
      )}

      {weather?.note && (
        <div className="strategy-conditions">
          <span className="strategy-conditions-label">Conditions</span>
          <p className="weather-summary">{weather.note}</p>
          {weather.grip && <p className="weather-grip">{weather.grip}</p>}
        </div>
      )}

      {narrative && <div className="weather-narrative">{narrative}</div>}
    </section>
  );
});

export default StrategyCard;
