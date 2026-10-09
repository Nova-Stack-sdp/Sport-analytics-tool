import { memo } from 'react';

// Race-day conditions for the header: one icon for the sky and a row of
// measured readings — air temperature, humidity, wind, rain and cloud — over
// the race window, from Open-Meteo's archive (see backend lib/raceWeather.js).
// Every figure is a measurement; with nothing measured the block isn't drawn,
// so the header never shows a conditions glyph with no reading behind it.
//
// The icons are drawn in one line weight on a 32px grid, so they sit with the
// page's other instruments: sun in the caution yellow, rain in the strategy
// blue, cloud in the page's own ink.

function Sun({ x = 16, y = 16, r = 5.5 }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g className="ttv-wx-sun">
      <circle cx={x} cy={y} r={r} />
      {rays.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <line
            key={angle}
            x1={x + Math.cos(rad) * (r + 3)}
            y1={y + Math.sin(rad) * (r + 3)}
            x2={x + Math.cos(rad) * (r + 6)}
            y2={y + Math.sin(rad) * (r + 6)}
          />
        );
      })}
    </g>
  );
}

const CLOUD_PATH = 'M9 25h15a5 5 0 0 0 .6-9.96A7 7 0 0 0 11.2 13.6 5.7 5.7 0 0 0 9 25z';

function Cloud({ dy = 0 }) {
  return <path className="ttv-wx-cloud" d={CLOUD_PATH} transform={`translate(0 ${dy})`} />;
}

function Drops({ count = 3, short = false }) {
  const xs = count === 2 ? [13, 20] : [11, 16.5, 22];
  return (
    <g className="ttv-wx-rain">
      {xs.map((x) => (
        <line key={x} x1={x} y1={short ? 26 : 25.5} x2={x - 1.5} y2={short ? 28.5 : 30} />
      ))}
    </g>
  );
}

function WeatherIcon({ kind }) {
  let art;
  switch (kind) {
    case 'clear':
      art = <Sun />;
      break;
    case 'partly-cloudy':
      art = (
        <>
          <Sun x={12} y={11} r={4.5} />
          <Cloud dy={1} />
        </>
      );
      break;
    case 'overcast':
      art = <Cloud dy={-2} />;
      break;
    case 'fog':
      art = (
        <g className="ttv-wx-cloud">
          <line x1="6" y1="12" x2="26" y2="12" />
          <line x1="4" y1="17" x2="28" y2="17" />
          <line x1="7" y1="22" x2="25" y2="22" />
        </g>
      );
      break;
    case 'drizzle':
      art = (
        <>
          <Cloud dy={-5} />
          <Drops count={2} short />
        </>
      );
      break;
    case 'storm':
      art = (
        <>
          <Cloud dy={-5} />
          <path className="ttv-wx-bolt" d="M17 21l-3 5h3l-2 4.5" />
        </>
      );
      break;
    case 'snow':
      art = (
        <>
          <Cloud dy={-5} />
          <g className="ttv-wx-cloud">
            <circle cx="12" cy="27" r="0.9" />
            <circle cx="17" cy="28.5" r="0.9" />
            <circle cx="22" cy="27" r="0.9" />
          </g>
        </>
      );
      break;
    default:
      // rain
      art = (
        <>
          <Cloud dy={-5} />
          <Drops />
        </>
      );
  }
  return (
    <svg className="ttv-wx-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}

const toF = (celsius) => Math.round((celsius * 9) / 5 + 32);

function Reading({ label, value, unit, note }) {
  return (
    <div className="ttv-wx-reading">
      <dt>{label}</dt>
      <dd>
        <span className="ttv-wx-value mono">{value}</span>
        {unit && <span className="ttv-wx-unit">{unit}</span>}
        {note && <span className="ttv-wx-note">{note}</span>}
      </dd>
    </div>
  );
}

const RaceWeather = memo(function RaceWeather({ weather }) {
  if (!weather || !Number.isFinite(weather.airTemperatureC)) return null;
  const condition = weather.condition ?? { key: 'overcast', label: 'Conditions' };
  const window = weather.window ?? {};
  const [low, high] = weather.airTemperatureRangeC ?? [];

  return (
    <section className="ttv-wx" aria-label="Race-day weather">
      <div
        className={`ttv-wx-sky is-${condition.key}`}
        role="img"
        aria-label={`${condition.label}, ${weather.airTemperatureC} degrees Celsius`}
      >
        <WeatherIcon kind={condition.key} />
        <div className="ttv-wx-sky-text">
          <span className="ttv-wx-eyebrow">Race-day weather</span>
          <span className="ttv-wx-condition">{condition.label}</span>
        </div>
      </div>

      <dl className="ttv-wx-readings">
        <Reading
          label="Air"
          value={weather.airTemperatureC.toFixed(1)}
          unit="°C"
          note={
            Number.isFinite(low) && Number.isFinite(high) && low !== high
              ? `${low.toFixed(0)}–${high.toFixed(0)} °C · ${toF(weather.airTemperatureC)} °F`
              : `${toF(weather.airTemperatureC)} °F`
          }
        />
        {Number.isFinite(weather.humidityPct) && (
          <Reading label="Humidity" value={weather.humidityPct} unit="%" />
        )}
        {Number.isFinite(weather.windSpeedKmh) && (
          <Reading
            label="Wind"
            value={weather.windSpeedKmh.toFixed(0)}
            unit="km/h"
            note={weather.windCompass ? `from ${weather.windCompass}` : null}
          />
        )}
        {Number.isFinite(weather.precipitationMm) && (
          <Reading
            label="Rain"
            value={weather.precipitationMm.toFixed(1)}
            unit="mm"
            note={weather.precipitationMm === 0 ? 'dry' : null}
          />
        )}
        {Number.isFinite(weather.cloudCoverPct) && (
          <Reading label="Cloud" value={weather.cloudCoverPct} unit="%" />
        )}
      </dl>

      <p className="ttv-wx-source">
        {window.from && window.to ? `${window.from}–${window.to} local` : 'Race day'}
        {window.date ? ` · ${window.date}` : ''} ·{' '}
        <a href={weather.source?.url ?? 'https://open-meteo.com'} target="_blank" rel="noreferrer">
          {weather.source?.name ?? 'Open-Meteo'}
        </a>
      </p>
    </section>
  );
});

export default RaceWeather;
