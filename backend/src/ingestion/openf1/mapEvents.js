/**
 * OpenF1 records -> the app's event log rows. Pure: no network, no database,
 * so every rule here is testable on its own and shared by every way a session
 * gets synced (the CLI job, a race requested from RaceSync, a test).
 *
 * The mapping and its rules are the ones the sync job has always applied
 * (moved here unchanged from src/jobs/openf1-sync.js). Known OpenF1 gaps,
 * flagged rather than guessed at:
 *  - /laps carries no position, so lap_completed.payload.position is null;
 *    positions come from /position as position_change events.
 *  - /pit gives one timestamp; exit_time is entry + pit_duration.
 *  - position_change.cause is always 'on_track' — OpenF1 doesn't label it.
 *  - /starting_grid is keyed to the QUALIFYING session (see gridSessionName).
 */

export function mapSessionType(sessionName) {
  const map = {
    'Practice 1': 'FP1',
    'Practice 2': 'FP2',
    'Practice 3': 'FP3',
    Qualifying: 'Q',
    'Sprint Qualifying': 'Q',
    'Sprint Shootout': 'Q',
    Sprint: 'Sprint',
    Race: 'Race',
  };
  return map[sessionName] ?? 'Q';
}

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

/**
 * OpenF1 quirk, confirmed against real data: /starting_grid is stored under
 * the meeting's QUALIFYING session_key, not the race's. Given the meeting's
 * sessions, return the key the grid lives under, or null (no grid for this
 * session type, or no qualifying found).
 */
export function gridSessionKey(sessionName, meetingSessions) {
  if (sessionName !== 'Race' && sessionName !== 'Sprint') return null;
  const target = sessionName === 'Race' ? 'Qualifying' : 'Sprint Qualifying';
  let match = (meetingSessions ?? []).find((s) => s.session_name === target);
  if (!match && sessionName === 'Sprint') {
    match = (meetingSessions ?? []).find((s) => s.session_name === 'Sprint Shootout');
  }
  return match?.session_key ?? null;
}

const ms = (seconds) => (seconds != null ? Math.round(seconds * 1000) : null);

/**
 * Map every fetched record to { eventType, entryId, lapNumber, occurredAt,
 * payload }, rejecting (with a reason) what can't be mapped. `records` holds
 * the raw OpenF1 arrays; `entryByDriverNumber` maps driver numbers to entry
 * ids; `timing` gives fixed timestamps for records that carry none, so the
 * same record maps identically on every run.
 */
export function mapOpenF1Records(records, entryByDriverNumber, { sessionStart, sessionEnd }) {
  const events = [];
  const rejections = [];
  const reject = (eventType, record, reason) => rejections.push({ eventType, reason, record });
  const entryFor = (driverNumber) => entryByDriverNumber.get(driverNumber) ?? null;

  for (const l of records.laps ?? []) {
    if (!entryFor(l.driver_number)) {
      reject('lap_completed', l, `unknown driver_number ${l.driver_number}`);
      continue;
    }
    if (l.lap_duration != null && l.lap_duration <= 0) {
      reject('lap_completed', l, 'lap_duration is not positive');
      continue;
    }
    events.push({
      eventType: 'lap_completed',
      entryId: entryFor(l.driver_number),
      lapNumber: l.lap_number,
      // A few laps (often lap 1) come without a start time; the session start
      // stands in — laps order by number anyway.
      occurredAt: l.date_start ? new Date(l.date_start) : sessionStart,
      payload: {
        lap_time_ms: ms(l.lap_duration),
        sector1_ms: ms(l.duration_sector_1),
        sector2_ms: ms(l.duration_sector_2),
        sector3_ms: ms(l.duration_sector_3),
        position: null,
        is_pit_out_lap: l.is_pit_out_lap ?? false,
      },
    });
  }

  for (const p of records.pits ?? []) {
    if (!entryFor(p.driver_number)) {
      reject('pit_stop', p, `unknown driver_number ${p.driver_number}`);
      continue;
    }
    if (p.pit_duration != null && p.pit_duration < 0) {
      reject('pit_stop', p, 'pit_duration is negative');
      continue;
    }
    const entryTime = new Date(p.date);
    const durationMs = ms(p.pit_duration);
    events.push({
      eventType: 'pit_stop',
      entryId: entryFor(p.driver_number),
      lapNumber: p.lap_number,
      occurredAt: entryTime,
      payload: {
        pit_duration_ms: durationMs,
        entry_time: entryTime.toISOString(),
        exit_time: durationMs != null ? new Date(entryTime.getTime() + durationMs).toISOString() : null,
      },
    });
  }

  for (const s of records.stints ?? []) {
    if (!entryFor(s.driver_number)) {
      reject('tyre_stint', s, `unknown driver_number ${s.driver_number}`);
      continue;
    }
    events.push({
      eventType: 'tyre_stint',
      entryId: entryFor(s.driver_number),
      lapNumber: s.lap_start,
      occurredAt: sessionStart, // stints carry no timestamp; they order by lap range
      payload: {
        compound: s.compound,
        stint_number: s.stint_number,
        start_lap: s.lap_start,
        end_lap: s.lap_end,
        tyre_age_at_start: s.tyre_age_at_start,
      },
    });
  }

  // position_change: only when a driver's position actually changes.
  const byDriver = new Map();
  for (const p of records.positions ?? []) {
    if (!byDriver.has(p.driver_number)) byDriver.set(p.driver_number, []);
    byDriver.get(p.driver_number).push(p);
  }
  for (const [driverNumber, list] of byDriver) {
    if (!entryFor(driverNumber)) {
      reject('position_change', list[0], `unknown driver_number ${driverNumber}`);
      continue;
    }
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    let previous = null;
    for (const r of list) {
      if (previous !== null && previous !== r.position) {
        events.push({
          eventType: 'position_change',
          entryId: entryFor(driverNumber),
          lapNumber: null,
          occurredAt: new Date(r.date),
          payload: { from_position: previous, to_position: r.position, cause: 'on_track' },
        });
      }
      previous = r.position;
    }
  }

  for (const rc of records.raceControl ?? []) {
    if (rc.category === 'Flag') {
      const flag = mapFlag(rc.flag);
      if (!flag) {
        reject('flag_event', rc, `unrecognized flag value "${rc.flag}"`);
        continue;
      }
      events.push({
        eventType: 'flag_event',
        entryId: null,
        lapNumber: rc.lap_number,
        occurredAt: new Date(rc.date),
        payload: { flag, start_lap: rc.lap_number, end_lap: null },
      });
    } else {
      events.push({
        eventType: 'race_control_message',
        entryId: null,
        lapNumber: rc.lap_number,
        occurredAt: new Date(rc.date),
        payload: { category: rc.category, message_text: rc.message, lap_number: rc.lap_number },
      });
    }
  }

  for (const w of records.weather ?? []) {
    events.push({
      eventType: 'weather_snapshot',
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
    });
  }

  for (const g of records.grid ?? []) {
    if (!entryFor(g.driver_number)) {
      reject('grid_position', g, `unknown driver_number ${g.driver_number}`);
      continue;
    }
    events.push({
      eventType: 'grid_position',
      entryId: entryFor(g.driver_number),
      lapNumber: null,
      occurredAt: sessionStart, // the grid is set before the race
      payload: { position: g.position },
    });
  }

  for (const r of records.results ?? []) {
    if (!entryFor(r.driver_number)) {
      reject('classification', r, `unknown driver_number ${r.driver_number}`);
      continue;
    }
    events.push({
      eventType: 'classification',
      entryId: entryFor(r.driver_number),
      lapNumber: null,
      occurredAt: sessionEnd, // the result stands as of the end of the session
      payload: {
        final_position: r.position ?? null,
        points: r.points ?? 0,
        status: r.dsq ? 'dsq' : r.dnf ? 'dnf' : 'finished',
        reason: r.dnf_reason ?? null,
      },
    });
  }

  return { events, rejections };
}
