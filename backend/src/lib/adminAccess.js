/**
 * adminAccess — who counts as an admin.
 *
 * Admins are listed by Firebase UID in the ADMIN_UIDS environment variable,
 * comma-separated, e.g.
 *
 *   ADMIN_UIDS=3xYzAbC123...,9kLmNoP456...
 *
 * A user's UID is shown on their Profile page ("User ID"), and in the
 * Firebase Console under Authentication -> Users.
 *
 * The list lives only on the backend so it never ships in the frontend
 * bundle: the frontend learns whether the signed-in user is an admin from
 * GET /api/auth/me (and POST /api/auth/session), and any admin-only API
 * route should be protected with requireAdmin (see middleware/requireAuth.js).
 *
 * Read on every call rather than cached at import time, so a changed env
 * var takes effect on the next restart without touching code, and tests
 * can set process.env.ADMIN_UIDS per case.
 */
export function getAdminUids() {
  return (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
}

export function isAdminUid(uid) {
  if (!uid) return false;
  return getAdminUids().includes(uid);
}
