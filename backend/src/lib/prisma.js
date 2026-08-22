/**
 * Prisma client singleton for the API server.
 *
 * Uses the same adapter-pg pattern as src/jobs/openf1-sync.js, so both the
 * sync job and the API talk to Postgres (Neon) the same way. Kept as a
 * singleton so route handlers all share one connection pool instead of
 * opening a new one per request.
 */
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const { PrismaClient } = pkg;

if (!process.env.DATABASE_URL) {
  // Fail loudly at startup rather than letting every route error out later.
  throw new Error('DATABASE_URL is not set — check your environment configuration.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });