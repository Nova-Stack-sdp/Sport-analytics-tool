import { readFileSync } from 'node:fs';
import {
  validateFileContents, scanForMaliciousCode, scanPythonCode, checkSubmissionCode, validateJsonBatch,
} from '../src/lib/securityHelpers.js';

// The full rule-by-rule tests live next to the frontend copy
// (frontend/src/utils/securityHelpers.test.js). Here: the two copies are the
// same file, and the backend copy works under Node's own module loader.

test('independently deployed frontend/backend policies remain identical', () => {
  const root = new URL('../../', import.meta.url);
  expect(readFileSync(new URL('backend/src/lib/securityHelpers.js', root), 'utf8'))
    .toBe(readFileSync(new URL('frontend/src/utils/securityHelpers.js', root), 'utf8'));
});

test('file content validation catches malformed JSON, non-JavaScript and non-UTF-8 bytes', async () => {
  for (const [name, type, content] of [
    ['data.json', 'application/json', '{oops'],
    ['script.js', 'text/javascript', '#include <stdio.h>'],
    ['script.js', 'text/javascript', 'int main(void) { return 0; }'],
    ['data.json', 'application/json', 'int main(void) { return 0; }'],
    ['script.js', 'text/javascript', 'eval("x")'],
    ['data.json', 'application/json', new Uint8Array([0xff])],
  ]) {
    expect((await validateFileContents(new File([content], name, { type }), name.endsWith('json') ? 'json' : 'js')).isValid).toBe(false);
  }
  expect(await validateFileContents(new File(['{}'], 'data.json', { type: 'application/json' }), '.json'))
    .toEqual({ isValid: true, error: null });
  expect(await validateFileContents({ name: 'x.js', type: 'text/javascript', size: 1, arrayBuffer: async () => new ArrayBuffer(2) }, '.js'))
    .toEqual({ isValid: false, error: 'File size does not match its metadata.' });
});

test('server policy rejects escaped keys and dangerous code, and parses with Node\'s acorn', () => {
  expect(validateJsonBatch('{"\\u005f_proto__":{}}').isValid).toBe(false);
  expect(scanForMaliciousCode('document["cookie"]').isValid).toBe(false);
  expect(scanForMaliciousCode("const fs = require('fs');").findings[0]).toMatchObject({ line: 1, rule: 'global' });
  expect(scanForMaliciousCode('export function f(laps) { const location = laps[0]; return location; }').isValid).toBe(true);
  expect(scanPythonCode('import subprocess').isValid).toBe(false);
  expect(checkSubmissionCode('Python', 'import statistics').isValid).toBe(true);
});
