import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const { PrismaClient } = pkg;
net.setDefaultAutoSelectFamily(false);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const sessions = await prisma.session.findMany({
  where: { type: { in: ['Race', 'Sprint'] } },
  select: { openf1Key: true, type: true, meeting: { select: { season: true, name: true } } },
  orderBy: { openf1Key: 'asc' },
});

for (const s of sessions) {
  console.log(`${s.openf1Key}\t${s.meeting.season}\t${s.type}\t${s.meeting.name}`);
}

await prisma.$disconnect();
