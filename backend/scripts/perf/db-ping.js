/**
 * db-ping — measures the network round trip from this machine to the
 * database, so a load-test result can be read correctly: every query the
 * API makes costs at least one round trip, so a page that makes 4 rounds of
 * queries can't be faster than 4 × this number, however fast Postgres is.
 *
 * Read-only (runs SELECT 1). Usage, from backend/:
 *   node scripts/perf/db-ping.js
 */
import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

net.setDefaultAutoSelectFamily(false); // same as src/lib/prisma.js

const url = new URL(process.env.DATABASE_URL);
const prisma = new pkg.PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const times = [];
try {
  await prisma.$queryRaw`SELECT 1`; // opens the connection (TLS handshake) — not counted
  for (let i = 0; i < 20; i += 1) {
    const started = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    times.push(performance.now() - started);
  }
} finally {
  await prisma.$disconnect();
}
times.sort((a, b) => a - b);
const ms = (v) => `${v.toFixed(1)} ms`;
console.log(`Database host: ${url.hostname}`);
console.log(`Round trip (20 × SELECT 1): min ${ms(times[0])}, median ${ms(times[10])}, max ${ms(times[19])}`);
