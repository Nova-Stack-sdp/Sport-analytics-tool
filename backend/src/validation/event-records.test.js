import {
  mapFlag,
  mapLap,
  mapPitStop,
  mapTyreStint,
  mapPositionChanges,
  mapRaceControlRecord,
  mapWeather,
  mapGridPosition,
  mapClassification,
} from "./event-records.js";

// Shared test helpers: a minimal entryFor lookup (driver_number 1 -> "entry-1",
// everything else unknown) and a reject() that just records calls instead of
// throwing, matching how openf1-sync.js and submissions.js actually use these
// functions.
function makeEntryFor() {
  return (driverNumber) => (driverNumber === 1 ? "entry-1" : null);
}
function makeReject() {
  const rejections = [];
  const reject = (eventType, record, reason) => {
    rejections.push({ eventType, record, reason });
  };
  return { reject, rejections };
}

describe("mapFlag", () => {
  test("maps known flag values", () => {
    expect(mapFlag("GREEN")).toBe("green");
    expect(mapFlag("DOUBLE YELLOW")).toBe("yellow");
    expect(mapFlag("SAFETY CAR")).toBe("safety_car");
    expect(mapFlag("VIRTUAL SAFETY CAR")).toBe("vsc");
  });

  test("is case-insensitive", () => {
    expect(mapFlag("green")).toBe("green");
  });

  test("unknown or missing flag returns null", () => {
    expect(mapFlag("TRYY")).toBeNull();
    expect(mapFlag(null)).toBeNull();
    expect(mapFlag(undefined)).toBeNull();
  });
});

describe("mapLap", () => {
  test("maps a valid lap, converting seconds to ms per sector", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapLap(
      {
        driver_number: 1,
        lap_number: 5,
        lap_duration: 81.234,
        duration_sector_1: 25.1,
        duration_sector_2: 28.2,
        duration_sector_3: 27.934,
        date_start: "2026-03-07T05:10:00Z",
        is_pit_out_lap: false,
      },
      entryFor,
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("lap_completed");
    expect(event.entryId).toBe("entry-1");
    expect(event.lapNumber).toBe(5);
    expect(event.payload.lap_time_ms).toBe(81234);
    expect(event.payload.sector1_ms).toBe(25100);
    // position is never available from /laps — always null regardless of input.
    expect(event.payload.position).toBeNull();
  });

  test("rejects an unknown driver_number instead of throwing", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapLap(
      { driver_number: 999, lap_number: 1, lap_duration: 80, date_start: "2026-03-07T05:10:00Z" },
      entryFor,
      reject
    );
    expect(event).toBeNull();
    expect(rejections).toHaveLength(1);
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });

  test("rejects a non-positive lap_duration", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapLap(
      { driver_number: 1, lap_number: 2, lap_duration: -5, date_start: "2026-03-07T05:10:00Z" },
      entryFor,
      reject
    );
    expect(event).toBeNull();
    expect(rejections[0].reason).toBe("lap_duration is not positive");
  });

  test("a null lap_duration is allowed through (e.g. an incomplete lap), not rejected", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapLap(
      { driver_number: 1, lap_number: 3, lap_duration: null, date_start: "2026-03-07T05:10:00Z" },
      entryFor,
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.payload.lap_time_ms).toBeNull();
  });
});

describe("mapPitStop", () => {
  test("maps a valid pit stop, approximating exit_time from entry_time + duration", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapPitStop(
      { driver_number: 1, lap_number: 20, pit_duration: 23.4, date: "2026-03-07T05:30:00.000Z" },
      entryFor,
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("pit_stop");
    expect(event.payload.pit_duration_ms).toBe(23400);
    expect(event.payload.entry_time).toBe("2026-03-07T05:30:00.000Z");
    expect(event.payload.exit_time).toBe("2026-03-07T05:30:23.400Z");
  });

  test("rejects an unknown driver_number", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapPitStop(
      { driver_number: 999, lap_number: 1, pit_duration: 20, date: "2026-03-07T05:30:00Z" },
      entryFor,
      reject
    );
    expect(event).toBeNull();
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });

  test("rejects a negative pit_duration", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapPitStop(
      { driver_number: 1, lap_number: 1, pit_duration: -1, date: "2026-03-07T05:30:00Z" },
      entryFor,
      reject
    );
    expect(event).toBeNull();
    expect(rejections[0].reason).toBe("pit_duration is negative");
  });
});

describe("mapTyreStint", () => {
  test("maps a valid stint", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapTyreStint(
      { driver_number: 1, compound: "SOFT", stint_number: 1, lap_start: 1, lap_end: 15, tyre_age_at_start: 0 },
      entryFor,
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("tyre_stint");
    expect(event.payload.compound).toBe("SOFT");
    expect(event.payload.start_lap).toBe(1);
    expect(event.payload.end_lap).toBe(15);
  });

  test("rejects an unknown driver_number", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapTyreStint(
      { driver_number: 999, compound: "SOFT", stint_number: 1, lap_start: 1, lap_end: 10 },
      entryFor,
      reject
    );
    expect(event).toBeNull();
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });
});

describe("mapPositionChanges", () => {
  test("emits nothing when a driver's position never changes", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const events = mapPositionChanges(
      [
        { driver_number: 1, position: 4, date: "2026-03-07T05:00:00Z" },
        { driver_number: 1, position: 4, date: "2026-03-07T05:05:00Z" },
      ],
      entryFor,
      reject
    );
    expect(events).toHaveLength(0);
    expect(rejections).toHaveLength(0);
  });

  test("emits one event per genuine change, sorted by time regardless of input order", () => {
    const entryFor = makeEntryFor();
    const { reject } = makeReject();
    const events = mapPositionChanges(
      [
        { driver_number: 1, position: 3, date: "2026-03-07T05:05:00Z" },
        { driver_number: 1, position: 4, date: "2026-03-07T05:00:00Z" },
      ],
      entryFor,
      reject
    );
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ from_position: 4, to_position: 3, cause: "on_track" });
  });

  test("rejects a driver group with an unknown driver_number", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const events = mapPositionChanges(
      [{ driver_number: 999, position: 1, date: "2026-03-07T05:00:00Z" }],
      entryFor,
      reject
    );
    expect(events).toHaveLength(0);
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });
});

describe("mapRaceControlRecord", () => {
  test("maps a Flag category record into a flag_event with the translated flag value", () => {
    const { reject, rejections } = makeReject();
    const event = mapRaceControlRecord(
      { category: "Flag", flag: "YELLOW", lap_number: 10, date: "2026-03-07T05:15:00Z" },
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("flag_event");
    expect(event.payload.flag).toBe("yellow");
  });

  test("rejects an unrecognized flag value", () => {
    const { reject, rejections } = makeReject();
    const event = mapRaceControlRecord(
      { category: "Flag", flag: "TRYY", lap_number: 10, date: "2026-03-07T05:15:00Z" },
      reject
    );
    expect(event).toBeNull();
    expect(rejections[0].reason).toMatch(/unrecognized flag value/);
  });

  test("maps a non-Flag category record into a race_control_message", () => {
    const { reject, rejections } = makeReject();
    const event = mapRaceControlRecord(
      { category: "Drs", flag: null, lap_number: 12, message: "DRS enabled", date: "2026-03-07T05:16:00Z" },
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("race_control_message");
    expect(event.payload.message_text).toBe("DRS enabled");
  });
});

describe("mapWeather", () => {
  test("maps fields directly, no validation/rejection possible", () => {
    const event = mapWeather({
      date: "2026-03-07T05:00:00Z",
      air_temperature: 28.5,
      track_temperature: 41.2,
      humidity: 55,
      rainfall: 0,
      wind_speed: 3.1,
    });
    expect(event.eventType).toBe("weather_snapshot");
    expect(event.payload.air_temp).toBe(28.5);
    expect(event.payload.track_temp).toBe(41.2);
  });
});

describe("mapGridPosition", () => {
  test("maps a valid grid position", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapGridPosition({ driver_number: 1, position: 3 }, entryFor, reject);
    expect(rejections).toHaveLength(0);
    expect(event.eventType).toBe("grid_position");
    expect(event.payload.position).toBe(3);
  });

  test("rejects an unknown driver_number", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapGridPosition({ driver_number: 999, position: 1 }, entryFor, reject);
    expect(event).toBeNull();
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });
});

describe("mapClassification", () => {
  test("maps a finished result", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapClassification(
      { driver_number: 1, position: 2, points: 18, dnf: false, dsq: false },
      entryFor,
      reject
    );
    expect(rejections).toHaveLength(0);
    expect(event.payload.status).toBe("finished");
    expect(event.payload.final_position).toBe(2);
    expect(event.payload.points).toBe(18);
  });

  test("maps a dnf result", () => {
    const entryFor = makeEntryFor();
    const { reject } = makeReject();
    const event = mapClassification(
      { driver_number: 1, position: null, points: 0, dnf: true, dsq: false, dnf_reason: "Engine" },
      entryFor,
      reject
    );
    expect(event.payload.status).toBe("dnf");
    expect(event.payload.reason).toBe("Engine");
  });

  test("dsq takes priority over dnf when both are set", () => {
    const entryFor = makeEntryFor();
    const { reject } = makeReject();
    const event = mapClassification(
      { driver_number: 1, position: null, points: 0, dnf: true, dsq: true },
      entryFor,
      reject
    );
    expect(event.payload.status).toBe("dsq");
  });

  test("rejects an unknown driver_number", () => {
    const entryFor = makeEntryFor();
    const { reject, rejections } = makeReject();
    const event = mapClassification({ driver_number: 999, position: 1, points: 25 }, entryFor, reject);
    expect(event).toBeNull();
    expect(rejections[0].reason).toMatch(/unknown driver_number/);
  });
});
