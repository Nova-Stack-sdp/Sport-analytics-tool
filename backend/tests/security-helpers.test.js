import { readFileSync } from 'node:fs';
import { validateFileContents, scanForMaliciousCode, validateJsonBatch } from '../src/lib/securityHelpers.js';

test('independently deployed frontend/backend policies remain identical', () => {
  const root = new URL('../../', import.meta.url);
  expect(readFileSync(new URL('backend/src/lib/securityHelpers.js', root), 'utf8'))
    .toBe(readFileSync(new URL('frontend/src/utils/securityHelpers.js', root), 'utf8'));
});

test('file content validation catches malformed JSON, C directives and non-UTF-8 bytes', async () => {
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

test('server policy rejects escaped keys and dangerous code', () => {
  expect(validateJsonBatch('{"\\u005f_proto__":{}}').isValid).toBe(false);
  expect(scanForMaliciousCode('document["cookie"]').isValid).toBe(false);
});
