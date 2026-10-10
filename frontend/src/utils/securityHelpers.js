/**
 * Dependency-free submission policy. Rejects input; never executes or rewrites it.
 * Backend mirror: backend/src/lib/securityHelpers.js (parity checked in tests).
 * MIME types are untrusted browser metadata, NOT content detection. A renamed C
 * file may have a JavaScript MIME type. No regex can prove arbitrary code safe.
 * Keep submitted code inert; execution requires a separately isolated, resource-
 * limited service with no credentials, network access or host filesystem access.
 * These checks do not detect all secrets/PII and do not replace dataset schemas.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_JSON_DEPTH = 32;
const MIME_TYPES = {
  js: ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'],
  json: ['application/json'],
};
const ok = () => ({ isValid: true, error: null });
const fail = (error) => ({ isValid: false, error });

// UTF-8 byte counting without allocating a second copy or needing TextEncoder.
// Unpaired UTF-16 surrogates encode as U+FFFD (three bytes), as in TextEncoder.
function exceedsUtf8Limit(text, limit) {
  if (text.length > limit) return true;
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff &&
      text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}

/**
 * Synchronous metadata gate for .js/.json (expectedExtension may include a dot).
 * Case-insensitive suffix matching, exact allowlisted MIME matching. Empty or
 * generic MIME types fail closed. Maximum is inclusive: 2 MiB = 2,097,152 bytes.
 * Call validateFileContents as well before submitting file text.
 */
export function validateFileUpload(file, expectedExtension) {
  if (!file || typeof file.name !== 'string' || typeof file.type !== 'string' ||
      !Number.isSafeInteger(file.size) || file.size < 0) return fail('Invalid file metadata.');
  if (typeof expectedExtension !== 'string') return fail('Unsupported file extension.');
  const extension = expectedExtension.replace(/^\./, '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MIME_TYPES, extension)) return fail('Unsupported file extension.');
  // Restrict filenames to an unambiguous basename; disallow controls and bidi tricks.
  // eslint-disable-next-line no-control-regex -- Deliberately reject ASCII control characters in filenames.
  if (/[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(file.name) ||
      file.name !== file.name.trim() || file.name.lastIndexOf('.') <= 0 ||
      file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() !== extension) {
    return fail(`File must have a .${extension} extension.`);
  }
  if (!MIME_TYPES[extension].includes(file.type.toLowerCase())) return fail('File extension and MIME type do not match.');
  if (file.size === 0) return fail('File is empty.');
  if (file.size > MAX_FILE_BYTES) return fail('File exceeds the 2 MiB limit.');
  return ok();
}

/**
 * Conservative JavaScript policy scan, NOT a parser, sandbox or malware proof.
 * Blocks references (including in comments/strings), so aliases of known names,
 * optional calls, bracket access and whitespace cannot evade those checks.
 * Escaped identifiers and dynamic execution are rejected rather than decoded.
 * Deliberately permits false positives. Computed/encoded payloads can still evade
 * a denylist; a successful result must never authorize execution or publication.
 */
export function scanForMaliciousCode(codeString) {
  if (typeof codeString !== 'string') return fail('Code must be a non-empty string.');
  if (exceedsUtf8Limit(codeString, MAX_FILE_BYTES)) return fail('Code exceeds the 2 MiB limit.');
  if (!codeString.trim()) return fail('Code must be a non-empty string.');
  // eslint-disable-next-line no-control-regex -- Deliberately reject NUL in submitted source.
  if (/[\u0000\u202a-\u202e\u2066-\u2069]/.test(codeString)) return fail('Code contains prohibited control characters.');
  if (/\\(?:u[\da-fA-F{]|x[\da-fA-F])/.test(codeString)) return fail('Escaped code identifiers or strings are not allowed.');
  // Restrict property names too, covering document["cookie"] and window?.location.
  if (/\b(?:eval|cookie|location|localStorage|sessionStorage|child_process|XMLHttpRequest|ActiveXObject|Function|constructor|__proto__)\b/.test(codeString)) {
    return fail('Code contains a prohibited execution, browser data or process API.');
  }
  // Obvious non-JavaScript source masquerading as .js. This is not language detection.
  // Horizontal whitespace is intentional: \s* with /m can repeatedly rescan
  // thousands of blank lines and make this supposedly protective check expensive.
  if (/^[ \t]*#[ \t]*(?:include|define|ifdef|ifndef|endif|pragma|undef|if|elif|else|error|line)\b/m.test(codeString)) {
    return fail('C preprocessor directives are not allowed in JavaScript.');
  }
  // Catch common C declarations even when the source has no preprocessor line.
  // As with the API denylist, comments and string literals are not exempted.
  if (/\b(?:int|char|float|double|long|short|unsigned|signed|struct|union|typedef|enum)[ \t]+(?:\*+[ \t]*)?[A-Za-z_]/.test(codeString) ||
      /\bvoid[ \t]+[A-Za-z_][A-Za-z_0-9]*[ \t]*\(/.test(codeString)) {
    return fail('C-style declarations are not allowed in JavaScript.');
  }
  return ok();
}

/**
 * Validate JSON containers up to 1 MiB UTF-8 and 32 nested containers (root = 1).
 * Preflight depth before JSON.parse, ignoring braces in escaped JSON strings.
 * Traverse iteratively; reject pollution keys at every depth, including escaped
 * spellings decoded by JSON.parse. JSON.parse itself does not pollute prototypes;
 * this protects subsequent unsafe merges. Business schema checks remain required.
 */
export function validateJsonBatch(jsonString) {
  if (typeof jsonString !== 'string') return fail('JSON must be a string.');
  if (exceedsUtf8Limit(jsonString, MAX_JSON_BYTES)) return fail('JSON exceeds the 1 MiB limit.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const c of jsonString) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') {
      depth += 1;
      if (depth > MAX_JSON_DEPTH) return fail(`JSON exceeds the maximum nesting depth of ${MAX_JSON_DEPTH}.`);
    } else if (c === '}' || c === ']') depth -= 1;
  }
  let parsed;
  try { parsed = JSON.parse(jsonString); }
  catch { return fail('Event data is not valid JSON'); }
  if (parsed === null || typeof parsed !== 'object') return fail('JSON batch must be an object or array.');
  const stack = [parsed];
  while (stack.length) {
    const value = stack.pop();
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return fail('JSON contains a prohibited prototype-related key.');
      const child = value[key];
      if (child !== null && typeof child === 'object') stack.push(child);
    }
  }
  return ok();
}

/** Async companion: validate metadata, read bounded UTF-8 bytes, then check text. */
export async function validateFileContents(file, expectedExtension) {
  const metadata = validateFileUpload(file, expectedExtension);
  if (!metadata.isValid) return metadata;
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size || bytes.byteLength > MAX_FILE_BYTES) return fail('File size does not match its metadata.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return expectedExtension.replace(/^\./, '').toLowerCase() === 'json'
      ? validateJsonBatch(text) : scanForMaliciousCode(text);
  } catch { return fail('File could not be read as UTF-8 text.'); }
}

/* React example (component state: file, mode, text, draft, setError):
import { validateFileContents, validateJsonBatch, scanForMaliciousCode } from './utils/securityHelpers';
import { submitData, submitCodeSubmission } from './api/client';
import { validateSubmission, normalizeSubmission } from './features/code-submission/submissionFormat';

async function handleSubmit(event) {
  event.preventDefault();
  try {
    if (file) {
      const result = await validateFileContents(file, mode === 'json' ? '.json' : '.js');
      if (!result.isValid) { setError(result.error); return; }
    }
    const source = file ? await file.text() : text;
    const result = mode === 'json' ? validateJsonBatch(source) : scanForMaliciousCode(source);
    if (!result.isValid) { setError(result.error); return; }
    if (mode === 'json') {
      // Dataset JSON must include session_key and the API's record arrays.
      const body = JSON.parse(source);
      if (Array.isArray(body)) { setError('Dataset must be a JSON object.'); return; }
      await submitData(body);
    } else {
      const submission = { ...draft, language: 'JavaScript', code: source };
      const format = validateSubmission(submission);
      if (!format.valid) { setError(format.errors[0].message); return; }
      await submitCodeSubmission(normalizeSubmission(submission));
    }
  }
  catch { setError('Submission failed. Please try again.'); }
}
*/
