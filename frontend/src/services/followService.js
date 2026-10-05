// Follows are stored in the backend database (per signed-in user), so they
// follow the account across devices. This module keeps a small in-memory copy
// so components can read synchronously, and notifies subscribers on change.
import {
  followDriverRequest,
  followTeamRequest,
  getFollows,
  unfollowDriverRequest,
  unfollowTeamRequest,
} from '../api/client';
import { syncFollowPreference } from './userPreferences';

export const FOLLOWS_UPDATED_EVENT = 'f1-analytics-follows-updated';

const emptyFollows = () => ({ drivers: [], teams: [] });

let cache = { userId: null, follows: emptyFollows(), loaded: false };
let inflight = null;

function normalize(data) {
  return {
    drivers: Array.isArray(data?.drivers) ? data.drivers : [],
    teams: Array.isArray(data?.teams) ? data.teams : [],
  };
}

function setCache(userId, follows) {
  cache = { userId, follows: normalize(follows), loaded: true };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FOLLOWS_UPDATED_EVENT, { detail: { userId } }));
  }
  return cache.follows;
}

// Clear on sign-out / in tests so one account never sees another's follows.
export function resetFollowCache() {
  cache = { userId: null, follows: emptyFollows(), loaded: false };
  inflight = null;
}

// Synchronous read of whatever is cached for this user (empty until loaded).
export function readFollows(userId) {
  if (!userId || cache.userId !== userId) return emptyFollows();
  return cache.follows;
}

// --- Local fallback ---------------------------------------------------------
// If the server can't be reached (or errors), follows are kept in
// localStorage so the button still works. Changes made that way are queued
// and pushed to the server the next time it responds.
const LOCAL_KEY = (userId) => `f1-follows-local:${userId}`;
const PENDING_KEY = (userId) => `f1-follows-pending:${userId}`;
const PREFERENCE_PENDING_KEY = (userId) => `f1-follow-preferences-pending:${userId}`;

function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — the in-memory cache still works this session.
  }
}

const readLocal = (userId) => normalize(readStore(LOCAL_KEY(userId), null));
const readPending = (userId) => readStore(PENDING_KEY(userId), []);
const readPreferencePending = (userId) => readStore(PREFERENCE_PENDING_KEY(userId), []);
let preferenceRevision = 0;

function queueOp(userId, op) {
  // A newer op on the same entity replaces any older queued one.
  const pending = readPending(userId).filter((p) => !(p.type === op.type && p.id === op.id));
  pending.push(op);
  writeStore(PENDING_KEY(userId), pending);
}

function queuePreferenceOp(userId, op) {
  const queued = {
    ...op,
    revision: `${Date.now()}-${++preferenceRevision}`,
  };

  const pending = readPreferencePending(userId)
    .filter((item) => !(item.type === op.type && item.id === op.id));

  pending.push(queued);
  writeStore(PREFERENCE_PENDING_KEY(userId), pending);
  return queued;
}

function applyLocal(userId, type, id, snapshot, on) {
  const key = type === 'team' ? 'teams' : 'drivers';
  const current = readFollows(userId);
  const list = current[key].filter((item) => item.id !== id);
  if (on) list.push({ ...snapshot, id });
  return setCache(userId, { ...current, [key]: list });
}

async function sendOp(op) {
  if (op.type === 'team') {
    return op.on ? followTeamRequest(op.id, op.snapshot) : unfollowTeamRequest(op.id);
  }
  return op.on ? followDriverRequest(op.id, op.snapshot) : unfollowDriverRequest(op.id);
}

const preferenceWorkers = new Map();

function runPreferenceWorker(userId) {
  const previous = preferenceWorkers.get(userId) || Promise.resolve();

  const worker = previous.catch(() => {}).then(async () => {
    // Snapshot this batch. Later changes schedule another worker.
    const batch = readPreferencePending(userId);

    for (const op of batch) {
      // Skip operations replaced since the batch was read.
      const isCurrent = readPreferencePending(userId).some(
        (item) => (
          item.type === op.type
          && item.id === op.id
          && item.revision === op.revision
        )
      );

      if (!isCurrent) continue;

      try {
        const result = await syncFollowPreference(
          userId,
          op.type,
          op.id,
          op.on,
          op.snapshot
        );

        if (result?.storage !== 'cloud') continue;

        // Read the queue again: preserve changes added during the write.
        const remaining = readPreferencePending(userId).filter(
          (item) => !(
            item.type === op.type
            && item.id === op.id
            && item.revision === op.revision
          )
        );

        writeStore(PREFERENCE_PENDING_KEY(userId), remaining);
      } catch {
        // Leave the operation queued for retry.
      }
    }
  });

  preferenceWorkers.set(userId, worker);

  return worker.finally(() => {
    if (preferenceWorkers.get(userId) === worker) {
      preferenceWorkers.delete(userId);
    }
  });
}

async function syncPreference(userId, op) {
  queuePreferenceOp(userId, op);
  await runPreferenceWorker(userId);
}

async function flushPreferencePending(userId) {
  await runPreferenceWorker(userId);
}

async function flushPending(userId) {
  const pending = readPending(userId);
  if (pending.length === 0) return;
  const remaining = [];
  for (const op of pending) {
    try {
      await sendOp(op);
      await syncPreference(userId, op);
    } catch {
      remaining.push(op);
    }
  }
  writeStore(PENDING_KEY(userId), remaining);
}

// Fetch from the server (once per user unless `force`) and update the cache.
// Falls back to the locally stored copy when the server can't be reached.
export async function loadFollows(userId, { force = false } = {}) {
  if (!userId) return emptyFollows();
  if (!force && cache.loaded && cache.userId === userId) return cache.follows;
  if (inflight?.userId === userId) return inflight.promise;

  const promise = (async () => {
    await flushPending(userId);
    await flushPreferencePending(userId);
    try {
      const data = await getFollows();
      // Anything still queued hasn't reached the server; layer it on top.
      const stillPending = readPending(userId);
      let merged = normalize(data);
      if (stillPending.length > 0) {
        setCache(userId, merged);
        stillPending.forEach((op) => {
          merged = applyLocal(userId, op.type, op.id, op.snapshot, op.on);
        });
      }
      writeStore(LOCAL_KEY(userId), merged);
      return setCache(userId, merged);
    } catch {
      return setCache(userId, readLocal(userId));
    }
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { userId, promise };
  return promise;
}

export function getFollowCount(userId) {
  const follows = readFollows(userId);
  return follows.drivers.length + follows.teams.length;
}

export function isFollowingDriver(userId, driverId) {
  return readFollows(userId).drivers.some((d) => d.id === driverId);
}

export function isFollowingTeam(userId, teamId) {
  return readFollows(userId).teams.some((t) => t.id === teamId);
}

// Update the cache first so the UI responds immediately, then try the server.
// If the server fails, the change stays in localStorage and is queued.
async function change(userId, type, id, snapshot, on) {
  // Make sure the cache belongs to this user before layering a change on it.
  if (cache.userId !== userId) setCache(userId, readLocal(userId));
  const key = type === 'team' ? 'teams' : 'drivers';
  const existingSnapshot = readFollows(userId)[key].find((item) => item.id === id);
  const preferenceSnapshot = snapshot || existingSnapshot || null;
  const op = { type, id, snapshot: preferenceSnapshot, on };
  const optimistic = applyLocal(userId, type, id, preferenceSnapshot, on);
  writeStore(LOCAL_KEY(userId), optimistic);

  let serverData;
  try {
    serverData = await sendOp(op);
  } catch (err) {
    console.warn('Follow saved locally; server update failed:', err.status || err.message);
    // Keep the personalised News Feed in sync with the local fallback too.
    // This is what lets the localhost demo follow drivers without a backend
    // login, and it also preserves useful behaviour during a real outage.
    await syncPreference(userId, op);
    queueOp(userId, op);
    return optimistic;
  }

  await syncPreference(userId, op);
  writeStore(LOCAL_KEY(userId), normalize(serverData));
  return setCache(userId, serverData);
}

// `driver` / `team` carry a small display snapshot (name, number, colours...)
// that the server stores next to the follow so the list renders in one call.
export async function followDriver(userId, driver) {
  if (!userId || !driver?.id) throw new Error('A signed-in user and a driver are required to follow.');
  return change(userId, 'driver', driver.id, driver, true);
}

export async function unfollowDriver(userId, driverId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  return change(userId, 'driver', driverId, null, false);
}

export async function followTeam(userId, team) {
  if (!userId || !team?.id) throw new Error('A signed-in user and a team are required to follow.');
  return change(userId, 'team', team.id, team, true);
}

export async function unfollowTeam(userId, teamId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  return change(userId, 'team', teamId, null, false);
}

export function subscribeToFollows(userId, callback) {
  if (!userId || typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (!event.detail?.userId || event.detail.userId === userId) callback();
  };
  window.addEventListener(FOLLOWS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(FOLLOWS_UPDATED_EVENT, handler);
}
