/**
 * validationRules — catches impossible or conflicting event data before it
 * reaches the event log.
 *
 * Every rejection says which rule failed and why, so a submitter is told
 * what was wrong rather than the record silently disappearing. The limits
 * are deliberately generous: they're there to catch data that cannot be
 * true (a 5-second lap, 25th place in a 20-car field, two cars classified
 * P1), not to second-guess unusual-but-real races.
 *
 * Pure (no database) so it can be unit tested and reused by any submission
 * path, not just the OpenF1 sync.
 */

// A race may run for at most 3 hours including suspensions, so no single lap
// or pit stop can take longer than that. (The upper limits have to allow for
// red flags: a lap or pit stop that spans a stoppage can genuinely last tens
// of minutes, so anything tighter would reject real races.)
const MAX_SESSION_MS = 3 * 60 * 60_000;

export const LIMITS = {
  minLapMs: 30_000, // no F1 lap has ever been close to 30s
  maxLapMs: MAX_SESSION_MS,
  maxLapNumber: 100, // longest races are ~78 laps
  maxPitMs: MAX_SESSION_MS,
  // How far outside the session's scheduled window an event may be stamped
  // (weather and race control start logging well before lights out).
  sessionWindowMs: 6 * 60 * 60_000,
};

// Upper bound on points one car can score in one session.
const MAX_POINTS = { Race: 26, Sprint: 8 };

const TIMESTAMPED = new Set([
  'lap_completed',
  'pit_stop',
  'position_change',
  'flag_event',
  'race_control_message',
  'weather_snapshot',
]);

function isInt(value) {
  return Number.isInteger(value);
}

/**
 * @param {Array} events - normalised events ({ eventType, entryId, lapNumber, occurredAt, payload })
 * @param {object} context
 * @param {number} context.entryCount - cars entered in the session (field size)
 * @param {string} [context.sessionType] - 'Race' | 'Sprint' | 'Q' | ...
 * @param {Date|string} [context.sessionStart]
 * @param {Date|string} [context.sessionEnd]
 * @returns {{ accepted: Array, rejections: Array<{ eventType, rule, reason, record }> }}
 */
export function validateEvents(events, context) {
  const { entryCount, sessionType } = context;
  const start = context.sessionStart ? new Date(context.sessionStart).getTime() : null;
  const end = context.sessionEnd ? new Date(context.sessionEnd).getTime() : start;
  const maxPoints = MAX_POINTS[sessionType] ?? 0;

  const accepted = [];
  const rejections = [];
  const takenFinishPositions = new Map(); // position -> entryId
  const takenGridPositions = new Map();

  const reject = (event, rule, reason) => {
    rejections.push({ eventType: event.eventType, rule, reason, record: event });
  };

  const inField = (position) => isInt(position) && position >= 1 && position <= entryCount;

  for (const event of events) {
    const payload = event.payload ?? {};
    let problem = null; // [rule, reason]

    if (TIMESTAMPED.has(event.eventType) && start !== null) {
      const at = new Date(event.occurredAt).getTime();
      if (Number.isNaN(at)) {
        problem = ['timestamp', 'occurred_at is not a valid date'];
      } else if (at < start - LIMITS.sessionWindowMs || at > end + LIMITS.sessionWindowMs) {
        problem = ['timestamp', `occurred_at ${new Date(at).toISOString()} is far outside the session`];
      }
    }

    if (!problem) {
      switch (event.eventType) {
        case 'lap_completed': {
          const lapMs = payload.lap_time_ms;
          if (!isInt(event.lapNumber) || event.lapNumber < 1 || event.lapNumber > LIMITS.maxLapNumber) {
            problem = ['lap_number', `lap number ${event.lapNumber} is not between 1 and ${LIMITS.maxLapNumber}`];
          } else if (lapMs != null && (lapMs < LIMITS.minLapMs || lapMs > LIMITS.maxLapMs)) {
            problem = ['lap_time', `lap time ${lapMs} ms is outside the possible range (at least 30 s, at most 3 hours)`];
          }
          break;
        }
        case 'pit_stop': {
          const pitMs = payload.pit_duration_ms;
          if (pitMs != null && (pitMs <= 0 || pitMs > LIMITS.maxPitMs)) {
            problem = ['pit_duration', `pit duration ${pitMs} ms is outside the possible range (more than 0, at most 3 hours)`];
          }
          break;
        }
        case 'position_change': {
          const { from_position: from, to_position: to } = payload;
          if (!inField(from) || !inField(to)) {
            problem = ['position_range', `position change ${from} -> ${to} is outside a ${entryCount}-car field`];
          } else if (from === to) {
            problem = ['position_change', `position change ${from} -> ${to} doesn't change position`];
          }
          break;
        }
        case 'tyre_stint': {
          const { start_lap: s, end_lap: e } = payload;
          if (s != null && e != null && s > e) {
            problem = ['stint_laps', `stint starts on lap ${s} but ends on lap ${e}`];
          }
          break;
        }
        case 'classification': {
          const position = payload.final_position;
          const points = payload.points ?? 0;
          if (position != null && !inField(position)) {
            problem = ['position_range', `final position ${position} is outside a ${entryCount}-car field`];
          } else if (typeof points !== 'number' || points < 0 || points > maxPoints) {
            problem = ['points', `${points} points is not possible in a ${sessionType ?? 'this'} session (max ${maxPoints})`];
          } else if (position != null && takenFinishPositions.has(position)) {
            problem = ['conflict', `final position ${position} is already given to another car in this submission`];
          } else if (position != null) {
            takenFinishPositions.set(position, event.entryId);
          }
          break;
        }
        case 'grid_position': {
          const position = payload.position;
          if (!inField(position)) {
            problem = ['position_range', `grid position ${position} is outside a ${entryCount}-car field`];
          } else if (takenGridPositions.has(position)) {
            problem = ['conflict', `grid position ${position} is already given to another car in this submission`];
          } else {
            takenGridPositions.set(position, event.entryId);
          }
          break;
        }
        default:
          break;
      }
    }

    if (problem) reject(event, problem[0], problem[1]);
    else accepted.push(event);
  }

  return { accepted, rejections };
}
