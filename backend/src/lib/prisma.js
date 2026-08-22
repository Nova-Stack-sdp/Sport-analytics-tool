import net from 'node:net';
import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const { PrismaClient } = pkg;

// Node's Happy Eyeballs (RFC 8305) dual-stack connection racing, on by
// default since Node 20, has a known bug: when a hostname resolves to both
// IPv4 and IPv6 addresses and the IPv6 attempts fail immediately with
// ENETUNREACH (no IPv6 route — common on networks without IPv6, e.g. most
// home/campus wifi), it can incorrectly mark the perfectly-reachable IPv4
// candidates as timed out too. This surfaces as ETIMEDOUT connecting to
// Neon's pooler even though the same IP/port works fine via psql or nc.
// Disabling it makes Node fall back to plain sequential connection
// attempts, matching how psql/nc behave. Must run before any connection is
// opened, which is why it's here rather than passed as a CLI flag — it
// covers local dev, CI, and however Northflank starts the process.
net.setDefaultAutoSelectFamily(false);

if (!process.env.DATABASE_URL) {
  // Fail loudly at startup rather than letting every route error out later.
  throw new Error('DATABASE_URL is not set — check your environment configuration.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });