import MONZA_TRACK_POINTS from './raceSyncDemoTrack';
import monzaAerial from '../../assets/racesync/monza-aerial.png';

// The RaceSync centre stage — the circuit map the replay runs on. Everything
// here is demo-shaped for now: the trace is a read-only copy of the shared
// Monza track shape, the field is the 2021 grid parked at fixed lap
// fractions, and the sector/DRS markers are placeholders until the real
// per-circuit metadata lands. When the replay wiring arrives, the car layer
// below is what animates lap by lap.

// Fixed lap fractions for the demo snapshot — deliberately uneven (teammates
// paired, a spread tail) so the field reads like a real race instead of a fan.
const DEMO_FIELD = [
  { code: 'VER', name: 'Verstappen', color: '#1E41FF', at: 0.982 },
  { code: 'HAM', name: 'Hamilton', color: '#00D2BE', dark: true, at: 0.964 },
  { code: 'BOT', name: 'Bottas', color: '#00D2BE', dark: true, at: 0.928 },
  { code: 'LEC', name: 'Leclerc', color: '#DC0000', at: 0.915 },
  { code: 'SAI', name: 'Sainz', color: '#DC0000', at: 0.877 },
  { code: 'NOR', name: 'Norris', color: '#FF8700', dark: true, at: 0.859 },
  { code: 'PER', name: 'Pérez', color: '#1E41FF', at: 0.841 },
  { code: 'GAS', name: 'Gasly', color: '#2B4562', at: 0.793 },
  { code: 'OCO', name: 'Ocon', color: '#0090FF', at: 0.776 },
  { code: 'RIC', name: 'Ricciardo', color: '#FF8700', dark: true, at: 0.757 },
  { code: 'ALO', name: 'Alonso', color: '#0090FF', at: 0.711 },
  { code: 'TSU', name: 'Tsunoda', color: '#2B4562', at: 0.694 },
  { code: 'VET', name: 'Vettel', color: '#006F62', at: 0.642 },
  { code: 'STR', name: 'Stroll', color: '#006F62', at: 0.624 },
  { code: 'MSC', name: 'Schumacher', color: '#DBDBDB', dark: true, at: 0.553 },
  { code: 'LAT', name: 'Latifi', color: '#005AFF', at: 0.536 },
  { code: 'RUS', name: 'Russell', color: '#005AFF', at: 0.472 },
  { code: 'MAZ', name: 'Mazepin', color: '#DBDBDB', dark: true, at: 0.455 },
  { code: 'RAI', name: 'Räikkönen', color: '#900000', at: 0.316 },
  { code: 'GIO', name: 'Giovinazzi', color: '#900000', at: 0.297 },
];

// Demo placeholders — Monza does run two DRS zones, but their start/end
// distances are not part of the shared track shape, so these lap fractions
// are illustrative until the per-circuit metadata lands.
const DEMO_DRS_ZONES = [
  { from: 0.955, to: 0.075 },
  { from: 0.42, to: 0.476 },
];

// F1 splits the lap into three equal sectors; the chips sit just after each
// boundary (the trace itself starts at the start/finish line).
const DEMO_SECTORS = [
  { label: 'S1', at: 0.03 },
  { label: 'S2', at: 0.35 },
  { label: 'S3', at: 0.68 },
];

const round1 = (value) => Math.round(value * 10) / 10;

// Turns the raw trace into a renderable frame: rotated to landscape when the
// circuit is drawn taller than wide, y flipped (SVG grows downwards), padded
// to the edge, and exposed as arc-length helpers so cars, sector chips and
// DRS segments can all be placed by lap fraction.
function buildGeometry(rawPoints) {
  const bounds = (list) => {
    const xs = list.map(([x]) => x);
    const ys = list.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  // Several circuits (Monza included) trace taller than wide, which would
  // force a vertical stage; those get rotated 90° so the map always reads
  // horizontally and resizes to fit instead of stretching downwards.
  const raw = bounds(rawPoints);
  const source =
    raw.maxY - raw.minY > raw.maxX - raw.minX
      ? rawPoints.map(([x, y]) => [y, -x])
      : rawPoints;
  const { minX, maxX, minY, maxY } = bounds(source);

  const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;

  const points = source.map(([x, y]) => [x - minX + pad, maxY - y + pad]);

  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  const total = cumulative[cumulative.length - 1] || 1;
  const wrap = (fraction) => ((fraction % 1) + 1) % 1;
  const toPath = (list) =>
    list.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round1(x)},${round1(y)}`).join(' ');

  const pointAt = (fraction) => {
    const target = wrap(fraction) * total;
    let index = 1;
    while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
    const spanStart = cumulative[index - 1];
    const spanLength = cumulative[index] - spanStart || 1;
    const t = (target - spanStart) / spanLength;
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  };

  // A sub-trace between two lap fractions, wrapping across the start line.
  const slicePath = (from, to) => {
    const start = wrap(from);
    const end = wrap(to);
    const ranges = end > start ? [[start, end]] : [[start, 1], [0, end]];
    const list = [];
    for (const [a, b] of ranges) {
      const steps = Math.max(2, Math.round((b - a) * 90));
      for (let i = 0; i <= steps; i += 1) {
        list.push(pointAt(a + ((b - a) * i) / steps));
      }
    }
    return toPath(list.map(({ x, y }) => [x, y]));
  };

  const percent = ({ x, y }) => ({
    left: `${round1((x / width) * 100)}%`,
    top: `${round1((y / height) * 100)}%`,
  });

  return {
    width,
    height,
    ratio: width / height,
    viewBox: `0 0 ${round1(width)} ${round1(height)}`,
    path: toPath(points),
    pointAt,
    slicePath,
    percent,
  };
}

const GEOMETRY = buildGeometry(MONZA_TRACK_POINTS);

const zoneMidpoint = ({ from, to }) => from + (((to - from + 1) % 1) / 2);

function RaceSyncTrackStage() {
  return (
    <section className="racesync-stage" aria-label="Circuit map and live positions">
      <header className="racesync-stage-head">
        <span className="racesync-stage-flag" aria-hidden="true">
          <svg viewBox="0 0 27 18" width="27" height="18">
            <rect width="9" height="18" fill="#009246" />
            <rect x="9" width="9" height="18" fill="#f4f5f0" />
            <rect x="18" width="9" height="18" fill="#ce2b37" />
          </svg>
        </span>
        <h2 className="racesync-stage-title">Monza</h2>
      </header>

      <div className="racesync-stage-body">
        <div className="racesync-stage-map-wrap">
          <div
            className="racesync-stage-map"
            style={{
              aspectRatio: `${GEOMETRY.width} / ${GEOMETRY.height}`,
              maxWidth: `calc(52vh * ${GEOMETRY.ratio})`,
            }}
          >
            <img className="racesync-stage-aerial" src={monzaAerial} alt="" />
            <svg className="racesync-stage-svg" viewBox={GEOMETRY.viewBox} aria-hidden="true">
              <path className="racesync-trace-shadow" d={GEOMETRY.path} />
              <path className="racesync-trace-line" d={GEOMETRY.path} />
              {DEMO_DRS_ZONES.map((zone) => (
                <path
                  key={`drs-${zone.from}`}
                  className="racesync-trace-drs"
                  d={GEOMETRY.slicePath(zone.from, zone.to)}
                />
              ))}
            </svg>

            {DEMO_SECTORS.map((sector) => (
              <span
                key={sector.label}
                className="racesync-stage-sector"
                style={GEOMETRY.percent(GEOMETRY.pointAt(sector.at))}
              >
                {sector.label}
              </span>
            ))}

            {DEMO_DRS_ZONES.map((zone) => (
              <span
                key={`drs-label-${zone.from}`}
                className="racesync-stage-drs-label"
                style={GEOMETRY.percent(GEOMETRY.pointAt(zoneMidpoint(zone)))}
              >
                DRS
              </span>
            ))}

            {DEMO_FIELD.map((driver) => (
              <span
                key={driver.code}
                className={`racesync-stage-car${driver.dark ? ' is-dark-text' : ''}`}
                style={{ ...GEOMETRY.percent(GEOMETRY.pointAt(driver.at)), '--car-color': driver.color }}
              >
                {driver.code}
              </span>
            ))}
          </div>
        </div>

        <ul className="racesync-stage-legend">
          {DEMO_FIELD.map((driver) => (
            <li key={driver.code} className="racesync-stage-legend-item">
              <span
                className="racesync-stage-legend-dot"
                style={{ background: driver.color }}
                aria-hidden="true"
              />
              <span className="racesync-stage-legend-code">{driver.code}</span>
              <span className="racesync-stage-legend-name">{driver.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default RaceSyncTrackStage;
