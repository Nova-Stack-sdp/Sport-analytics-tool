// Follows live in the same place profile customization does (browser
// localStorage, keyed per signed-in user) — there is no backend user table
// yet, so this mirrors services/userProfile.js rather than inventing a
// second storage strategy.
export const FOLLOWS_UPDATED_EVENT = 'f1-analytics-follows-updated';

function followsStorageKey(userId) {
  return `f1-analytics-follows:${userId}`;
}

function emptyFollows() {
  return { drivers: [], teams: [] };
}

export function readFollows(userId) {
  if (!userId || typeof window === 'undefined') return emptyFollows();

  try {
    const saved = JSON.parse(window.localStorage.getItem(followsStorageKey(userId)) || '{}');
    return {
      drivers: Array.isArray(saved.drivers) ? saved.drivers : [],
      teams: Array.isArray(saved.teams) ? saved.teams : [],
    };
  } catch {
    return emptyFollows();
  }
}

function writeFollows(userId, follows) {
  window.localStorage.setItem(followsStorageKey(userId), JSON.stringify(follows));
  window.dispatchEvent(new CustomEvent(FOLLOWS_UPDATED_EVENT, { detail: { userId } }));
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

// `driver` is a small denormalized snapshot (id, name, number, teamName,
// teamColor) so the "Following" list can render without re-fetching every
// followed driver's full profile.
export function followDriver(userId, driver) {
  if (!userId || !driver?.id) throw new Error('A signed-in user and a driver are required to follow.');
  const follows = readFollows(userId);
  if (follows.drivers.some((d) => d.id === driver.id)) return follows;
  const next = { ...follows, drivers: [...follows.drivers, driver] };
  writeFollows(userId, next);
  return next;
}

export function unfollowDriver(userId, driverId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  const follows = readFollows(userId);
  const next = { ...follows, drivers: follows.drivers.filter((d) => d.id !== driverId) };
  writeFollows(userId, next);
  return next;
}

export function followTeam(userId, team) {
  if (!userId || !team?.id) throw new Error('A signed-in user and a team are required to follow.');
  const follows = readFollows(userId);
  if (follows.teams.some((t) => t.id === team.id)) return follows;
  const next = { ...follows, teams: [...follows.teams, team] };
  writeFollows(userId, next);
  return next;
}

export function unfollowTeam(userId, teamId) {
  if (!userId) throw new Error('A signed-in user is required to unfollow.');
  const follows = readFollows(userId);
  const next = { ...follows, teams: follows.teams.filter((t) => t.id !== teamId) };
  writeFollows(userId, next);
  return next;
}

export function subscribeToFollows(userId, callback) {
  if (!userId || typeof window === 'undefined') return () => {};

  const handleFollowsUpdate = (event) => {
    if (!event.detail?.userId || event.detail.userId === userId) callback();
  };
  const handleStorage = (event) => {
    if (event.key === followsStorageKey(userId)) callback();
  };

  window.addEventListener(FOLLOWS_UPDATED_EVENT, handleFollowsUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(FOLLOWS_UPDATED_EVENT, handleFollowsUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}
