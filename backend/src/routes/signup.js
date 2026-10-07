/**
 * signup routes — account creation that waits for the email code.
 *
 * Mounted at /api/auth/signup (see src/app.js). Deliberately NOT behind
 * requireAuth: by definition no account and no session exist yet.
 *
 *   POST /request — note a pending sign-up for an address, mail it a code
 *   POST /confirm — check the code, THEN create the Firebase account
 *
 * Why this exists separately from Firebase's own signup: the client SDK's
 * createUserWithEmailAndPassword makes the account before anyone has
 * proved the address, so the account (and its profile) exists from the
 * first click. Here the account is created by the Admin SDK only after
 * the code mailed to the address is confirmed — the address proves itself
 * before anything exists. A confirmed account is created with
 * emailVerified: true, so it never enters the /verify-email flow.
 *
 * Enumeration stance: /request never touches Firebase, so its response is
 * byte-for-byte the same whether or not the address already has an
 * account. Only /confirm names an existing account, and reaching it
 * requires a code mailed to the address — i.e. control of the inbox.
 *
 * Backing pieces: lib/emailVerificationCodes.js (the same pure helpers as
 * the verify-email flow) and the pending_signup table (see schema.prisma).
 */
import { Router } from 'express';
import admin from 'firebase-admin';
import { getAdminApp } from '../middleware/requireAuth.js';
import { prisma } from '../lib/prisma.js';
import { isConsoleProvider, sendVerificationEmail } from '../lib/mailer.js';
import {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  DAILY_SEND_LIMIT,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  codesMatch,
  generateCode,
  hashCode,
  isCodeShape,
  maskEmail,
} from '../lib/emailVerificationCodes.js';

export const signupRouter = Router();

const COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Same floor the sign-up form enforces, so the two cannot drift.
const MIN_PASSWORD_LENGTH = 8;

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** The newest code that hasn't been used, replaced or burned — the live one. */
function liveSignupFor(email) {
  return prisma.pendingSignup.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/** Spend a code so it can never create anything again. */
function burn(id) {
  return prisma.pendingSignup.update({ where: { id }, data: { consumedAt: new Date() } });
}

// ------------------------------------------------------------------
// POST /api/auth/signup/request
// ------------------------------------------------------------------
signupRouter.post('/request', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_SHAPE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address', code: 'INVALID_EMAIL' });
  }

  try {
    // Cooldown: measured from the live code, so the timer restarts only
    // when a code is actually outstanding.
    const live = await liveSignupFor(email);
    if (live) {
      const elapsed = Date.now() - live.createdAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: `A code was already sent. You can ask for another one in ${retryAfterSeconds}s.`,
          code: 'RESEND_COOLDOWN',
          retryAfterSeconds,
        });
      }
    }

    const sentRecently = await prisma.pendingSignup.count({
      where: { email, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (sentRecently >= DAILY_SEND_LIMIT) {
      return res.status(429).json({
        error: `You have requested ${DAILY_SEND_LIMIT} codes in the last 24 hours. Try again later.`,
        code: 'DAILY_LIMIT',
      });
    }

    // Only one code is ever live: issuing a new one spends the old row, so
    // a stale email in the inbox cannot still create an account.
    await prisma.pendingSignup.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateCode();
    const created = await prisma.pendingSignup.create({
      data: {
        email,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
      },
    });

    try {
      await sendVerificationEmail({ to: email, code, expiresInMinutes: CODE_TTL_MINUTES });
    } catch (sendErr) {
      // Nothing was delivered, so this row must not block the retry that is
      // about to follow. Spend it, and say plainly that sending failed —
      // never let a mail outage read as a wrong code.
      console.error('signup/request: send failed:', sendErr.message);
      await burn(created.id).catch(() => {});
      return res
        .status(502)
        .json({ error: 'Could not send the verification email. Please try again.', code: 'EMAIL_SEND_FAILED' });
    }

    res.json({
      status: 'sent',
      email: maskEmail(email),
      expiresInMinutes: CODE_TTL_MINUTES,
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
      // The console provider has no inbox to read, so local development and
      // demos get the code straight back. Production never sees this.
      ...(isConsoleProvider() && process.env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error('signup/request failed:', err);
    res.status(500).json({ error: 'Could not start the sign-up' });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/signup/confirm
//
// The account is created HERE, and only here: the code proves the address,
// so the account is born with emailVerified: true. The password travels
// with this one call and is handed straight to Admin createUser — it is
// never stored anywhere.
// ------------------------------------------------------------------
signupRouter.post('/confirm', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const submitted = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';

  if (!EMAIL_SHAPE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address', code: 'INVALID_EMAIL' });
  }
  if (!isCodeShape(submitted)) {
    return res
      .status(400)
      .json({ error: `Enter the ${CODE_LENGTH}-digit code from the email`, code: 'INVALID_FORMAT' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters`, code: 'WEAK_PASSWORD' });
  }

  try {
    const live = await liveSignupFor(email);
    if (!live) {
      return res
        .status(400)
        .json({ error: 'No sign-up is waiting for this email. Request a new code.', code: 'NO_PENDING_SIGNUP' });
    }
    if (live.expiresAt.getTime() <= Date.now()) {
      await burn(live.id);
      return res.status(410).json({ error: 'That code has expired. Request a new one.', code: 'CODE_EXPIRED' });
    }
    if (live.attempts >= MAX_ATTEMPTS) {
      await burn(live.id);
      return res.status(429).json({ error: 'Too many wrong guesses. Request a new code.', code: 'TOO_MANY_ATTEMPTS' });
    }

    if (!codesMatch(submitted, live.codeHash)) {
      const attempts = live.attempts + 1;
      const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attempts);
      // Burning on the last guess turns "brute-force it slowly" into "start
      // over with a fresh email" — which is the entire point of the cap.
      await prisma.pendingSignup.update({
        where: { id: live.id },
        data: attemptsRemaining === 0 ? { attempts, consumedAt: new Date() } : { attempts },
      });
      return res.status(400).json({
        error:
          attemptsRemaining === 0
            ? 'That code is not correct, and it is now used up. Request a new one.'
            : `That code is not correct. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'try' : 'tries'} left.`,
        code: 'CODE_MISMATCH',
        attemptsRemaining,
      });
    }

    // Correct. Spend the code first, then create the account: if the Admin
    // call fails the code is gone, which is the safe direction — the user
    // asks for a new one rather than retrying a code we already accepted.
    await burn(live.id);

    const displayName = `${firstName} ${lastName}`.trim();
    try {
      const app = getAdminApp();
      await admin.auth(app).createUser({
        email,
        password,
        // The address proved itself by receiving the code — no second gate.
        emailVerified: true,
        ...(displayName ? { displayName } : {}),
      });
    } catch (createErr) {
      const code = createErr?.code ?? '';
      if (code === 'auth/email-already-exists' || code === 'auth/email-exists') {
        // Reaching this line required a code mailed to this address, so the
        // caller controls the inbox — naming the existing account is help
        // here, not an enumeration leak (see the header comment).
        return res
          .status(409)
          .json({ error: 'An account with this email already exists. Sign in instead.', code: 'EMAIL_EXISTS' });
      }
      console.error('signup/confirm: could not create the account:', createErr.message);
      return res.status(500).json({ error: 'Could not create the account. Please try again.', code: 'CREATE_FAILED' });
    }

    res.status(201).json({ status: 'created', email });
  } catch (err) {
    console.error('signup/confirm failed:', err);
    res.status(500).json({ error: 'Could not check that code' });
  }
});
