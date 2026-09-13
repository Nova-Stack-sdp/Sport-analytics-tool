/**
 * driverImageCache — persists driver headshots into Firestore so each image
 * is fetched from its upstream source (OpenF1 / API-Sports) at most once.
 *
 * Documents live in the `driverImages` collection, keyed by driver id:
 *   { base64, contentType, sourceUrl, cachedAt }
 *
 * Firestore documents are capped at 1MiB, so MAX_IMAGE_BYTES keeps us well
 * under that (headshots are typically tens of KB). If an image is too big,
 * or Firestore isn't reachable/configured, caching is skipped silently and
 * the caller falls back to the original external URL — a missing cache
 * entry should never break the page.
 */
import { getFirestore } from './firebaseAdmin.js';

const COLLECTION = 'driverImages';
const MAX_IMAGE_BYTES = 900_000;

export async function getCachedDriverImage(driverId) {
  try {
    const snap = await getFirestore().collection(COLLECTION).doc(driverId).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error('driverImageCache: lookup failed:', err.message);
    return null;
  }
}

// Batched lookup for the drivers list page — one round trip instead of one
// per driver. Returns a Map of driverId -> true for ids that have a cached
// image (the list page only needs to know whether one exists, not its
// bytes).
export async function getCachedDriverImageFlags(driverIds) {
  const ids = [...new Set(driverIds.filter(Boolean))];
  if (!ids.length) return new Map();

  try {
    const db = getFirestore();
    const snaps = await db.getAll(...ids.map((id) => db.collection(COLLECTION).doc(id)));
    const flags = new Map();
    snaps.forEach((snap, index) => {
      if (snap.exists) flags.set(ids[index], true);
    });
    return flags;
  } catch (err) {
    console.error('driverImageCache: batch lookup failed:', err.message);
    return new Map();
  }
}

// Downloads sourceUrl and stores it for driverId if it isn't cached yet.
// Returns the cached record (existing or newly written), or null if there
// was nothing to cache or caching failed.
export async function ensureDriverImageCached(driverId, sourceUrl) {
  if (!driverId || !sourceUrl) return null;

  const existing = await getCachedDriverImage(driverId);
  if (existing) return existing;

  try {
    const upstream = await fetch(sourceUrl, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) return null;

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      console.error(`driverImageCache: image for ${driverId} too large to cache (${buffer.length} bytes)`);
      return null;
    }

    const record = {
      base64: buffer.toString('base64'),
      contentType: upstream.headers.get('content-type') || 'image/jpeg',
      sourceUrl,
      cachedAt: new Date().toISOString(),
    };
    await getFirestore().collection(COLLECTION).doc(driverId).set(record);
    return record;
  } catch (err) {
    console.error(`driverImageCache: caching failed for ${driverId}:`, err.message);
    return null;
  }
}
