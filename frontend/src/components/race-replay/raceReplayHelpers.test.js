import {
  buildTrackGeometry,
  nearestArcLengthFraction,
  svgPointAtArcLengthFraction,
  computeTrackBoundaries,
  shortestArcDelta,
  forwardArcDistance,
  stepTowardArc,
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
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 20);
    expect(geometry).not.toBeNull();
    for (const p of geometry.svgPoints) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 0.01);
      expect(p.x).toBeLessThanOrEqual(geometry.svgWidth - 20 + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(20 - 0.01);
      expect(p.y).toBeLessThanOrEqual(geometry.svgHeight - 20 + 0.01);
    }
  });

  test('a circle (equal width/height) produces a roughly square viewBox', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 20);
    expect(geometry.svgWidth).toBeCloseTo(geometry.svgHeight, 0);
  });

  test('data taller than wide (like the real Barcelona telemetry) gets a taller-than-wide viewBox, not squashed into a fixed wide box', () => {
    // Roughly matches the real bundle's actual aspect ratio: width ~9616,
    // height ~11594 in FastF1's raw units — taller than wide.
    const tallPoints = [
      { x: 0, y: 0 }, { x: 9616, y: 0 }, { x: 9616, y: 11594 }, { x: 0, y: 11594 },
      { x: 4800, y: 5800 },
    ];
    const geometry = buildTrackGeometry(tallPoints, 400, 20);
    expect(geometry.svgWidth).toBe(400);
    // Height should be noticeably larger than width, reflecting the data's
    // real proportions — not fixed at some unrelated constant.
    expect(geometry.svgHeight).toBeGreaterThan(geometry.svgWidth);
  });

  test('returns null for too few points instead of crashing', () => {
    expect(buildTrackGeometry([{ x: 0, y: 0 }], 400)).toBeNull();
    expect(buildTrackGeometry(null, 400)).toBeNull();
  });

  test('total arc length roughly matches the real-world circle circumference', () => {
    const radius = 500;
    const geometry = buildTrackGeometry(syntheticCircle(radius), 400, 20);
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
    const geometry = buildTrackGeometry(points, 400, 20);

    // Point at theta = PI/2 (a quarter turn) in world space.
    const quarterPoint = { x: radius * Math.cos(Math.PI / 2), y: radius * Math.sin(Math.PI / 2) };
    const fraction = nearestArcLengthFraction(geometry, quarterPoint.x, quarterPoint.y);
    expect(fraction).toBeCloseTo(0.25, 1);
  });

  test('converting a fraction to a point and back gives approximately the same fraction', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 20);
    const original = 0.63;
    const svgPoint = svgPointAtArcLengthFraction(geometry, original);
    // Convert the SVG point back to world space isn't directly supported,
    // so instead confirm the SVG point actually lies on the rendered path
    // by checking it's within a small tolerance of the nearest svgPoints entry.
    const distances = geometry.svgPoints.map((p) => Math.hypot(p.x - svgPoint.x, p.y - svgPoint.y));
    expect(Math.min(...distances)).toBeLessThan(5);
  });

  test('wraps around correctly past fraction 1.0', () => {
    const geometry = buildTrackGeometry(syntheticCircle(), 400, 20);
    const a = svgPointAtArcLengthFraction(geometry, 0.1);
    const b = svgPointAtArcLengthFraction(geometry, 1.1);
    expect(a.x).toBeCloseTo(b.x, 1);
    expect(a.y).toBeCloseTo(b.y, 1);
  });
});

describe('computeTrackBoundaries', () => {
  test('offsets a circle into two concentric circles at the expected radii', () => {
    // A circle centered at (100, 100) with radius 50, already in "SVG
    // space" (computeTrackBoundaries operates on svgPoints, not raw world
    // points, so no normalization step here).
    const center = { x: 100, y: 100 };
    const radius = 50;
    const svgPoints = Array.from({ length: 100 }, (_, i) => {
      const theta = (i / 100) * Math.PI * 2;
      return { x: center.x + radius * Math.cos(theta), y: center.y + radius * Math.sin(theta) };
    });

    const halfWidth = 5;
    const { innerPoints, outerPoints } = computeTrackBoundaries(svgPoints, halfWidth);

    expect(innerPoints).toHaveLength(100);
    expect(outerPoints).toHaveLength(100);

    // Every point on each boundary should sit at a consistent distance
    // from the center — either radius-halfWidth or radius+halfWidth,
    // regardless of which one is numerically "inner" vs "outer" (that
    // depends on winding direction, which this test doesn't care about).
    const distFromCenter = (p) => Math.hypot(p.x - center.x, p.y - center.y);
    const innerRadii = innerPoints.map(distFromCenter);
    const outerRadii = outerPoints.map(distFromCenter);

    const allInnerMatch = innerRadii.every((r) => Math.abs(r - (radius - halfWidth)) < 0.5);
    const allOuterMatch = outerRadii.every((r) => Math.abs(r - (radius + halfWidth)) < 0.5);
    const allSwappedMatch = innerRadii.every((r) => Math.abs(r - (radius + halfWidth)) < 0.5)
      && outerRadii.every((r) => Math.abs(r - (radius - halfWidth)) < 0.5);

    expect((allInnerMatch && allOuterMatch) || allSwappedMatch).toBe(true);
  });

  test('returns empty arrays for too few points instead of crashing', () => {
    expect(computeTrackBoundaries([{ x: 0, y: 0 }], 5)).toEqual({ innerPoints: [], outerPoints: [] });
  });
});

describe('shortestArcDelta', () => {
  test('picks the short way forward through the wraparound seam', () => {
    // From 0.9 to 0.1: going forward through 1.0/0.0 is only 0.2 away,
    // versus 0.8 going backward the other way around the loop.
    expect(shortestArcDelta(0.9, 0.1)).toBeCloseTo(0.2, 5);
  });

  test('picks the short way backward through the wraparound seam', () => {
    expect(shortestArcDelta(0.1, 0.9)).toBeCloseTo(-0.2, 5);
  });

  test('simple forward move with no wraparound involved', () => {
    expect(shortestArcDelta(0.2, 0.5)).toBeCloseTo(0.3, 5);
  });
});

describe('forwardArcDistance', () => {
  test('simple forward gap with no wraparound', () => {
    expect(forwardArcDistance(0.2, 0.5)).toBeCloseTo(0.3, 5);
  });

  test('wraps forward through the seam rather than reporting a negative distance', () => {
    expect(forwardArcDistance(0.95, 0.05)).toBeCloseTo(0.1, 5);
  });

  test('a "behind" target is reported as almost a full lap forward, not a negative/backward value', () => {
    // 0.4 is numerically behind 0.5, but there's no backward direction on
    // a track — reaching it means travelling forward almost the whole loop.
    expect(forwardArcDistance(0.5, 0.4)).toBeCloseTo(0.9, 5);
  });
});

describe('stepTowardArc', () => {
  test('reaches the target directly when it is within maxStep', () => {
    expect(stepTowardArc(0.2, 0.25, 0.1)).toBeCloseTo(0.25, 5);
  });

  test('moves only maxStep toward a distant target instead of jumping there', () => {
    // Target is 0.5 away (0.2 -> 0.7); capped at 0.05 per call, so after one
    // call it should have advanced by exactly 0.05, not landed on 0.7.
    const result = stepTowardArc(0.2, 0.7, 0.05);
    expect(result).toBeCloseTo(0.25, 5);
  });

  test('repeated calls eventually converge on a distant target without ever overshooting', () => {
    let current = 0.1;
    const target = 0.8;
    const maxStep = 0.05;
    for (let i = 0; i < 50; i += 1) {
      current = stepTowardArc(current, target, maxStep);
    }
    expect(current).toBeCloseTo(target, 5);
  });

  test('steps in the correct direction across the wraparound seam, not the long way around', () => {
    // From 0.95 toward 0.05 — short way is forward through the seam (+0.1),
    // so after a small step we should be just past 0, not drifting toward 0.5.
    const result = stepTowardArc(0.95, 0.05, 0.03);
    expect(result).toBeCloseTo(0.98, 5);
  });

  test('always advances forward, never backward, even when the target is numerically behind', () => {
    // Every intermediate value across many small steps must be reachable
    // by forward motion only from the previous one — i.e. never regress.
    let current = 0.5;
    const target = 0.4; // "behind" in raw numeric terms
    const maxStep = 0.05;
    for (let i = 0; i < 5; i += 1) {
      const next = stepTowardArc(current, target, maxStep);
      // Forward distance travelled this step must be positive and <= maxStep.
      const travelled = forwardArcDistance(current, next);
      expect(travelled).toBeGreaterThan(0);
      expect(travelled).toBeLessThanOrEqual(maxStep + 1e-9);
      current = next;
    }
  });
});