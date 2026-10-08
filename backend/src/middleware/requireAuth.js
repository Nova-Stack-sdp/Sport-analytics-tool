/**
 * requireAuth — Express middleware that verifies a Firebase ID token on
 * incoming requests.
 *
 * Supports two token transport methods (checked in order):
 *   1. Authorization header:  Authorization: Bearer <firebase-id-token>
 *   2. httpOnly cookie:       __session=<firebase-id-token>
 *
 * The frontend exchanges the Firebase ID token for an httpOnly cookie
 * via POST /api/auth/session.  Subsequent requests carry the cookie
 * automatically, so protected routes just add this middleware and the
 * token is verified transparently.
 *
 * Usage:
 *   import { requireAuth } from '../middleware/requireAuth.js';
 *   router.get('/admin-only', requireAuth, handler);
 *   router.get('/verified-only', requireAuth, requireVerifiedEmail, handler);
 *
 * Sensitive routes (account deletion, privilege changes) use requireFreshAuth
 * instead — same verification, plus Firebase's checkRevoked so disabled,
 * deleted or explicitly revoked accounts stop working immediately rather
 * than when their token happens to expire (up to one hour).
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set on the backend — a JSON
 * service account key (Firebase Console -> Project settings -> Service
 * accounts -> Generate new private key), stored as a single-line JSON
 * string in the env var. Never commit the key file itself.
 */
import admin from 'firebase-admin';
import { getAdminApp } from '../lib/firebaseAdmin.js';
import { isAdminUid } from '../lib/adminAccess.js';

export { getAdminApp } from '../lib/firebaseAdmin.js';

// Cookie name — must match the name used in routes/auth.js.
const COOKIE_NAME = '__session';

/**
 * Extract the Firebase ID token from the request.
 * Prefers the Authorization header (explicit Bearer token), falls back
 * to the httpOnly cookie set by POST /api/auth/session.
 */
function extractToken(req) {
  // 1. Authorization header
  const header = req.headers.authorization || '';
  const [scheme, bearerToken] = header.split(' ');
  if (scheme === 'Bearer' && bearerToken) {
    return bearerToken;
  }

  // 2. httpOnly cookie
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export async function requireAuth(req, res, next) {
  return authenticate(req, res, next, { checkRevoked: false });
}

/**
 * requireFreshAuth — requireAuth with Firebase's revocation check switched
 * on, for routes where the consequence of a stale session is too high to
 * accept the default one-hour token window: account deletion, and anything
 * else that must stop working the moment an account is disabled or its
 * tokens are revoked (admin.auth().revokeRefreshTokens()). Costs one extra
 * Firebase user lookup per request, so it is for sensitive routes only.
 */
export async function requireFreshAuth(req, res, next) {
  return authenticate(req, res, next, { checkRevoked: true });
}

async function authenticate(req, res, next, { checkRevoked }) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    // A missing/bad FIREBASE_SERVICE_ACCOUNT is a server misconfiguration,
    // not a bad request — worth a distinct status so it doesn't get
    // silently read as "user sent an invalid token" in logs/monitoring.
    console.error('requireAuth misconfigured:', err.message);
    return res.status(500).json({ error: 'Auth is not configured on the server' });
  }

  try {
    const decoded = await admin.auth(app).verifyIdToken(token, checkRevoked);
    // Custom claims (set via the Admin SDK, e.g. `developer: true`) ride
    // along inside the decoded token automatically — no extra lookup
    // needed here, just pull them out alongside the standard fields.
    // `admin` is NOT a token claim — it's decided by the ADMIN_UIDS
    // allowlist on this server (see lib/adminAccess.js).
    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      // `email_verified` is a standard Firebase claim rather than a custom
      // one, so it costs no extra lookup. A token minted before the address
      // was verified still says false, which is exactly what the gate below
      // wants to see — the client force-refreshes after verifying.
      emailVerified: decoded.email_verified === true,
      developer: decoded.developer === true,
      admin: isAdminUid(decoded.uid),
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireAdmin — use AFTER requireAuth on any admin-only route:
 *
 *   router.post('/something', requireAuth, requireAdmin, handler);
 *
 * Signed in but not on the ADMIN_UIDS list -> 403 (not 401: we know who
 * they are, they just aren't allowed).
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  if (!req.user.admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * requireVerifiedEmail — use AFTER requireAuth on routes that need a real,
 * reachable address, not merely a Firebase account:
 *
 *   router.get('/something', requireAuth, requireVerifiedEmail, handler);
 *
 * Firebase creates an email/password account for any syntactically valid
 * address without ever mailing it, so "has a token" and "owns that inbox"
 * are different things (see routes/emailVerification.js for how the address
 * is proved). UIDs on the ADMIN_UIDS allowlist are exempt: they are already
 * trusted operators, and an account created before verification existed
 * would otherwise be locked out of its own admin tools.
 *
 * 403 (not 401) — the identity is known and valid, it just isn't verified
 * yet — and the `code` lets the client route the user to the verify page
 * instead of the sign-in page.
 */
export function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  if (!req.user.emailVerified && !req.user.admin) {
    return res.status(403).json({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}