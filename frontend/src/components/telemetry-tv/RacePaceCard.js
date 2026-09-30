import { memo } from 'react';
import { formatGapSeconds, formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

function driverLabel(value) {
  if (typeof value !== 'string' || !value.includes(',')) return value ?? null;
  const [lastName, firstName] = value.split(',').map((part) => part.trim());
  return firstName && lastName ? `${firstName} ${lastName}` : value;
}

// Lap-by-lap pace from the official leader lap times: one bar per lap, colored
// by flag, taller is faster. The selected lap gets the cursor so the chart
// stays glued to the playback position.
const RacePaceCard = memo(function RacePaceCard({ lapTrend, lap }) {
  if (!lapTrend || lapTrend.records.length === 0) return null;

  const { records, bestLap, averageLapSeconds } = lapTrend;
  const paced = records.filter((record) => record.lapSeconds != null);
  const fastestSeconds = bestLap?.seconds ?? null;
  const slowestSeconds = paced.length
    ? Math.max(...paced.map((record) => record.lapSeconds))
    : null;
  const span = fastestSeconds != null && slowestSeconds != null
    ? Math.max(slowestSeconds - fastestSeconds, 0.05)
    : 0;
  const barHeight = (seconds) => (
    span > 0 ? 22 + ((slowestSeconds - seconds) / span) * 78 : 60
  );

  const selected = records.find((record) => record.lap === lap) ?? null;
  const bestSource = records.find((record) => record.lap === bestLap?.lap) ?? null;
  const selectedDelta = selected?.lapSeconds != null && fastestSeconds != null
    ? selected.lapSeconds - fastestSeconds
    : null;
  const cursorPercent = lapTrend.totalLaps > 0
    ? ((Math.min(Math.max(lap, 1), lapTrend.totalLaps) - 0.5) / lapTrend.totalLaps) * 100
    : 0;

  return (
    <section className="card race-pace-card" aria-label="Pace trend">
      <div className="card-head">
        <div>
          <div className="card-title">Pace Trend</div>
          <div className="card-title-sub">Official leader lap time and margin, lap by lap</div>
        </div>
        <span className="pill pill-gray">Race report</span>
      </div>

      <div
        className="pace-chart"
        role="img"
        aria-label={bestLap
          ? `Lap times for ${lapTrend.totalLaps} laps, fastest lap ${bestLap.lap} at ${formatLapSeconds(bestLap.seconds)}`
          : `Lap times for ${lapTrend.totalLaps} laps`}
      >
        <div className="pace-bars">
          {paced.map((record) => (
            <span
              key={record.lap}
              className={`pace-bar${record.lap === bestLap?.lap ? ' fastest' : ''}`}
              data-flag={record.flag ?? undefined}
              style={{ height: `${barHeight(record.lapSeconds)}%` }}
              title={[
                `Lap ${record.lap}`,
                formatLapSeconds(record.lapSeconds),
                record.speedMph == null ? null : `${record.speedMph.toFixed(1)} mph`,
                record.gapToLeaderSec == null ? null : `margin ${formatGapSeconds(record.gapToLeaderSec)}`,
                record.flag,
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
        <span className="pace-cursor" style={{ left: `${cursorPercent}%` }} />
      </div>

      <div className="pace-legend">
        <span><i className="pace-legend-swatch flag-green" />Green flag</span>
        <span><i className="pace-legend-swatch flag-yellow" />Caution</span>
        <span><i className="pace-legend-swatch flag-checker" />Checkered</span>
      </div>

      <div className="pace-summary">
        <div className="pace-summary-item">
          <span className="pace-summary-label">Selected lap</span>
          <span className="pace-summary-value mono">{formatLapSeconds(selected?.lapSeconds)}</span>
          <span className="pace-summary-sub">
            {selected == null
              ? 'No timing for this lap'
              : selectedDelta == null || selectedDelta <= 0
                ? 'Fastest lap of the race'
                : `+${selectedDelta.toFixed(3)}s vs fastest`}
          </span>
        </div>
        <div className="pace-summary-item">
          <span className="pace-summary-label">Fastest lap</span>
          <span className="pace-summary-value mono">{formatLapSeconds(bestLap?.seconds)}</span>
          <span className="pace-summary-sub">
            {bestLap == null
              ? '--'
              : `lap ${bestLap.lap}${bestSource?.driver ? ` · ${driverLabel(bestSource.driver)}` : ''}`}
          </span>
        </div>
        <div className="pace-summary-item">
          <span className="pace-summary-label">Average lap</span>
          <span className="pace-summary-value mono">{formatLapSeconds(averageLapSeconds)}</span>
          <span className="pace-summary-sub">{paced.length} timed laps</span>
        </div>
      </div>
    </section>
  );
});

export default RacePaceCard;
