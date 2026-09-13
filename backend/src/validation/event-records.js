/**
 * Shared per-record validation + mapping logic for turning raw OpenF1-shaped
 * records into normalized event objects ({ eventType, entryId, lapNumber,
 * occurredAt, payload }). Used by both the automated OpenF1 sync job
 * (src/jobs/openf1-sync.js) and the manual upload route
 * (src/routes/submissions.js), so a validation rule only needs to be written
 * once and both paths behave identically.
 *
 * Each mapXxx function takes:
 *   - the raw record (an OpenF1-shaped object, whether it came from a live
 *     API fetch or a human-submitted JSON file)
 *   - entryFor(driverNumber) => entryId | null, a lookup built from the
 *     session's existing Entry rows
 *   - reject(eventType, record, reason) => void, called instead of throwing,
 *     so one bad record doesn't abort an entire batch
 * and returns a normalized event object, or null if the record was rejected.
 * mapPositionChanges is the one exception — it takes the whole array at
 * once (position changes are diffed across a driver's records) and returns
 * an array of events.
 */
import pkg from '@prisma/client';
const { EventType } = pkg;

export function mapFlag(flag) {
  if (!flag) return null;
  const map = {
    GREEN: 'green',
    CLEAR: 'green',
    YELLOW: 'yellow',
    'DOUBLE YELLOW': 'yellow',
    RED: 'red',
    'SAFETY CAR': 'safety_car',
    'VIRTUAL SAFETY CAR': 'vsc',
    CHEQUERED: 'chequered',
    BLUE: 'blue',
    'BLACK AND WHITE': 'black_and_white',
  };
  return map[flag.toUpperCase()] ?? null;
}

export function mapLap(l, entryFor, reject) {
  if (!entryFor(l.driver_number)) {
    reject('lap_completed', l, `unknown driver_number ${l.driver_number}`);
    return null;
  }
  if (l.lap_duration != null && l.lap_duration <= 0) {
    reject('lap_completed', l, 'lap_duration is not positive');
    return null;
  }
  return {
    eventType: EventType.lap_completed,
    entryId: entryFor(l.driver_number),
    lapNumber: l.lap_number,
    occurredAt: new Date(l.date_start),
    payload: {
      lap_time_ms: l.lap_duration != null ? Math.round(l.lap_duration * 1000) : null,
      sector1_ms: l.duration_sector_1 != null ? Math.round(l.duration_sector_1 * 1000) : null,
      sector2_ms: l.duration_sector_2 != null ? Math.round(l.duration_sector_2 * 1000) : null,
      sector3_ms: l.duration_sector_3 != null ? Math.round(l.duration_sector_3 * 1000) : null,
      position: null,
      is_pit_out_lap: l.is_pit_out_lap ?? false,
    },
  };
}

export function mapPitStop(p, entryFor, reject) {
  if (!entryFor(p.driver_number)) {
    reject('pit_stop', p, `unknown driver_number ${p.driver_number}`);
    return null;
  }
  if (p.pit_duration != null && p.pit_duration < 0) {
    reject('pit_stop', p, 'pit_duration is negative');
    return null;
  }
  const entryTime = new Date(p.date);
  const durationMs = p.pit_duration != null ? Math.round(p.pit_duration * 1000) : null;
  return {
    eventType: EventType.pit_stop,
    entryId: entryFor(p.driver_number),
    lapNumber: p.lap_number,
    occurredAt: entryTime,
    payload: {
      pit_duration_ms: durationMs,
      entry_time: entryTime.toISOString(),
      exit_time: durationMs != null ? new Date(entryTime.getTime() + durationMs).toISOString() : null,
    },
  };
}

export function mapTyreStint(s, entryFor, reject) {
  if (!entryFor(s.driver_number)) {
    reject('tyre_stint', s, `unknown driver_number ${s.driver_number}`);
    return null;
  }
  return {
    eventType: EventType.tyre_stint,
    entryId: entryFor(s.driver_number),
    lapNumber: s.lap_start,
    occurredAt: new Date(),
    payload: {
      compound: s.compound,
      stint_number: s.stint_number,
      start_lap: s.lap_start,
      end_lap: s.lap_end,
      tyre_age_at_start: s.tyre_age_at_start,
    },
  };
}

export function mapPositionChanges(positions, entryFor, reject) {
  const events = [];
  const byDriver = new Map();
  for (const p of positions) {
    if (!byDriver.has(p.driver_number)) byDriver.set(p.driver_number, []);
    byDriver.get(p.driver_number).push(p);
  }
  for (const [driverNumber, records] of byDriver) {
    if (!entryFor(driverNumber)) {
      reject('position_change', records[0], `unknown driver_number ${driverNumber}`);
      continue;
    }
    records.sort((a, b) => new Date(a.date) - new Date(b.date));
    let prev = null;
    for (const r of records) {
      if (prev !== null && prev !== r.position) {
        events.push({
          eventType: EventType.position_change,
          entryId: entryFor(driverNumber),
          lapNumber: null,
          occurredAt: new Date(r.date),
          payload: {
            from_position: prev,
            to_position: r.position,
            cause: 'on_track',
          },
        });
      }
      prev = r.position;
    }
  }
  return events;
}

export function mapRaceControlRecord(rc, reject) {
  if (rc.category === 'Flag') {
    const flag = mapFlag(rc.flag);
    if (!flag) {
      reject('flag_event', rc, `unrecognized flag value "${rc.flag}"`);
      return null;
    }
    return {
      eventType: EventType.flag_event,
      entryId: null,
      lapNumber: rc.lap_number,
      occurredAt: new Date(rc.date),
      payload: { flag, start_lap: rc.lap_number, end_lap: null },
    };
  }
  return {
    eventType: EventType.race_control_message,
    entryId: null,
    lapNumber: rc.lap_number,
    occurredAt: new Date(rc.date),
    payload: { category: rc.category, message_text: rc.message, lap_number: rc.lap_number },
  };
}

export function mapWeather(w) {
  return {
    eventType: EventType.weather_snapshot,
    entryId: null,
    lapNumber: null,
    occurredAt: new Date(w.date),
    payload: {
      air_temp: w.air_temperature,
      track_temp: w.track_temperature,
      humidity: w.humidity,
      rainfall: w.rainfall,
      wind_speed: w.wind_speed,
    },
  };
}

export function mapGridPosition(g, entryFor, reject) {
  if (!entryFor(g.driver_number)) {
    reject('grid_position', g, `unknown driver_number ${g.driver_number}`);
    return null;
  }
  return {
    eventType: EventType.grid_position,
    entryId: entryFor(g.driver_number),
    lapNumber: null,
    occurredAt: new Date(),
    payload: { position: g.position },
  };
}

export function mapClassification(r, entryFor, reject) {
  if (!entryFor(r.driver_number)) {
    reject('classification', r, `unknown driver_number ${r.driver_number}`);
    return null;
  }
  return {
    eventType: EventType.classification,
    entryId: entryFor(r.driver_number),
    lapNumber: null,
    occurredAt: new Date(),
    payload: {
      final_position: r.position ?? null,
      points: r.points ?? 0,
      status: r.dsq ? 'dsq' : r.dnf ? 'dnf' : 'finished',
      reason: r.dnf_reason ?? null,
    },
  };
}
