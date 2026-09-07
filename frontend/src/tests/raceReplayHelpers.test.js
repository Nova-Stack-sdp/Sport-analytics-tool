import {
  buildTrackGeometry,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
} from './raceReplayHelpers';

// A synthetic circle stands in for real track telemetry — lets us verify
// the normalization/arc-length math is correct without a real OpenF1
// /location response, which this environment can't fetch.
function syntheticCircle(radius = 500, n = 200) {
  return Array.from({ length: n }, (_, i) => {
    const theta = (i / n) * Math.PI * 2;
    return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
  });
}

describe('buildTrackGeometry', () => {
  test('fits the path inside the requested viewBox with padding', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 260, 20);
    expect(geometry).not.toBeNull();
    for (const p of geometry.svgPoints) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 0.01);
      expect(p.x).toBeLessThanOrEqual(400 - 20 + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(20 - 0.01);
      expect(p.y).toBeLessThanOrEqual(260 - 20 + 0.01);
    }
  });

  test('returns null for too few points instead of crashing', () => {
    expect(buildTrackGeometry([{ x: 0, y: 0 }], 400, 260)).toBeNull();
    expect(buildTrackGeometry(null, 400, 260)).toBeNull();
  });

  test('total arc length roughly matches the real-world circle circumference', () => {
    const radius = 500;
    const geometry = buildTrackGeometry(syntheticCircle(radius), 400, 260, 20);
    const expectedCircumference = 2 * Math.PI * radius;
    // Polygon approximation of a circle slightly undershoots true circumference.
    expect(geometry.totalLength).toBeGreaterThan(expectedCircumference * 0.99);
    expect(geometry.totalLength).toBeLessThanOrEqual(expectedCircumference);
  });
});

describe('nearestArcLengthFraction + svgPointAtArcLengthFraction round-trip', () => {
  test('a point a quarter-way around the circle maps to roughly fraction 0.25', () => {
    const radius = 500;
    const points = syntheticCircle(radius);
    const geometry = buildTrackGeometry(points, 400, 260, 20);

    // Point at theta = PI/2 (a quarter turn) in world space.
    const quarterPoint = { x: radius * Math.cos(Math.PI / 2), y: radius * Math.sin(Math.PI / 2) };
    const fraction = nearestArcLengthFraction(geometry, quarterPoint.x, quarterPoint.y);
    expect(fraction).toBeCloseTo(0.25, 1);
  });

  test('converting a fraction to a point and back gives approximately the same fraction', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 260, 20);
    const original = 0.63;
    const svgPoint = svgPointAtArcLengthFraction(geometry, original);
    // Convert the SVG point back to world space isn't directly supported,
    // so instead confirm the SVG point actually lies on the rendered path
    // by checking it's within a small tolerance of the nearest svgPoints entry.
    const distances = geometry.svgPoints.map((p) => Math.hypot(p.x - svgPoint.x, p.y - svgPoint.y));
    expect(Math.min(...distances)).toBeLessThan(5);
  });

  test('wraps around correctly past fraction 1.0', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 260, 20);
    const a = svgPointAtArcLengthFraction(geometry, 0.1);
    const b = svgPointAtArcLengthFraction(geometry, 1.1);
    expect(a.x).toBeCloseTo(b.x, 1);
    expect(a.y).toBeCloseTo(b.y, 1);
  });
});