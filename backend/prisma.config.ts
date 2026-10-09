import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The CLI's connection (migrations, introspection) is deliberately separate
// from the app's. Migrations hold a session-level connection — DDL in
// transactions, advisory locks — which Neon's PgBouncer pooler cannot serve:
// over the pooled host they fail with "prepared statement ... already exists".
// DIRECT_URL is that unpooled string; the app never reads it and keeps using
// the pooled DATABASE_URL through its own pg adapter (src/lib/prisma.js).
// Without DIRECT_URL the CLI falls back to DATABASE_URL, i.e. the previous
// behaviour.
const migrateUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL || '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: migrateUrl,
  },
});