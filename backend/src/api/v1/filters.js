/**
 * Filter definitions for the v1 API, and their translation into Prisma
 * `where` clauses. The same event filters drive both GET /api/v1/events and
 * the events export, so "narrow a request to the slice it cares about"
 * means the same thing whether you page through it or download it.
 *
 * Pure (no database access) — unit tested directly.
 */
import { parsers, EVENT_TYPES, SESSION_TYPES, SESSION_STATUSES } from './params.js';
import { FROM_UNDELETED_DATASET } from '../../lib/eventVisibility.js';

export const fixtureFilterSpec = {
  season: parsers.int({ min: 1950, max: 2100 }),
  sessionType: parsers.oneOf(SESSION_TYPES),
  status: parsers.oneOf(SESSION_STATUSES),
  circuit: parsers.text({ maxLength: 60 }),
  from: parsers.date(),
  to: parsers.date(),
};

export function fixtureWhere(v) {
  const meeting = {};
  if (v.season !== undefined) meeting.season = v.season;
  if (v.circuit) meeting.circuit = { name: { contains: v.circuit, mode: 'insensitive' } };

  const startTime = {};
  if (v.from) startTime.gte = v.from;
  if (v.to) startTime.lte = v.to;

  return {
    ...(v.sessionType && { type: v.sessionType }),
    ...(v.status && { status: v.status }),
    ...(Object.keys(meeting).length && { meeting }),
    ...(Object.keys(startTime).length && { startTime }),
  };
}

export const eventFilterSpec = {
  fixture: parsers.uuid(),
  season: parsers.int({ min: 1950, max: 2100 }),
  sessionType: parsers.oneOf(SESSION_TYPES),
  type: parsers.listOf(EVENT_TYPES),
  driver: parsers.uuid(),
  driverNumber: parsers.int({ min: 1, max: 99 }),
  team: parsers.uuid(),
  lapFrom: parsers.int({ min: 0, max: 200 }),
  lapTo: parsers.int({ min: 0, max: 200 }),
  from: parsers.date(),
  to: parsers.date(),
  includeSuperseded: parsers.bool(),
};

export function eventWhere(v) {
  const session = {};
  if (v.sessionType) session.type = v.sessionType;
  if (v.season !== undefined) session.meeting = { season: v.season };

  const entry = {};
  if (v.driver) entry.driverId = v.driver;
  if (v.driverNumber !== undefined) entry.driver = { driverNumber: v.driverNumber };
  if (v.team) entry.teamId = v.team;

  const lapNumber = {};
  if (v.lapFrom !== undefined) lapNumber.gte = v.lapFrom;
  if (v.lapTo !== undefined) lapNumber.lte = v.lapTo;

  const occurredAt = {};
  if (v.from) occurredAt.gte = v.from;
  if (v.to) occurredAt.lte = v.to;

  return {
    ...(v.fixture && { sessionId: v.fixture }),
    ...(Object.keys(session).length && { session }),
    ...(v.type && { eventType: { in: v.type } }),
    ...(Object.keys(entry).length && { entry }),
    ...(Object.keys(lapNumber).length && { lapNumber }),
    ...(Object.keys(occurredAt).length && { occurredAt }),
    // By default only current events; corrected-away versions on request.
    ...(!v.includeSuperseded && { supersededById: null }),
    // Events of a dataset an admin deleted are never served.
    ...FROM_UNDELETED_DATASET,
  };
}

// Oldest first, id as the tie-breaker so paging is stable.
export const eventOrder = [{ occurredAt: 'asc' }, { id: 'asc' }];
export const fixtureOrder = [{ startTime: 'desc' }, { id: 'asc' }];

export const eventInclude = { entry: { include: { driver: true, team: true } } };
export const fixtureInclude = { meeting: { include: { circuit: true } } };
