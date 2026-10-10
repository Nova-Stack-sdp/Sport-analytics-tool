/**
 * syncOpenF1Session — ingest ANY OpenF1 session into the event log, fast.
 *
 * One pipeline for every way a session gets in: the CLI job
 * (src/jobs/openf1-sync.js), a race requested from RaceSync
 * (routes/raceRequests.js), or a test. Given a session_key it runs:
 *
 *   session     the session, its meeting, its drivers and the meeting's other
 *               sessions (for the grid) — fetched together once the session's
 *               meeting is known
 *   fetch       laps, pit stops, stints, positions, race control, weather,
 *               starting grid, result — all at once, through the rate-limited
 *               client (see client.js)
 *   dimensions  circuit, meeting, session, teams, drivers, entries — upserted
 *               by OpenF1's own keys, independent rows in parallel
 *   map         records -> events (mapEvents.js), validated, and planned
 *               against what is already stored (re-running never duplicates)
 *   write       one Submission and its events, in one transaction
 *   replay      optional: warm whatever the caller serves the race from, so
 *               the first page view is instant
 *   derive      the derived statistics — inline, or deferred so the race is
 *               ready (its events are all a replay needs) while the stats
 *               finish in the background
 *
 * `onProgress({ stage, state, ms, detail })` reports each stage starting and
 * finishing, so a caller can show the sync live. Returns the session id, the
 * write summary, per-stage timings and — when deferred — the derivation's
 * promise.
 */
import { planIngestion, summarizePlan } from '../planIngestion.js';
import { validateEvents } from '../validationRules.js';
import { gridSessionKey, mapOpenF1Records, mapSessionType } from './mapEvents.js';

export const STAGES = ['session', 'fetch', 'dimensions', 'map', 'write', 'replay', 'derive'];

async function upsertDimensions(prisma, { sessionData, meetingData, driversData }) {
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
  const sessionFields = {
    meetingId: meeting.id,
    type: mapSessionType(sessionData.session_name),
    startTime: new Date(sessionData.date_start),
    endTime: sessionData.date_end ? new Date(sessionData.date_end) : null,
    status: 'finished',
  };
  const session = await prisma.session.upsert({
    where: { openf1Key: sessionData.session_key },
    update: sessionFields,
    create: { openf1Key: sessionData.session_key, ...sessionFields },
  });

  // Teams and drivers don't depend on each other: each distinct one is
  // upserted once, all in parallel; then each driver's entry.
  const teamNames = [...new Set(driversData.map((d) => d.team_name))];
  const teams = new Map(
    await Promise.all(
      teamNames.map(async (name) => [
        name,
        await prisma.team.upsert({
          where: { name_season: { name, season: meeting.season } },
          update: {},
          create: { name, season: meeting.season },
        }),
      ])
    )
  );
  const entries = await Promise.all(
    driversData.map(async (d) => {
      const driver = await prisma.driver.upsert({
        where: { driverNumber: d.driver_number },
        update: { name: d.full_name },
        create: { driverNumber: d.driver_number, name: d.full_name },
      });
      const entry = await prisma.entry.upsert({
        where: { sessionId_driverId: { sessionId: session.id, driverId: driver.id } },
        update: { teamId: teams.get(d.team_name).id },
        create: { sessionId: session.id, driverId: driver.id, teamId: teams.get(d.team_name).id },
      });
      return [d.driver_number, entry.id];
    })
  );

  return {
    sessionId: session.id,
    sessionType: session.type,
    sessionStart: session.startTime,
    sessionEnd: session.endTime ?? session.startTime,
    entryByDriverNumber: new Map(entries),
  };
}

async function writeSubmission(prisma, { sessionId, plan, rejections, summary }) {
  const acceptedCount = plan.insert.length + plan.corrections.length + plan.unchanged.length;
  const status =
    acceptedCount === 0 && rejections.length > 0
      ? 'rejected'
      : rejections.length === 0
        ? 'accepted'
        : 'partially_accepted';
  const toRow = (e, submissionId) => ({
    sessionId,
    entryId: e.entryId,
    eventType: e.eventType,
    lapNumber: e.lapNumber,
    occurredAt: e.occurredAt,
    payload: e.payload,
    sourceSubmissionId: submissionId,
  });

  return prisma.$transaction(
    async (tx) => {
      const submission = await tx.submission.create({
        data: {
          source: 'openf1_sync',
          submitterId: null,
          sessionId,
          fileRef: null,
          status,
          validationErrors: rejections.length > 0 ? rejections : undefined,
          summary,
        },
      });
      if (plan.insert.length > 0) {
        await tx.event.createMany({ data: plan.insert.map((e) => toRow(e, submission.id)) });
      }
      // A correction is a new event plus a pointer from the old one to it; the
      // old row stays in the log so the change has a history.
      for (const { event, supersedesId } of plan.corrections) {
        const created = await tx.event.create({ data: toRow(event, submission.id) });
        await tx.event.update({ where: { id: supersedesId }, data: { supersededById: created.id } });
      }
      return submission;
    },
    { maxWait: 15000, timeout: 60000 }
  );
}

export async function syncOpenF1Session(sessionKeyRaw, options) {
  const {
    prisma,
    client,
    runDerivation,
    prepareReplay = null,
    deferDerivation = false,
    onProgress = () => {},
    now = () => Date.now(),
  } = options;
  const sessionKey = Number(sessionKeyRaw);
  if (!Number.isInteger(sessionKey) || sessionKey <= 0) throw new Error(`Invalid session_key ${sessionKeyRaw}`);

  const timings = {};
  const started = now();
  const stage = async (name, work, detail) => {
    const t = now();
    onProgress({ stage: name, state: 'start' });
    const result = await work();
    timings[name] = now() - t;
    onProgress({ stage: name, state: 'done', ms: timings[name], detail: detail?.(result) ?? null });
    return result;
  };

  const header = await stage(
    'session',
    async () => {
      const [sessionData] = await client.get('sessions', { session_key: sessionKey });
      if (!sessionData) throw new Error(`OpenF1 has no session with session_key=${sessionKey}`);
      const [meetingList, driversData, meetingSessions] = await Promise.all([
        client.get('meetings', { meeting_key: sessionData.meeting_key }),
        client.get('drivers', { session_key: sessionKey }),
        client.get('sessions', { meeting_key: sessionData.meeting_key }),
      ]);
      return { sessionData, meetingData: meetingList[0], driversData, meetingSessions };
    },
    (h) => `${h.sessionData.country_name ?? ''} ${h.sessionData.session_name} · ${h.driversData.length} drivers`.trim()
  );
  if (!header.meetingData) throw new Error(`OpenF1 has no meeting for session_key=${sessionKey}`);

  const bytesBefore = client.stats?.bytes ?? 0;
  const records = await stage(
    'fetch',
    async () => {
      const gridKey = gridSessionKey(header.sessionData.session_name, header.meetingSessions);
      const [laps, pits, stints, positions, raceControl, weather, grid, results] = await Promise.all([
        client.get('laps', { session_key: sessionKey }),
        client.get('pit', { session_key: sessionKey }),
        client.get('stints', { session_key: sessionKey }),
        client.get('position', { session_key: sessionKey }),
        client.get('race_control', { session_key: sessionKey }),
        client.get('weather', { session_key: sessionKey }),
        gridKey ? client.get('starting_grid', { session_key: gridKey }) : Promise.resolve([]),
        client.get('session_result', { session_key: sessionKey }),
      ]);
      return { laps, pits, stints, positions, raceControl, weather, grid, results };
    },
    (r) =>
      `${r.laps.length} laps · ${r.positions.length} positions · ${Math.round(((client.stats?.bytes ?? 0) - bytesBefore) / 1024)} KB`
  );

  const dims = await stage('dimensions', () => upsertDimensions(prisma, header), (d) =>
    `${d.entryByDriverNumber.size} entries`
  );

  const planned = await stage(
    'map',
    async () => {
      const mapped = mapOpenF1Records(records, dims.entryByDriverNumber, dims);
      const validated = validateEvents(mapped.events, {
        entryCount: dims.entryByDriverNumber.size,
        sessionType: dims.sessionType,
        sessionStart: dims.sessionStart,
        sessionEnd: dims.sessionEnd,
      });
      const existingLive = await prisma.event.findMany({
        where: { sessionId: dims.sessionId, supersededById: null },
        select: {
          id: true, eventType: true, entryId: true, lapNumber: true,
          occurredAt: true, payload: true, ingestedAt: true,
        },
      });
      const plan = planIngestion(validated.accepted, existingLive);
      const rejections = [
        ...mapped.rejections,
        ...validated.rejections,
        ...plan.duplicates.map(({ event, identity }) => ({
          eventType: event.eventType,
          rule: 'duplicate_in_batch',
          reason: `this ${event.eventType.replaceAll('_', ' ')} appears more than once in this submission (${identity})`,
          record: event,
        })),
      ];
      return { plan, rejections, summary: summarizePlan(plan, rejections.length) };
    },
    (p) => `${p.plan.insert.length} new · ${p.plan.corrections.length} corrected · ${p.rejections.length} rejected`
  );

  const submission = await stage(
    'write',
    () => writeSubmission(prisma, { sessionId: dims.sessionId, ...planned }),
    () => `${planned.summary.inserted} events written`
  );

  if (prepareReplay) {
    await stage('replay', () => prepareReplay(dims.sessionId));
  }

  const changed = planned.summary.inserted + planned.summary.corrected > 0;
  let derivation = null;
  if (changed && runDerivation) {
    if (deferDerivation) {
      const t = now();
      onProgress({ stage: 'derive', state: 'start', detail: 'in the background' });
      derivation = Promise.resolve()
        .then(() => runDerivation(prisma, dims.sessionId))
        .then(() => {
          timings.derive = now() - t;
          onProgress({ stage: 'derive', state: 'done', ms: timings.derive });
        });
    } else {
      await stage('derive', () => runDerivation(prisma, dims.sessionId));
    }
  }

  return {
    sessionId: dims.sessionId,
    submission,
    summary: planned.summary,
    rejections: planned.rejections,
    changed,
    timings,
    readyMs: now() - started,
    derivation,
  };
}
