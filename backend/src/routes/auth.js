import express from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
  hashSessionToken,
  setSessionCookie,
} from '../lib/authSession.js';
import { requireCustomAuth } from '../middleware/requireCustomAuth.js';

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function publicUser(user) {
  return { id: user.id, uid: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
}

async function establishSession(res, user) {
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  return res.json({ user: publicUser(user) });
}

router.post('/register', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const { password, firstName = null, lastName = null } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'A valid email and password of at least 8 characters are required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.appUser.create({
      data: {
        email,
        passwordHash,
        firstName: typeof firstName === 'string' ? firstName.trim() || null : null,
        lastName: typeof lastName === 'string' ? lastName.trim() || null : null,
      },
    });
    return establishSession(res, user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with that email already exists' });
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  try {
    const user = await prisma.appUser.findUnique({ where: { email } });
    const matches = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !matches) return res.status(401).json({ error: 'Incorrect email or password' });
    return establishSession(res, user);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  const token = readSessionToken(req);
  try {
    if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireCustomAuth, (req, res) => res.json({ user: req.user }));

export { router as authRouter };
