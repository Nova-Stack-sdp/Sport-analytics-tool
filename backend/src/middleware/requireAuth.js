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
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set on the backend — a JSON
 * service account key (Firebase Console -> Project settings -> Service
 * accounts -> Generate new private key), stored as a single-line JSON
 * string in the env var. Never commit the key file itself.
 */
import admin from 'firebase-admin';

let adminApp;

export function getAdminApp() {
  if (adminApp) return adminApp;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set — check your environment configuration.'
    );
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return adminApp;
}

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
    const decoded = await admin.auth(app).verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
