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

// Fetch from the server (once per user unless `force`) and update the cache.
export async function loadFollows(userId, { force = false } = {}) {
  if (!userId) return emptyFollows();
  if (!force && cache.loaded && cache.userId === userId) return cache.follows;
  if (inflight?.userId === userId) return inflight.promise;

  const promise = Promise.resolve(getFollows())
    .then((data) => setCache(userId, data))
    .finally(() => {
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

// `driver` / `team` carry a small display snapshot (name, number, colours...)
// that the server stores next to the follow so the list renders in one call.
export async function followDriver(userId, driver) {
  if (!userId || !driver?.id) throw new Error('A signed-in user and a driver are required to follow.');
  return setCache(userId, await followDriverRequest(driver.id, driver));
}

export async function unfollowDriver(userId, driverId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  return setCache(userId, await unfollowDriverRequest(driverId));
}

export async function followTeam(userId, team) {
  if (!userId || !team?.id) throw new Error('A signed-in user and a team are required to follow.');
  return setCache(userId, await followTeamRequest(team.id, team));
}

export async function unfollowTeam(userId, teamId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  return setCache(userId, await unfollowTeamRequest(teamId));
}

export function subscribeToFollows(userId, callback) {
  if (!userId || typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (!event.detail?.userId || event.detail.userId === userId) callback();
  };
  window.addEventListener(FOLLOWS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(FOLLOWS_UPDATED_EVENT, handler);
}