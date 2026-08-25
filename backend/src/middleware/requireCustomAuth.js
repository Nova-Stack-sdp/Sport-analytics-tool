import { prisma } from '../lib/prisma.js';
import { hashSessionToken, readSessionToken } from '../lib/authSession.js';

export async function requireCustomAuth(req, res, next) {
  const token = readSessionToken(req);
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.user = {
      id: session.user.id,
      uid: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
