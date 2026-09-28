/**
 * firebaseAdmin — single shared Firebase Admin app instance.
 *
 * Both requireAuth (token verification) and the driver image cache
 * (Firestore reads/writes) need an initialized admin app. firebase-admin
 * throws if initializeApp() is called more than once for the same app, so
 * this module is the one place that does it; everything else imports
 * getAdminApp()/getFirestore() from here instead of calling admin.initializeApp()
 * itself.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set — a JSON service account key
 * (Firebase Console -> Project settings -> Service accounts -> Generate new
 * private key), stored as a single-line JSON string in the env var.
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

export function getFirestore() {
  return admin.firestore(getAdminApp());
}
