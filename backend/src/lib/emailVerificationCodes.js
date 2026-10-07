/**
 * emailVerificationCodes — generate, hash and compare the 6-digit codes
 * mailed to an account (see routes/emailVerification.js).
 *
 * Everything here is pure: no database, no network, no Firebase. The route
 * module owns the storage and the Admin SDK call.
 */
import crypto from 'node:crypto';

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
// Wrong guesses allowed per code before it is burned and a new one is
// required. With a 10^6 space, five guesses is a 1-in-200000 chance.
export const MAX_ATTEMPTS = 5;
// Minimum gap between two sends to the same account.
export const RESEND_COOLDOWN_SECONDS = 60;
// Hard ceiling per account per 24 h, so one signed-in account cannot be
// used to mail-bomb an address.
export const DAILY_SEND_LIMIT = 10;

/**
 * The HMAC pepper. Not a secret the code's strength rests on — the TTL and
 * attempt cap are what bound guessing — but it keeps a read-only database
 * leak from yielding codes that can be tried against the live endpoint.
 * Set EMAIL_CODE_PEPPER in production; the fallback is for local dev and
 * tests, where codes are printed to the log anyway.
 */
let warnedAboutPepper = false;
function pepper() {
  if (process.env.EMAIL_CODE_PEPPER) return process.env.EMAIL_CODE_PEPPER;
  if (!warnedAboutPepper && process.env.NODE_ENV === 'production') {
    warnedAboutPepper = true;
    console.warn(
      'EMAIL_CODE_PEPPER is not set — email verification codes are hashed with the built-in default. Set it in production.'
    );
  }
  return 'dev-only-pepper';
}

/** A cryptographically random 6-digit code, zero-padded ("000123"). */
export function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function hashCode(code) {
  return crypto.createHmac('sha256', pepper()).update(String(code)).digest('hex');
}

/**
 * Constant-time comparison of a submitted code against a stored hash —
 * re-hashing the submission and comparing digests, so the comparison never
 * leaks how many leading digits were right.
 */
export function codesMatch(submittedCode, storedHash) {
  const submitted = Buffer.from(hashCode(submittedCode), 'hex');
  const stored = Buffer.from(String(storedHash ?? ''), 'hex');
  if (stored.length === 0 || submitted.length !== stored.length) return false;
  return crypto.timingSafeEqual(submitted, stored);
}

/** Exactly six digits, so garbage never reaches the database lookup. */
export function isCodeShape(code) {
  return typeof code === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());
}

/**
 * "ana@example.com" -> "an***@example.com" — enough for the user to
 * recognise which address the code went to without echoing it in full.
 */
export function maskEmail(email) {
  const value = String(email ?? '');
  const at = value.indexOf('@');
  if (at <= 0) return value ? `${value.slice(0, 1)}***` : '';
  const local = value.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${value.slice(at)}`;
}
