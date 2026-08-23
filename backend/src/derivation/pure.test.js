import {
  computeSessionStatsForEntry,
  computeCareerAggregate,
  computeSeasonAggregate,
  computeHeadToHead,
} from "./pure.js";

describe("computeSessionStatsForEntry", () => {
  test("fastest/avg lap ignore the pit-out lap", () => {
    const events = [
      { eventType: "lap_completed", lapNumber: 1, payload: { lap_time_ms: 95000, is_pit_out_lap: true, position: 5 } },
      { eventType: "lap_completed", lapNumber: 2, payload: { lap_time_ms: 90000, is_pit_out_lap: false, position: 4 } },
      { eventType: "lap_completed", lapNumber: 3, payload: { lap_time_ms: 91000, is_pit_out_lap: false, position: 4 } },
    ];
    const stats = computeSessionStatsForEntry(events);
    expect(stats.fastestLapMs).toBe(90000);
    expect(stats.avgLapMs).toBe(90500);
  });

  test("sums pit stop durations, defaults to 0 with no stops", () => {
    const noStops = computeSessionStatsForEntry([]);
    expect(noStops.totalPitTimeMs).toBe(0);

    const withStops = computeSessionStatsForEntry([
      { eventType: "pit_stop", payload: { pit_duration_ms: 2300 } },
      { eventType: "pit_stop", payload: { pit_duration_ms: 2100 } },
    ]);
    expect(withStops.totalPitTimeMs).toBe(4400);
  });

  test("positions gained = start position (from grid_position event) minus final position", () => {
    const events = [
      { eventType: "grid_position", payload: { position: 8 } },
      { eventType: "classification", payload: { final_position: 3, points: 15, status: "finished" } },
    ];
    const stats = computeSessionStatsForEntry(events);
    expect(stats.positionsGained).toBe(5);
    expect(stats.finalPosition).toBe(3);
    expect(stats.points).toBe(15);
  });

  test("positionsGained is null when there's no grid_position event, rather than guessed", () => {
    const events = [
      { eventType: "lap_completed", lapNumber: 1, payload: { lap_time_ms: 95000, is_pit_out_lap: false, position: 8 } },
      { eventType: "position_change", occurredAt: "2026-01-01T00:00:00Z", payload: { from_position: 10, to_position: 9, cause: "on_track" } },
      { eventType: "classification", payload: { final_position: 6, points: 8, status: "finished" } },
    ];
    const stats = computeSessionStatsForEntry(events);
    // No grid_position event present — even though lap/position_change data
    // exists, we deliberately don't infer a starting position from it.
    expect(stats.positionsGained).toBeNull();
  });

  test("no classification event yields null position/0 points, not a crash", () => {
    const stats = computeSessionStatsForEntry([]);
    expect(stats.finalPosition).toBeNull();
    expect(stats.points).toBe(0);
  });
});

describe("computeCareerAggregate", () => {
  test("counts wins, podiums, points, DNFs across sessions", () => {
    const results = [
      { finalPosition: 1, points: 25, status: "finished" },
      { finalPosition: 3, points: 15, status: "finished" },
      { finalPosition: null, points: 0, status: "dnf" },
    ];
    const agg = computeCareerAggregate(results);
    expect(agg).toEqual({ wins: 1, podiums: 2, points: 40, dnfCount: 1 });
  });
});

describe("computeSeasonAggregate", () => {
  test("reliability rate is 1 minus dnf fraction", () => {
    const results = [
      { finalPosition: 2, points: 18, status: "finished" },
      { finalPosition: null, points: 0, status: "dnf" },
    ];
    const agg = computeSeasonAggregate(results);
    expect(agg.reliabilityRate).toBe(0.5);
  });

  test("no starts yields a null reliability rate, not NaN", () => {
    const agg = computeSeasonAggregate([]);
    expect(agg.reliabilityRate).toBeNull();
  });
});

describe("computeHeadToHead", () => {
  test("counts a win for whoever finished ahead each shared session", () => {
    const resultsA = [{ finalPosition: 2 }, { finalPosition: 7 }, { finalPosition: 1 }];
    const resultsB = [{ finalPosition: 4 }, { finalPosition: 3 }, { finalPosition: 5 }];
    const h2h = computeHeadToHead(resultsA, resultsB);
    expect(h2h).toEqual({ winsA: 2, winsB: 1, sampleSize: 3 });
  });

  test("skips sessions where either side has no result", () => {
    const resultsA = [{ finalPosition: 2 }, { finalPosition: null }];
    const resultsB = [{ finalPosition: 4 }, { finalPosition: 5 }];
    const h2h = computeHeadToHead(resultsA, resultsB);
    expect(h2h.sampleSize).toBe(1);
  });
});