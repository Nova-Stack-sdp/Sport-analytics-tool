/**
 * driverUploadedImage — photos uploaded by users, stored in the same
 * Postgres database as the driver rows (table `driver_image`, one row per
 * driver, keyed by driver_id).
 *
 * The bytes live in their own table on purpose: several routes load drivers
 * through `include: { driver: true }`, and if the image were a column on
 * `driver` every one of those queries would drag megabytes of image data
 * along with it. Here the bytes are only ever read by the image route.
 *
 * An uploaded photo always wins over the OpenF1 / API-Sports headshots.
 *
 * Reads are best-effort (a failure is logged and treated as "no uploaded
 * image") so a database hiccup can never take the drivers page down; the
 * page just falls back to the remote headshot.
 */
import { prisma } from './prisma.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Only raster formats are accepted. SVG is deliberately excluded: it can
// carry script, and these bytes are served back from our own origin.
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Works out the real image type from the file's leading bytes rather than
 * trusting the Content-Type header the client sent. Returns one of
 * ALLOWED_IMAGE_TYPES, or null if the bytes aren't a supported image.
 */
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

// Inserts or replaces the driver's uploaded photo. Returns the version
// (last-updated time in ms) that clients append to the image URL so a
// replaced photo is never served from a stale browser cache.
export async function saveUploadedDriverImage({ driverId, data, contentType, uploadedBy }) {
  const record = await prisma.driverImage.upsert({
    where: { driverId },
    create: { driverId, data, contentType, sizeBytes: data.length, uploadedBy: uploadedBy ?? null },
    update: { data, contentType, sizeBytes: data.length, uploadedBy: uploadedBy ?? null, updatedAt: new Date() },
    select: { updatedAt: true },
  });
  return record.updatedAt.getTime();
}

// Full record including bytes — only the image route should call this.
export async function getUploadedDriverImage(driverId) {
  try {
    const record = await prisma.driverImage.findUnique({ where: { driverId } });
    if (!record) return null;
    return {
      buffer: Buffer.from(record.data),
      contentType: record.contentType,
      version: record.updatedAt.getTime(),
    };
  } catch (err) {
    console.error('driverUploadedImage: lookup failed:', err.message);
    return null;
  }
}

// Batched version lookup for the list page. Selects only the timestamp, so
// no image bytes are read. Returns Map<driverId, versionMs>.
export async function getUploadedImageVersions(driverIds) {
  const ids = [...new Set(driverIds.filter(Boolean))];
  if (!ids.length) return new Map();

  try {
    const rows = await prisma.driverImage.findMany({
      where: { driverId: { in: ids } },
      select: { driverId: true, updatedAt: true },
    });
    return new Map(rows.map((row) => [row.driverId, row.updatedAt.getTime()]));
  } catch (err) {
    console.error('driverUploadedImage: batch lookup failed:', err.message);
    return new Map();
  }
}

export async function getUploadedImageVersion(driverId) {
  const versions = await getUploadedImageVersions([driverId]);
  return versions.get(driverId) ?? null;
}
