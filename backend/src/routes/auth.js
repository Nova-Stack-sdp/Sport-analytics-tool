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
 *   POST /api/auth/session  — token exchange (Firebase ID token → cookie)
 *   POST /api/auth/logout   — clear the cookie
 *   GET  /api/auth/me       — check cookie, return current user or 401
 */
import { Router } from 'express';
import admin from 'firebase-admin';
import { requireAuth, getAdminApp } from '../middleware/requireAuth.js';

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

    res.cookie(COOKIE_NAME, idToken, cookieOptions());
    res.json({ uid: decoded.uid, email: decoded.email ?? null });
  } catch (err) {
    // Distinguish misconfiguration from bad tokens, same convention as
    // requireAuth.
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
  res.json({ uid: req.user.uid, email: req.user.email });
});
