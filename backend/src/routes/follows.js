import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const followsRouter = Router();

followsRouter.use(requireAuth);

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined);

function driverSnapshot(body = {}) {
  return {
    name: str(body.name),
    number: Number.isFinite(body.number) ? body.number : null,
    teamName: str(body.teamName) ?? null,
    teamColor: str(body.teamColor, 20) ?? null,
  };
}

function teamSnapshot(body = {}) {
  return {
    name: str(body.name),
    color: str(body.color, 20) ?? null,
    logoUrl: str(body.logoUrl, 500) ?? null,
  };
}

async function listFollows(userId) {
  const rows = await prisma.follow.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    drivers: rows.filter((r) => r.driverId).map((r) => ({ id: r.driverId, ...r.snapshot })),
    teams: rows.filter((r) => r.teamId).map((r) => ({ id: r.teamId, ...r.snapshot })),
  };
}

// GET /api/follows -> { drivers: [...], teams: [...] }
followsRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listFollows(req.user.uid));
  } catch (err) {
    next(err);
  }
});

// PUT /api/follows/drivers/:id  (idempotent)
followsRouter.put('/drivers/:id', async (req, res, next) => {
  try {
    const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    const snapshot = { ...driverSnapshot(req.body), name: driver.name };
    await prisma.follow.createMany({
      data: [{ userId: req.user.uid, driverId: driver.id, snapshot }],
      skipDuplicates: true,
    });
    res.json(await listFollows(req.user.uid));
  } catch (err) {
    next(err);
  }
});

followsRouter.delete('/drivers/:id', async (req, res, next) => {
  try {
    await prisma.follow.deleteMany({ where: { userId: req.user.uid, driverId: req.params.id } });
    res.json(await listFollows(req.user.uid));
  } catch (err) {
    next(err);
  }
});

// PUT /api/follows/teams/:id  (idempotent)
followsRouter.put('/teams/:id', async (req, res, next) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const snapshot = { ...teamSnapshot(req.body), name: team.name };
    await prisma.follow.createMany({
      data: [{ userId: req.user.uid, teamId: team.id, snapshot }],
      skipDuplicates: true,
    });
    res.json(await listFollows(req.user.uid));
  } catch (err) {
    next(err);
  }
});

followsRouter.delete('/teams/:id', async (req, res, next) => {
  try {
    await prisma.follow.deleteMany({ where: { userId: req.user.uid, teamId: req.params.id } });
    res.json(await listFollows(req.user.uid));
  } catch (err) {
    next(err);
  }
});