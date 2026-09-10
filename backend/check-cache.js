import { prisma } from './src/lib/prisma.js';

const row = await prisma.externalApiCache.findUnique({
  where: { key: 'openf1:barcelona-2026-race:v2' },
});

if (!row) {
  console.log('NO CACHE ROW EXISTS — no fetch has ever completed successfully.');
  process.exit(0);
}

const bundle = row.payload;
console.log('Cache row found, fetched at:', row.fetchedAt);
console.log('session_key:', bundle.session_key);
console.log('session:', JSON.stringify(bundle.session?.[0], null, 2));
console.log('driver count:', bundle.drivers?.length);
console.log('first 3 drivers:', JSON.stringify(bundle.drivers?.slice(0, 3), null, 2));
console.log('laps count:', bundle.laps?.length);
console.log('first lap record:', JSON.stringify(bundle.laps?.[0], null, 2));
console.log('location count:', bundle.location?.length);

process.exit(0);