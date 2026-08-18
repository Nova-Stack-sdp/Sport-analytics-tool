/**
 * OpenF1 sync job
 *
 * Pulls all data for one completed session from the OpenF1 API and writes it
 * through the same pipeline a manual upload would use: one Submission per
 * sync run, validated events, inserted as a batch.
 *
 * Usage:
 *   node src/jobs/openf1-sync.js <session_key>
 *
 * Find a session_key via, e.g.:
 *   https://api.openf1.org/v1/sessions?year=2023&session_name=Race&country_name=Bahrain
 *
 * KNOWN LIMITATIONS (flagged rather than silently guessed at — worth mentioning
 * in your docs/report):
 *  - OpenF1's /laps endpoint does not return a `position` field, so
 *    lap_completed.payload.position is left null here. Position is derived
 *    separately from the /position endpoint as position_change events.
 *  - /pit gives a single timestamp, not separate entry/exit times. exitTime
 *    is approximated as entryTime + pit_duration.
 *  - position_change.cause defaults to 'on_track' since OpenF1 doesn't label
 *    the cause of a position change — a future pass could cross-reference
 *    pit records to set 'pit' where applicable.
 *  - session_status_change is not populated — OpenF1 has no clean source for
 *    it in the free API tier.
 *  - Sprint Qualifying / Sprint Shootout sessions are mapped to `Q` since the
 *    SessionType enum has no dedicated slot for them.
 */

import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const { PrismaClient, SubmissionSource, SubmissionStatus, EventType } = pkg;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const OPENF1_BASE = 'https://api.openf1.org/v1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenF1(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${OPENF1_BASE}/${path}${query ? `?${query}` : ''}`;
  const res = await fetch(url);
  if (res.status === 429) {
    // Rate limited — wait and retry once before giving up.
    console.warn(`Rate limited on ${url}, waiting 3s and retrying...`);
    await sleep(3000);
    return fetchOpenF1(path, params);
  }
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`OpenF1 request failed: ${url} -> ${res.status}`);
  }
  await sleep(300); // small buffer between calls to stay under the rate limit
  return res.json();
}

function mapSessionType(sessionName) {
  const map = {
    'Practice 1': 'FP1',
    'Practice 2': 'FP2',
    'Practice 3': 'FP3',
    'Qualifying': 'Q',
    'Sprint Qualifying': 'Q',
    'Sprint Shootout': 'Q',
    'Sprint': 'Sprint',
    'Race': 'Race',
  };
  const mapped = map[sessionName];
  if (!mapped) {
    console.warn(`Unmapped session_name "${sessionName}", defaulting to Q`);
    return 'Q';
  }
  return mapped;
}

function mapFlag(flag) {
  if (!flag) return null;
  const map = {
    GREEN: 'green',
    CLEAR: 'green',
    YELLOW: 'yellow',
    DOUBLE_YELLOW: 'yellow',
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
 * Ensures circuit/meeting/session/team/driver/entry rows exist for this
 * session, upserting by OpenF1's own keys so re-running sync never
 * duplicates dimension data.
 * Returns { sessionId, season, entryByDriverNumber: Map<number, entryId> }
 */
async function syncDimensions(sessionKey) {
  const [sessionData] = await fetchOpenF1('sessions', { session_key: sessionKey });
  if (!sessionData) throw new Error(`No session found for session_key=${sessionKey}`);

  const [meetingData] = await fetchOpenF1('meetings', { meeting_key: sessionData.meeting_key });
  const driversData = await fetchOpenF1('drivers', { session_key: sessionKey });

  const circuit = await prisma.circuit.upsert({
    where: { openf1Key: meetingData.circuit_key },
    update: {
      name: meetingData.circuit_short_name,
      country: meetingData.country_name,
      location: meetingData.location,
    },
    create: {
      openf1Key: meetingData.circuit_key,
      name: meetingData.circuit_short_name,
      country: meetingData.country_name,
      location: meetingData.location,
    },
  });

  const meeting = await prisma.meeting.upsert({
    where: { openf1Key: meetingData.meeting_key },
    update: {
      season: meetingData.year,
      name: meetingData.meeting_name,
      circuitId: circuit.id,
      startDate: new Date(meetingData.date_start),
    },
    create: {
      openf1Key: meetingData.meeting_key,
      season: meetingData.year,
      name: meetingData.meeting_name,
      circuitId: circuit.id,
      startDate: new Date(meetingData.date_start),
    },
  });

  const session = await prisma.session.upsert({
    where: { openf1Key: sessionData.session_key },
    update: {
      meetingId: meeting.id,
      type: mapSessionType(sessionData.session_name),
      startTime: new Date(sessionData.date_start),
      endTime: sessionData.date_end ? new Date(sessionData.date_end) : null,
      status: 'finished',
    },
    create: {
      openf1Key: sessionData.session_key,
      meetingId: meeting.id,
      type: mapSessionType(sessionData.session_name),
      startTime: new Date(sessionData.date_start),
      endTime: sessionData.date_end ? new Date(sessionData.date_end) : null,
      status: 'finished',
    },
  });

  const entryByDriverNumber = new Map();
  for (const d of driversData) {
    const team = await prisma.team.upsert({
      where: { name_season: { name: d.team_name, season: meeting.season } },
      update: {},
      create: { name: d.team_name, season: meeting.season },
    });

    const driver = await prisma.driver.upsert({
      where: { driverNumber: d.driver_number },
      update: { name: d.full_name },
      create: { driverNumber: d.driver_number, name: d.full_name },
    });

    const entry = await prisma.entry.upsert({
      where: { sessionId_driverId: { sessionId: session.id, driverId: driver.id } },
      update: { teamId: team.id },
      create: { sessionId: session.id, driverId: driver.id, teamId: team.id },
    });

    entryByDriverNumber.set(d.driver_number, entry.id);
  }

  return { sessionId: session.id, season: meeting.season, entryByDriverNumber };
}

/**
 * Fetches every OpenF1 endpoint for this session and maps each record into
 * a normalized { eventType, entryId, lapNumber, occurredAt, payload } shape,
 * or null if the record fails basic validation (with a reason logged).
 */
async function collectEvents(sessionKey, entryByDriverNumber) {
  const events = [];
  const rejections = [];

  const reject = (eventType, record, reason) => {
    rejections.push({ eventType, reason, record });
  };

  const entryFor = (driverNumber) => entryByDriverNumber.get(driverNumber) ?? null;

  // lap_completed
  const laps = await fetchOpenF1('laps', { session_key: sessionKey });
  for (const l of laps) {
    if (!entryFor(l.driver_number)) {
      reject('lap_completed', l, `unknown driver_number ${l.driver_number}`);
      continue;
    }
    if (l.lap_duration != null && l.lap_duration <= 0) {
      reject('lap_completed', l, 'lap_duration is not positive');
      continue;
    }
    events.push({
      eventType: EventType.lap_completed,
      entryId: entryFor(l.driver_number),
      lapNumber: l.lap_number,
      occurredAt: new Date(l.date_start),
      payload: {
        lap_time_ms: l.lap_duration != null ? Math.round(l.lap_duration * 1000) : null,
        sector1_ms: l.duration_sector_1 != null ? Math.round(l.duration_sector_1 * 1000) : null,
        sector2_ms: l.duration_sector_2 != null ? Math.round(l.duration_sector_2 * 1000) : null,
        sector3_ms: l.duration_sector_3 != null ? Math.round(l.duration_sector_3 * 1000) : null,
        // Not available from /laps — see file header note.
        position: null,
        is_pit_out_lap: l.is_pit_out_lap ?? false,
      },
    });
  }

  // pit_stop
  const pits = await fetchOpenF1('pit', { session_key: sessionKey });
  for (const p of pits) {
    if (!entryFor(p.driver_number)) {
      reject('pit_stop', p, `unknown driver_number ${p.driver_number}`);
      continue;
    }
    if (p.pit_duration != null && p.pit_duration < 0) {
      reject('pit_stop', p, 'pit_duration is negative');
      continue;
    }
    const entryTime = new Date(p.date);
    const durationMs = p.pit_duration != null ? Math.round(p.pit_duration * 1000) : null;
    events.push({
      eventType: EventType.pit_stop,
      entryId: entryFor(p.driver_number),
      lapNumber: p.lap_number,
      occurredAt: entryTime,
      payload: {
        pit_duration_ms: durationMs,
        entry_time: entryTime.toISOString(),
        // Approximated — OpenF1 doesn't give entry/exit separately.
        exit_time: durationMs != null ? new Date(entryTime.getTime() + durationMs).toISOString() : null,
      },
    });
  }

  // tyre_stint
  const stints = await fetchOpenF1('stints', { session_key: sessionKey });
  for (const s of stints) {
    if (!entryFor(s.driver_number)) {
      reject('tyre_stint', s, `unknown driver_number ${s.driver_number}`);
      continue;
    }
    events.push({
      eventType: EventType.tyre_stint,
      entryId: entryFor(s.driver_number),
      lapNumber: s.lap_start,
      occurredAt: new Date(), // stints have no timestamp; ordered by lap range instead
      payload: {
        compound: s.compound,
        stint_number: s.stint_number,
        start_lap: s.lap_start,
        end_lap: s.lap_end,
        tyre_age_at_start: s.tyre_age_at_start,
      },
    });
  }

  // position_change — only emit when a driver's position actually changes
  const positions = await fetchOpenF1('position', { session_key: sessionKey });
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
            // Not distinguished by OpenF1 — see file header note.
            cause: 'on_track',
          },
        });
      }
      prev = r.position;
    }
  }

  // flag_event + race_control_message
  const raceControl = await fetchOpenF1('race_control', { session_key: sessionKey });
  for (const rc of raceControl) {
    if (rc.category === 'Flag') {
      const flag = mapFlag(rc.flag);
      if (!flag) {
        reject('flag_event', rc, `unrecognized flag value "${rc.flag}"`);
        continue;
      }
      events.push({
        eventType: EventType.flag_event,
        entryId: null,
        lapNumber: rc.lap_number,
        occurredAt: new Date(rc.date),
        payload: { flag, start_lap: rc.lap_number, end_lap: null },
      });
    } else {
      events.push({
        eventType: EventType.race_control_message,
        entryId: null,
        lapNumber: rc.lap_number,
        occurredAt: new Date(rc.date),
        payload: { category: rc.category, message_text: rc.message, lap_number: rc.lap_number },
      });
    }
  }

  // weather_snapshot
  const weather = await fetchOpenF1('weather', { session_key: sessionKey });
  for (const w of weather) {
    events.push({
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
    });
  }

  // classification
  const results = await fetchOpenF1('session_result', { session_key: sessionKey });
  for (const r of results) {
    if (!entryFor(r.driver_number)) {
      reject('classification', r, `unknown driver_number ${r.driver_number}`);
      continue;
    }
    events.push({
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
    });
  }

  return { events, rejections };
}

async function syncSession(sessionKeyRaw) {
  const sessionKey = Number(sessionKeyRaw);
  console.log(`Syncing session_key=${sessionKey}...`);

  const { sessionId, entryByDriverNumber } = await syncDimensions(sessionKey);
  const { events, rejections } = await collectEvents(sessionKey, entryByDriverNumber);

  if (rejections.length > 0) {
    console.warn(`${rejections.length} record(s) rejected:`);
    for (const r of rejections) console.warn(`  [${r.eventType}] ${r.reason}`);
  }

  const status =
    events.length === 0
      ? SubmissionStatus.rejected
      : rejections.length === 0
      ? SubmissionStatus.accepted
      : SubmissionStatus.partially_accepted;

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.create({
      data: {
        source: SubmissionSource.openf1_sync,
        submitterId: null,
        sessionId,
        fileRef: null,
        status,
        validationErrors: rejections.length > 0 ? rejections : undefined,
      },
    });

    if (events.length > 0) {
      await tx.event.createMany({
        data: events.map((e) => ({
          sessionId,
          entryId: e.entryId,
          eventType: e.eventType,
          lapNumber: e.lapNumber,
          occurredAt: e.occurredAt,
          payload: e.payload,
          sourceSubmissionId: submission.id,
        })),
      });
    }

    return submission;
  });

  console.log(`Submission ${result.id} created — status: ${result.status}, events written: ${events.length}`);
  return result;
}

const sessionKeyArg = process.argv[2];
if (!sessionKeyArg) {
  console.error('Usage: node src/jobs/openf1-sync.js <session_key>');
  process.exit(1);
}

syncSession(sessionKeyArg)
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());