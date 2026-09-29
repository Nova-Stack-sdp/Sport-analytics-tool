import { planAggregates } from "./rebuild.js";

// Two teammates (a, b) and a third driver (c) across one Grand Prix and one
// Sprint in 2025, plus a 2024 Grand Prix for a and b.
const entries = [
  { id: "e1", driverId: "a", teamId: "t1", sessionId: "gp25", sessionType: "Race", season: 2025 },
  { id: "e2", driverId: "b", teamId: "t1", sessionId: "gp25", sessionType: "Race", season: 2025 },
  { id: "e3", driverId: "c", teamId: "t2", sessionId: "gp25", sessionType: "Race", season: 2025 },
  { id: "e4", driverId: "a", teamId: "t1", sessionId: "sp25", sessionType: "Sprint", season: 2025 },
  { id: "e5", driverId: "b", teamId: "t1", sessionId: "sp25", sessionType: "Sprint", season: 2025 },
  { id: "e6", driverId: "a", teamId: "t0", sessionId: "gp24", sessionType: "Race", season: 2024 },
  { id: "e7", driverId: "b", teamId: "t0", sessionId: "gp24", sessionType: "Race", season: 2024 },
];
const classification = new Map([
  ["e1", { finalPosition: 2, points: 18, status: "finished" }],
  ["e2", { finalPosition: null, points: 0, status: "dnf" }],
  ["e3", { finalPosition: 1, points: 25, status: "finished" }],
  ["e4", { finalPosition: 1, points: 8, status: "finished" }],
  ["e5", { finalPosition: 2, points: 7, status: "finished" }],
  ["e6", { finalPosition: 5, points: 10, status: "finished" }],
  ["e7", { finalPosition: 3, points: 15, status: "finished" }],
]);

const find = (rows, match) => rows.find((r) => Object.entries(match).every(([k, v]) => r[k] === v));

describe("planAggregates (bulk rebuild)", () => {
  const plan = planAggregates(entries, classification);

  test("one row per driver-season, sprint points counted, sprint wins not", () => {
    expect(plan.careerStats).toHaveLength(5);
    expect(find(plan.careerStats, { driverId: "a", season: 2025 })).toEqual({
      driverId: "a", season: 2025, wins: 0, podiums: 1, points: 26, dnfCount: 0,
    });
    expect(find(plan.careerStats, { driverId: "b", season: 2025 })).toEqual({
      driverId: "b", season: 2025, wins: 0, podiums: 0, points: 7, dnfCount: 1,
    });
  });

  test("team rows per team-season, reliability over Grands Prix", () => {
    expect(find(plan.teamStats, { teamId: "t1", season: 2025 })).toEqual({
      teamId: "t1", season: 2025, wins: 0, points: 33, reliabilityRate: 0.5,
    });
    expect(plan.teamStats).toHaveLength(3);
  });

  test("head-to-head for teammates only, counted over every shared Grand Prix", () => {
    expect(plan.headToHead).toEqual([
      // gp25: a P2 vs b DNF (skipped, no position); gp24: b P3 beats a P5
      { subjectAId: "a", subjectBId: "b", subjectType: "driver", winsA: 0, winsB: 1, sampleSize: 1 },
    ]);
  });

  test("an entry without a classification still gets a zero row", () => {
    const partial = planAggregates(entries, new Map());
    expect(find(partial.careerStats, { driverId: "c", season: 2025 })).toEqual({
      driverId: "c", season: 2025, wins: 0, podiums: 0, points: 0, dnfCount: 0,
    });
  });
});
