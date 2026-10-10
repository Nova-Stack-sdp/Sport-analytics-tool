import { memo } from 'react';

// One hand-rolled dial serves both instruments: the pace gauge (fast at the
// left end, slow at the right) and the momentum speedometer (under pressure at
// the left, pulling away at the right). The page draws every chart by hand —
// no charting library — and this keeps both dials sharing one geometry, one
// tick rhythm and one set of colour bands from the scoped stylesheet.
//
// 0° points right and the scale sweeps clockwise, so the dial opens at the
// bottom: the banded scale runs from the lower left, over the top, to the
// lower right (a 240° sweep), leaving the bottom 120° for the readout.

const CX = 100;
const CY = 104;
const BAND_RADIUS = 82;
const TICK_OUTER = 74;
const TICK_INNER = 67;
const NEEDLE_LENGTH = 62;
const START_ANGLE = 150;
const SWEEP = 240;
const TICKS = 12;

function pointAt(radius, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Number((CX + radius * Math.cos(radians)).toFixed(2)),
    y: Number((CY + radius * Math.sin(radians)).toFixed(2)),
  };
}

function arcPath(radius, fromDegrees, toDegrees) {
  const start = pointAt(radius, fromDegrees);
  const end = pointAt(radius, toDegrees);
  const largeArc = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function angleFor(fraction) {
  return START_ANGLE + Math.max(0, Math.min(1, fraction)) * SWEEP;
}

const GaugeDial = memo(function GaugeDial({
  min,
  max,
  value,
  bands = [],
  tone = 'neutral',
  caption,
  readout,
  sub,
  minLabel,
  maxLabel,
  ariaLabel,
}) {
  const hasScale = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const hasReading = hasScale && value != null && Number.isFinite(Number(value));
  const fraction = hasReading ? (value - min) / (max - min) : 0;
  const angle = hasReading ? angleFor(fraction) : START_ANGLE;
  const zeroFraction = hasScale && min < 0 && max > 0 ? -min / (max - min) : null;

  return (
    <div className={`ttv-dial is-${tone}${hasReading ? '' : ' is-empty'}`}>
      <svg
        className="ttv-dial-face"
        viewBox="0 0 200 156"
        role="img"
        aria-label={ariaLabel}
      >
        {hasScale && bands.map((band) => {
          const from = angleFor((band.from - min) / (max - min));
          const to = angleFor((band.to - min) / (max - min));
          if (to - from < 0.4) return null;
          return (
            <path
              key={`${band.tone}-${band.from}`}
              className={`ttv-dial-band is-${band.tone}`}
              d={arcPath(BAND_RADIUS, from, to)}
            />
          );
        })}

        {/* The scale's own graduation: the needle's colour is only meaningful
            because the banded track underneath it is visible. */}
        {Array.from({ length: TICKS + 1 }, (unused, index) => {
          const tickAngle = START_ANGLE + (index / TICKS) * SWEEP;
          const outer = pointAt(TICK_OUTER, tickAngle);
          const inner = pointAt(index % 3 === 0 ? TICK_INNER - 4 : TICK_INNER, tickAngle);
          return (
            <line
              key={tickAngle}
              className={`ttv-dial-tick${index % 3 === 0 ? ' is-major' : ''}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          );
        })}

        {zeroFraction != null && (
          <line
            className="ttv-dial-zero"
            x1={pointAt(TICK_INNER - 8, angleFor(zeroFraction)).x}
            y1={pointAt(TICK_INNER - 8, angleFor(zeroFraction)).y}
            x2={pointAt(TICK_OUTER, angleFor(zeroFraction)).x}
            y2={pointAt(TICK_OUTER, angleFor(zeroFraction)).y}
          />
        )}

        <g
          className="ttv-dial-needle"
          style={{ transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: `${CX}px ${CY}px` }}
        >
          <line
            className="ttv-dial-needle-blade"
            x1={CX - 10}
            y1={CY}
            x2={CX + NEEDLE_LENGTH}
            y2={CY}
          />
        </g>
        <circle className="ttv-dial-hub" cx={CX} cy={CY} r="8" />
        <circle className="ttv-dial-hub-core" cx={CX} cy={CY} r="2.6" />

        {minLabel && <text className="ttv-dial-end is-min" x="18" y="150">{minLabel}</text>}
        {maxLabel && <text className="ttv-dial-end is-max" x="182" y="150">{maxLabel}</text>}
      </svg>

      <div className="ttv-dial-copy">
        <span className="ttv-dial-readout mono">{readout}</span>
        {caption && <span className="ttv-dial-caption">{caption}</span>}
        {sub && <span className="ttv-dial-sub">{sub}</span>}
      </div>
    </div>
  );
});

export default GaugeDial;
