/**
 * emailVerification routes — the 6-digit code mailed to an account.
 *
 * Mounted at /api/auth/verify-email (see src/app.js). Both routes sit
 * behind requireAuth, so the caller already holds a valid Firebase session;
 * what the code adds is proof that the address on that account is real and
 * reachable — Firebase itself never checks that.
 *
 *   POST /request — generate a code, store its hash, mail it (cooldown and
 *                   daily cap apply)
 *   POST /confirm — check a submitted code, then flip Firebase's
 *                   emailVerified flag on the account
 *
 * Backing pieces: lib/emailVerificationCodes.js (pure — generate, hash,
 * compare, limits) and lib/mailer.js (console or HTTP provider).
 */
import { Router } from 'express';
import admin from 'firebase-admin';
import { requireAuth, getAdminApp } from '../middleware/requireAuth.js';
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

export const emailVerificationRouter = Router();

const COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The newest code that hasn't been used, replaced or burned — the live one. */
function liveCodeFor(userId) {
  return prisma.emailVerificationCode.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/** Spend a code so it can never verify anything again. */
function burn(id) {
  return prisma.emailVerificationCode.update({ where: { id }, data: { consumedAt: new Date() } });
}

// ------------------------------------------------------------------
// POST /api/auth/verify-email/request
// ------------------------------------------------------------------
emailVerificationRouter.post('/request', requireAuth, async (req, res) => {
  const { uid, email, emailVerified } = req.user;

  if (emailVerified) {
    return res.json({ status: 'already-verified', emailVerified: true });
  }
  if (!email) {
    return res.status(400).json({ error: 'This account has no email address to verify', code: 'NO_EMAIL' });
  }

  try {
    // Cooldown: measured from the live code, so the timer restarts only
    // when a code is actually outstanding.
    const live = await liveCodeFor(uid);
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

    const sentRecently = await prisma.emailVerificationCode.count({
      where: { userId: uid, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
    if (sentRecently >= DAILY_SEND_LIMIT) {
      return res.status(429).json({
        error: `You have requested ${DAILY_SEND_LIMIT} codes in the last 24 hours. Try again later.`,
        code: 'DAILY_LIMIT',
      });
    }

    // Only one code is ever live: issuing a new one spends the old row, so
    // a stale email in the inbox cannot still be redeemed.
    await prisma.emailVerificationCode.updateMany({
      where: { userId: uid, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = generateCode();
    const created = await prisma.emailVerificationCode.create({
      data: {
        userId: uid,
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
      console.error('verify-email/request: send failed:', sendErr.message);
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
    console.error('verify-email/request failed:', err);
    res.status(500).json({ error: 'Could not start email verification' });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/verify-email/confirm
// ------------------------------------------------------------------
emailVerificationRouter.post('/confirm', requireAuth, async (req, res) => {
  const { uid, emailVerified } = req.user;
  const submitted = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  // Idempotent, so a double-click on "Verify" after a slow response is not
  // punished with "no code is waiting".
  if (emailVerified) {
    return res.json({ status: 'already-verified', emailVerified: true });
  }
  if (!isCodeShape(submitted)) {
    return res
      .status(400)
      .json({ error: `Enter the ${CODE_LENGTH}-digit code from the email`, code: 'INVALID_FORMAT' });
  }

  try {
    const live = await liveCodeFor(uid);
    if (!live) {
      return res.status(400).json({ error: 'No code is waiting. Request a new one.', code: 'NO_ACTIVE_CODE' });
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
      await prisma.emailVerificationCode.update({
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

    // Correct. Spend the code first, then tell Firebase: if the Admin call
    // fails the code is gone, which is the safe direction — the user asks
    // for a new one rather than retrying a code we already accepted.
    await burn(live.id);
    try {
      const app = getAdminApp();
      await admin.auth(app).updateUser(uid, { emailVerified: true });
    } catch (updateErr) {
      console.error('verify-email/confirm: could not set emailVerified:', updateErr.message);
      return res
        .status(500)
        .json({ error: 'Could not mark the email as verified. Please try again.', code: 'UPDATE_FAILED' });
    }

    res.json({ status: 'verified', emailVerified: true });
  } catch (err) {
    console.error('verify-email/confirm failed:', err);
    res.status(500).json({ error: 'Could not check that code' });
  }
});
