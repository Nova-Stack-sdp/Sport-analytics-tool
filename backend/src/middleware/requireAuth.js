/**
 * requireAuth — Express middleware that verifies a Firebase ID token on
 * incoming requests.
 *
 * The frontend uses Firebase Authentication directly (see
 * frontend/src/firebase.js) rather than a custom backend auth endpoint —
 * this middleware is the backend's half of that: it doesn't issue or
 * manage sessions itself, it just verifies the ID token Firebase already
 * issued to the client and attaches the decoded user to req.user.
 *
 * Usage (once wired into a route):
 *   import { requireAuth } from '../middleware/requireAuth.js';
 *   router.get('/admin-only', requireAuth, handler);
 *
 * The client sends the token as:
 *   Authorization: Bearer <firebase-id-token>
 * (get it client-side via `await auth.currentUser.getIdToken()`).
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set on the backend — a JSON
 * service account key (Firebase Console -> Project settings -> Service
 * accounts -> Generate new private key), stored as a single-line JSON
 * string in the env var. Never commit the key file itself.
 */
import admin from 'firebase-admin';

let adminApp;

function getAdminApp() {
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

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
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