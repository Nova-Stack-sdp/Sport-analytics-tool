import { memo } from 'react';
import { formatGapSeconds, formatLapSeconds } from '../../features/telemetry-tv/raceAnalytics';
import CollapsiblePanel from './CollapsiblePanel';
import GaugeDial from './GaugeDial';

// The instrument band: the two readings a viewer checks first, drawn as dials
// instead of read as bars — where the current lap sits between the fastest and
// slowest laps already run, and whether the leader's margin is growing or being
// clawed back. The lap-by-lap strip stays underneath as the evidence for the
// dials: every bar is a lap the broadcast has reached, never a lap still ahead
// of the playhead.

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

// One word for where the needle sits, so the dial is readable before the
// numbers are: the tag repeats the needle's colour in plain language.
function paceTag(pace, selected) {
  if (selected == null || selected.seconds == null) return { tone: 'neutral', label: 'No reading' };
  if (selected.flag === 'Yellow') return { tone: 'caution', label: 'Caution lap' };
  if (pace.needle.tone === 'pace') return { tone: 'pace', label: 'On the pace' };
  if (pace.needle.tone === 'caution') return { tone: 'caution', label: 'Losing time' };
  return { tone: 'neutral', label: 'Mid-range' };
}

// The momentum scale gets a dead band around zero: inside it the margin moved
// less than the reading is worth, which is the same threshold the Race Control
// bar uses before it calls a trend at all.
const MOMENTUM_DEAD_BAND = 0.05;

const RaceInstruments = memo(function RaceInstruments({ pace, momentum }) {
  const selected = pace?.selected ?? null;
  const fastest = pace?.fastest ?? null;

  const paceReadout = selected?.seconds != null ? formatLapSeconds(selected.seconds) : '--';
  const paceSub = selected == null
    ? 'No timing for this lap'
    : selected.seconds == null
      ? 'No timed lap at this lap'
      : selected.deltaToFastest == null || selected.deltaToFastest <= 0
        ? (pace.isFinished ? 'Fastest lap of the race' : 'Fastest lap so far')
        : `+${selected.deltaToFastest.toFixed(3)}s vs fastest`;
  const paceTagState = pace == null
    ? { tone: 'neutral', label: 'Awaiting laps' }
    : paceTag(pace, selected);

  const momentumTone = momentum?.tone ?? 'neutral';
  const momentumSpan = momentum?.span ?? 0;
  const momentumValue = momentum?.delta ?? null;

  return (
    <CollapsiblePanel
      className="ttv-instruments"
      ariaLabel="Race instruments"
      title="Race Instruments"
      sub="Where the current lap sits and which way the margin is moving"
      aside={(
        <span className="pill pill-gray">
          {pace == null
            ? 'Awaiting laps'
            : pace.totalLaps > 0
              ? `${pace.runLaps} of ${pace.totalLaps} laps run`
              : countLabel(pace.runLaps, 'lap') + ' run'}
        </span>
      )}
    >
      <div className="ttv-instrument-grid">
        {/* Pace: fast at the left of the scale, slow at the right, with the
            selected lap's needle sitting exactly where its time falls. */}
        <div className={`ttv-instrument ttv-instrument-pace is-${paceTagState.tone}`}>
          <div className="ttv-instrument-head">
            <span className="ttv-instrument-title">Pace Trend</span>
            <span className={`ttv-instrument-tag is-${paceTagState.tone}`}>{paceTagState.label}</span>
          </div>

          <GaugeDial
            min={pace?.needle.min}
            max={pace?.needle.max}
            value={pace?.needle.value}
            bands={pace?.bands ?? []}
            tone={pace?.needle.tone ?? 'neutral'}
            caption={selected == null ? 'Selected lap' : `Lap ${selected.lap}`}
            readout={paceReadout}
            sub={paceSub}
            minLabel="FASTER"
            maxLabel="SLOWER"
            ariaLabel={pace == null || selected?.seconds == null
              ? 'Pace gauge with no reading for the selected lap'
              : `Pace gauge: lap ${selected.lap} at ${formatLapSeconds(selected.seconds)}, fastest lap so far ${fastest.lap} at ${formatLapSeconds(fastest.seconds)}`}
          />

          <div className="ttv-readouts">
            <div className="ttv-readout">
              <span className="ttv-readout-label">Fastest lap</span>
              <span className="ttv-readout-value mono">
                {fastest == null ? '--' : formatLapSeconds(fastest.seconds)}
              </span>
              <span className="ttv-readout-sub">
                {fastest == null ? '--' : `lap ${fastest.lap}`}
              </span>
            </div>
            <div className="ttv-readout">
              <span className="ttv-readout-label">Average lap</span>
              <span className="ttv-readout-value mono">
                {pace == null ? '--' : formatLapSeconds(pace.averageSeconds)}
              </span>
              <span className="ttv-readout-sub">
                {pace == null ? '--' : countLabel(pace.timedLaps, 'timed lap')}
              </span>
            </div>
            <div className="ttv-readout">
              <span className="ttv-readout-label">Green average</span>
              <span className="ttv-readout-value mono">
                {pace?.greenAverageSeconds == null ? '--' : formatLapSeconds(pace.greenAverageSeconds)}
              </span>
              <span className="ttv-readout-sub">
                {pace == null ? '--' : countLabel(pace.greenLaps, 'green-flag lap')}
              </span>
            </div>
          </div>
        </div>

        {/* Momentum: a centre-zero speedometer. Right of centre the leader is
            stretching the margin, left of centre it is being pulled in, and the
            scale is the widest swing the race has already shown. */}
        <div className={`ttv-instrument ttv-instrument-momentum is-${momentumTone}`}>
          <div className="ttv-instrument-head">
            <span className="ttv-instrument-title">Momentum</span>
            <span className={`ttv-instrument-tag is-${momentumTone}`}>
              {momentum?.label ?? 'Awaiting laps'}
            </span>
          </div>

          {momentum == null ? (
            <p className="ttv-instrument-blank">
              No published margin yet. The speedometer wakes on the first lap the broadcast
              times against the lap before it.
            </p>
          ) : (
            <>
              <GaugeDial
                min={-momentumSpan}
                max={momentumSpan}
                value={momentumValue}
                bands={[
                  { from: -momentumSpan, to: -MOMENTUM_DEAD_BAND, tone: 'caution' },
                  { from: -MOMENTUM_DEAD_BAND, to: MOMENTUM_DEAD_BAND, tone: 'neutral' },
                  { from: MOMENTUM_DEAD_BAND, to: momentumSpan, tone: 'pace' },
                ]}
                tone={momentumTone}
                caption="Margin to P2"
                readout={momentum.readout}
                sub={momentum.detail}
                minLabel="PRESSURE"
                maxLabel="PULLING"
                ariaLabel={momentum.delta == null
                  ? `Momentum speedometer holding steady, margin ${formatGapSeconds(momentum.current?.gap ?? 0)}`
                  : `Momentum speedometer: ${momentum.label.toLowerCase()}, margin moved ${momentum.readout} on lap ${momentum.lap}`}
              />
              {momentum.samples.length > 0 && (
                <p className="ttv-instrument-note">
                  Widest swing so far: {formatGapSeconds(Math.abs(momentum.peakDelta))}
                  {momentum.peakLap == null ? '' : ` on lap ${momentum.peakLap}`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* The evidence behind the pace needle: one bar per lap already run. */}
      {pace != null && pace.bars.length > 0 && (
        <div className="ttv-pace-strip">
          <div className="ttv-strip-head">
            <span className="ttv-strip-title">Lap by lap</span>
            <span className="ttv-strip-sub">
              Leader lap time — taller is faster, the cursor sits on the selected lap
            </span>
          </div>

          <div
            className="pace-chart"
            role="img"
            aria-label={`Lap-by-lap pace for ${pace.runLaps} of ${pace.totalLaps} laps, fastest lap ${fastest.lap} at ${formatLapSeconds(fastest.seconds)}`}
          >
            <div className="pace-bars">
              {pace.bars.map((bar) => (
                <span
                  key={bar.lap}
                  className={['pace-bar', bar.isFastest ? 'fastest' : ''].filter(Boolean).join(' ')}
                  data-flag={bar.flag ?? undefined}
                  style={{ height: `${bar.percent}%` }}
                  title={[
                    `Lap ${bar.lap}`,
                    formatLapSeconds(bar.seconds),
                    bar.speedMph == null ? null : `${bar.speedMph.toFixed(1)} mph`,
                    bar.gapToLeaderSec == null ? null : `margin ${formatGapSeconds(bar.gapToLeaderSec)}`,
                    bar.flag,
                  ].filter(Boolean).join(' · ')}
                />
              ))}
            </div>
            <span className="pace-cursor" style={{ left: `${pace.cursorPercent}%` }} />
          </div>

          <div className="pace-legend">
            <span><i className="pace-legend-swatch flag-green" />Green flag</span>
            <span><i className="pace-legend-swatch flag-yellow" />Caution</span>
            <span><i className="pace-legend-swatch flag-checker" />Checkered</span>
            <span><i className="pace-legend-swatch is-fastest" />Fastest lap</span>
            <span><i className="pace-legend-swatch is-cursor" />Selected lap</span>
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
});

export default RaceInstruments;
