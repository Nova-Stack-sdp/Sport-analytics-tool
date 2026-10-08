/**
 * whois-user — ask Firebase directly what it knows about an email address.
 *
 * Read-only. Prints the account's uid, creation time, last sign-in, disabled
 * flag, verification state and provider list — or "no account" if the
 * project has never seen it. Use it when the sign-up page says an email
 * already exists: two accounts can't both be true, so this shows whether the
 * delete you did in the console actually landed in the project the app talks
 * to, and whether the account is disabled rather than gone.
 *
 * Usage:
 *   node scripts/whois-user.js someone@example.com
 *
 * Requires FIREBASE_SERVICE_ACCOUNT to be set — the key for the project the
 * app signs into (picked up from backend/.env via dotenv, same as the rest
 * of the backend). A service account key can only see its own project, so a
 * "no account" answer here while the console shows the user means the console
 * and the app are looking at different projects.
 */
import 'dotenv/config';
import admin from 'firebase-admin';
import { getAdminApp } from '../src/lib/firebaseAdmin.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/whois-user.js <email>');
  process.exit(1);
}

const app = getAdminApp();

try {
  const user = await admin.auth(app).getUserByEmail(email);
  const providers = user.providerData.map((p) => p.providerId);
  console.log(`Firebase account for ${email}:`);
  console.log(`  uid            ${user.uid}`);
  console.log(`  created        ${user.metadata.creationTime}`);
  console.log(`  last sign-in   ${user.metadata.lastSignInTime ?? '(never)'}`);
  console.log(`  disabled       ${user.disabled}`);
  console.log(`  email verified ${user.emailVerified}`);
  console.log(`  providers      ${providers.length ? providers.join(', ') : '(none)'}`);
} catch (err) {
  if (err.code === 'auth/user-not-found') {
    console.log(`No account with ${email} exists in this Firebase project.`);
  } else {
    console.error('Lookup failed:', err.message);
    process.exit(1);
  }
}
