/**
 * auth routes — thin httpOnly cookie layer on top of Firebase Auth.
 *
 * The frontend authenticates via Firebase Client SDK (email/password,
 * Google, GitHub) and then exchanges the Firebase ID token for an
 * httpOnly cookie through POST /api/auth/session.  Subsequent requests
 * carry the cookie automatically; requireAuth reads it and verifies via
 * Firebase Admin SDK.
 *
 * Endpoints:
 *   POST /api/auth/session         — token exchange (Firebase ID token → cookie)
 *   POST /api/auth/logout          — clear the cookie
 *   GET  /api/auth/me              — check cookie (or Bearer token), return
 *                                    current user (incl. developer/admin) or 401
 *   GET  /api/auth/admin-check     — 200 for admins, 403 for everyone else
 *   POST /api/auth/developer-mode  — set the `developer` custom claim on the
 *                                    signed-in user's own Firebase account
 *   PUT  /api/user/favorites       — update favorite driver and team in PostgreSQL
 */
import { Router } from 'express';
import admin from 'firebase-admin';
import { requireAuth, requireAdmin, getAdminApp } from '../middleware/requireAuth.js';
import { isAdminUid } from '../lib/adminAccess.js';
// 1. ADD THIS: Import your Prisma client (adjust the path if your Prisma client is exported from a lib folder)
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

// Cookie name — kept consistent across set/clear/read.
const COOKIE_NAME = '__session';

// Cookie options shared by set and clear.  Secure is only meaningful over
// HTTPS (production); in local dev the cookie is sent over plain HTTP.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Firebase ID tokens expire after 1 hour by default, but the SDK
    // auto-refreshes them.  Match the cookie max-age to a generous
    // 7-day window — the middleware re-verifies the token on every
    // request, so a stale/expired token inside a valid cookie is still
    // rejected.
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

// ------------------------------------------------------------------
// POST /api/auth/session — exchange a Firebase ID token for a cookie
// ------------------------------------------------------------------
authRouter.post('/session', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing idToken in request body' });
    }

    // Verify the token using the same Firebase Admin SDK that requireAuth
    // uses — this reuses the singleton admin app under the hood.
    const app = getAdminApp();
    const decoded = await admin.auth(app).verifyIdToken(idToken);

    console.log('--- SESSION ENDPOINT HIT: Creating profile for UID:', decoded.uid);

    // Initialize the user profile in PostgreSQL using the shared Prisma
    // instance. This runs *after* the token has already been verified, so
    // it gets its own try/catch below — a DB hiccup here is a server-side
    // problem, not proof the token was bad, and must not be reported as one.
    try {
      await prisma.userProfile.upsert({
        where: { userId: decoded.uid },
        update: {},
        create: { userId: decoded.uid },
      });
    } catch (profileErr) {
      console.error('auth/session: failed to upsert user profile:', profileErr.message);
      return res.status(500).json({ error: 'Could not initialize user profile' });
    }

    res.cookie(COOKIE_NAME, idToken, cookieOptions());
    res.json({ uid: decoded.uid, email: decoded.email ?? null, admin: isAdminUid(decoded.uid) });
  } catch (err) {
    // Anything reaching this catch happened before the profile upsert, i.e.
    // during token verification/admin-app setup — so it's safe to treat as
    // a bad/misconfigured token, same convention as requireAuth.
    if (err.message?.includes('FIREBASE_SERVICE_ACCOUNT')) {
      console.error('auth/session misconfigured:', err.message);
      return res.status(500).json({ error: 'Auth is not configured on the server' });
    }
    return res.status(401).json({ error: 'Invalid or expired Firebase token' });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/logout — clear the session cookie
// ------------------------------------------------------------------
authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ status: 'ok' });
});

// ------------------------------------------------------------------
// GET /api/auth/me — return the current user from the cookie
// ------------------------------------------------------------------
authRouter.get('/me', requireAuth, (req, res) => {
  // requireAuth already verified the token (from cookie or Bearer
  // header) and attached req.user, so we just echo it back.
  res.json({
    uid: req.user.uid,
    email: req.user.email,
    developer: req.user.developer,
    admin: req.user.admin,
  });
});

// ------------------------------------------------------------------
// GET /api/auth/admin-check — is the caller an admin?
// ------------------------------------------------------------------
// The first route guarded by requireAdmin. The Admin page itself is still
// static UI, so nothing else needs protecting yet — but this proves the
// server-side check end to end, and it's the pattern to copy for real
// admin endpoints later.
authRouter.get('/admin-check', requireAuth, requireAdmin, (req, res) => {
  res.json({ admin: true });
});

// ------------------------------------------------------------------
// POST /api/auth/developer-mode — set the `developer` custom claim
// ------------------------------------------------------------------
// Self-service: a signed-in user toggles their own developer mode from
// Settings. This is NOT an admin-grant flow — anyone signed in can turn
// it on for themselves, same as the earlier localStorage-only version,
// just now persisted on the account instead of the browser. If developer
// access ever needs to be admin-approved instead, this is the endpoint
// to lock down (e.g. require an admin claim on the caller).
authRouter.post('/developer-mode', requireAuth, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  try {
    const app = getAdminApp();
    // Custom claims are set as a whole object — fetch the user's existing
    // claims first and merge, so this never wipes out other claims (e.g.
    // a future `admin: true`) that happen to already be set.
    const existingUser = await admin.auth(app).getUser(req.user.uid);
    const claims = { ...(existingUser.customClaims || {}), developer: enabled };
    await admin.auth(app).setCustomUserClaims(req.user.uid, claims);
    res.json({ developer: enabled });
  } catch (err) {
    console.error('auth/developer-mode failed:', err.message);
    res.status(500).json({ error: 'Could not update developer mode' });
  }
});

// PUT /api/user/favorites — Update favorite driver and team
authRouter.put('/favorites', requireAuth, async (req, res) => {
  const { favoriteTeamId, favoriteDriverId } = req.body;

  try {
    const updated = await prisma.userProfile.update({
      where: { userId: req.user.uid },
      data: { favoriteTeamId, favoriteDriverId },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});