import { memo } from 'react';
import { formatGapSeconds, formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';

function driverLabel(value) {
  if (typeof value !== 'string' || !value.includes(',')) return value ?? null;
  const [lastName, firstName] = value.split(',').map((part) => part.trim());
  return firstName && lastName ? `${firstName} ${lastName}` : value;
}

// Lap-by-lap pace from the official leader lap times: one bar per lap, colored
// by flag, taller is faster. The selected lap gets the cursor so the chart
// stays glued to the playback position. While the replay runs, only laps
// already completed are drawn — the fastest lap, averages and the chart
// itself reveal as the race does, never ahead of the broadcast.
const RacePaceCard = memo(function RacePaceCard({ lapTrend, lap }) {
  if (!lapTrend || lapTrend.records.length === 0) return null;

  const visible = lapTrend.records.filter((record) => record.lap <= lap);
  if (visible.length === 0) return null;

  const paced = visible.filter((record) => record.lapSeconds != null);
  // Green-flag average: the pace the race actually ran at once the yellow
  // laps are taken out, the number broadcasters quote for race pace.
  const greenPaced = paced.filter((record) => record.flag === 'Green');
  const greenAverageSeconds = greenPaced.length
    ? greenPaced.reduce((total, record) => total + record.lapSeconds, 0) / greenPaced.length
    : null;
  const fastestRecord = paced.length
    ? paced.reduce((best, record) => (record.lapSeconds < best.lapSeconds ? record : best))
    : null;
  const fastestSeconds = fastestRecord?.lapSeconds ?? null;
  const slowestSeconds = paced.length
    ? Math.max(...paced.map((record) => record.lapSeconds))
    : null;
  const averageLapSeconds = paced.length
    ? paced.reduce((total, record) => total + record.lapSeconds, 0) / paced.length
    : null;
  const span = fastestSeconds != null && slowestSeconds != null
    ? Math.max(slowestSeconds - fastestSeconds, 0.05)
    : 0;
  const barHeight = (seconds) => (
    span > 0 ? 22 + ((slowestSeconds - seconds) / span) * 78 : 60
  );

  const selected = visible.find((record) => record.lap === lap) ?? null;
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
        aria-label={fastestRecord
          ? `Lap times for ${lapTrend.totalLaps} laps, fastest lap ${fastestRecord.lap} at ${formatLapSeconds(fastestRecord.lapSeconds)}`
          : `Lap times for ${lapTrend.totalLaps} laps`}
      >
        <div className="pace-bars">
          {paced.map((record) => (
            <span
              key={record.lap}
              className={`pace-bar${record === fastestRecord ? ' fastest' : ''}`}
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
                ? (lap >= lapTrend.totalLaps ? 'Fastest lap of the race' : 'Fastest lap so far')
                : `+${selectedDelta.toFixed(3)}s vs fastest`}
          </span>
        </div>
        <div className="pace-summary-item">
          <span className="pace-summary-label">Fastest lap</span>
          <span className="pace-summary-value mono">{formatLapSeconds(fastestSeconds)}</span>
          <span className="pace-summary-sub">
            {fastestRecord == null
              ? '--'
              : `lap ${fastestRecord.lap}${fastestRecord.driver ? ` · ${driverLabel(fastestRecord.driver)}` : ''}`}
          </span>
        </div>
        <div className="pace-summary-item">
          <span className="pace-summary-label">Average lap</span>
          <span className="pace-summary-value mono">{formatLapSeconds(averageLapSeconds)}</span>
          <span className="pace-summary-sub">
            {paced.length} timed {paced.length === 1 ? 'lap' : 'laps'}
          </span>
        </div>
        {greenAverageSeconds != null && (
          <div className="pace-summary-item">
            <span className="pace-summary-label">Green average</span>
            <span className="pace-summary-value mono">{formatLapSeconds(greenAverageSeconds)}</span>
            <span className="pace-summary-sub">
              {greenPaced.length} green-flag {greenPaced.length === 1 ? 'lap' : 'laps'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
});

export default RacePaceCard;
