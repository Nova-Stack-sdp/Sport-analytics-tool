import { createHash } from 'node:crypto';

/**
 * The dataset exactly as it arrived, ready to store in submission_upload.
 *
 * app.js keeps the received bytes on req.rawBody for /api/submissions. If
 * they are missing (e.g. a test that calls the router without that parser),
 * the parsed body is serialised instead so a submission is never stored
 * without its upload.
 */
export function buildUploadRecord(req) {
  const data = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
  return {
    data,
    contentType: 'application/json',
    sizeBytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
