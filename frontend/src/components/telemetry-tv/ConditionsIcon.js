import { memo } from 'react';

// The conditions reading, as one glyph beside the race title: the state of the
// sky the curator's own note names, in the page's environment tone.
//
// The glyph is hand-drawn from primitives (the page owns every icon it draws)
// and only ever shows a sky the note actually states — a note that names no sky
// renders the neutral cloud rather than a sun guessed from a dry-sounding
// sentence. The read and its source ride along in the accessible name and the
// tooltip, so the icon is a summary of a sentence that is still there to read,
// never a sensor. No conditions in the broadcast means no glyph at all.

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function Sun({ centre = 24, radius = 9, rayAngles = RAY_ANGLES }) {
  return (
    <g className="ttv-sky-sun">
      <circle cx={centre} cy={centre} r={radius} />
      {rayAngles.map((angle) => {
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return (
          <line
            key={angle}
            x1={Number((centre + cos * (radius + 4)).toFixed(2))}
            y1={Number((centre + sin * (radius + 4)).toFixed(2))}
            x2={Number((centre + cos * (radius + 9)).toFixed(2))}
            y2={Number((centre + sin * (radius + 9)).toFixed(2))}
          />
        );
      })}
    </g>
  );
}

// A cloud drawn as overlapping discs on a rounded base — no arc flags to get
// subtly wrong, and it scales with the icon.
function Cloud({ offsetX = 0, offsetY = 0 }) {
  return (
    <g className="ttv-sky-cloud" transform={`translate(${offsetX} ${offsetY})`}>
      <circle cx="17" cy="26" r="8" />
      <circle cx="27" cy="23" r="10" />
      <circle cx="36" cy="27" r="7" />
      <rect x="9" y="25" width="28" height="9" rx="4.5" />
    </g>
  );
}

// The glyph itself is decorative: the wrapper span carries the accessible name,
// so the drawing is hidden from assistive tech rather than named twice.
function ConditionsGlyph({ sky }) {
  if (sky === 'dry') {
    return (
      <svg className="ttv-weather-glyph" viewBox="0 0 48 48" aria-hidden="true">
        <Sun />
      </svg>
    );
  }

  if (sky === 'mixed') {
    return (
      <svg className="ttv-weather-glyph" viewBox="0 0 48 48" aria-hidden="true">
        <Sun centre={16} radius={6} rayAngles={[180, 225, 270]} />
        <Cloud offsetX={2} offsetY={4} />
      </svg>
    );
  }

  if (sky === 'wet') {
    return (
      <svg className="ttv-weather-glyph" viewBox="0 0 48 48" aria-hidden="true">
        <Cloud />
        <g className="ttv-sky-rain">
          <line x1="18" y1="37" x2="16" y2="44" />
          <line x1="25" y1="37" x2="23" y2="44" />
          <line x1="32" y1="37" x2="30" y2="44" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="ttv-weather-glyph is-plain" viewBox="0 0 48 48" aria-hidden="true">
      <Cloud />
    </svg>
  );
}

const ConditionsIcon = memo(function ConditionsIcon({ conditions }) {
  if (!conditions) return null;

  const label = `${conditions.source}: ${conditions.summary}${conditions.note ? ` — ${conditions.note}` : ''}`;

  return (
    <span className="ttv-weather" role="img" aria-label={label} title={label}>
      <ConditionsGlyph sky={conditions.sky.key} />
    </span>
  );
});

export default ConditionsIcon;
