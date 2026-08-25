import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'session_token';

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  const production = process.env.NODE_ENV === 'production';
  return [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `SameSite=${production ? 'None' : 'Lax'}`,
    production ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function setSessionCookie(res, token) {
  const production = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `SameSite=${production ? 'None' : 'Lax'}`,
  ];
  if (production) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=${process.env.NODE_ENV === 'production' ? 'None' : 'Lax'}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.authSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export function readSessionToken(req) {
  const header = req.headers.cookie || '';
  const cookie = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null;
}
