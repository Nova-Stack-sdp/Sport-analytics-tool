import { validateFileUpload, scanForMaliciousCode, validateJsonBatch, MAX_FILE_BYTES, MAX_JSON_BYTES, MAX_JSON_DEPTH } from './securityHelpers';

const valid = { isValid: true, error: null };
const file = (overrides = {}) => ({ name: 'batch.json', type: 'application/json', size: 100, ...overrides });

test('file metadata is strict, case insensitive and size bounded', () => {
  expect(validateFileUpload(file({ size: MAX_FILE_BYTES }), '.json')).toEqual(valid);
  expect(validateFileUpload(file({ name: 'BATCH.JSON' }), 'json')).toEqual(valid);
  for (const overrides of [
    { name: 'batch.json.c' }, { name: 'batch.json ' }, { name: '../batch.json' },
    { type: 'text/x-c' }, { type: '' }, { type: 'text/plain' },
    { size: MAX_FILE_BYTES + 1 }, { size: NaN }, { size: -1 }, { size: 0 },
  ]) expect(validateFileUpload(file(overrides), '.json').isValid).toBe(false);
  expect(validateFileUpload(file(), '__proto__').isValid).toBe(false);
  expect(validateFileUpload(null, '.json').isValid).toBe(false);
});

test.each([
  'eval("x")', '(0, eval)("x")', 'eval?.("x")', 'document.cookie',
  'document["cookie"]', 'window /* comment */ . location', 'window["location"]',
  'localStorage.getItem("token")', 'require("child_process")',
  'require("node:child_process")', 'new XMLHttpRequest()',
  'new Function("return 1")', 'x.constructor("return 1")',
  'e\\u0076al("x")', 'window["\\x65val"]("x")', '#include <stdio.h>',
  'int main(void) { return 0; }', 'void main() {}', 'char *buffer;',
])('rejects restricted source: %s', (source) => {
  expect(scanForMaliciousCode(source).isValid).toBe(false);
});

test('allows ordinary analytics code but rejects invalid inputs', () => {
  expect(scanForMaliciousCode('export function delta(laps) { return laps.map(lap => lap.time); }')).toEqual(valid);
  expect(scanForMaliciousCode('const mean = laps.reduce((a, b) => a + b, 0) / laps.length;')).toEqual(valid);
  for (const value of [null, {}, '', ' ', 'x'.repeat(MAX_FILE_BYTES + 1)]) {
    expect(scanForMaliciousCode(value).isValid).toBe(false);
  }
});

test('large runs of blank lines remain safe to scan', () => {
  expect(scanForMaliciousCode('\n'.repeat(100000) + 'const laps = [];')).toEqual(valid);
  expect(scanForMaliciousCode('const int = 1; int' + ' '.repeat(100000) + ';')).toEqual(valid);
  expect(scanForMaliciousCode('\n'.repeat(100000) + '#include <stdio.h>').isValid).toBe(false);
  expect(scanForMaliciousCode(' '.repeat(MAX_FILE_BYTES + 1))).toEqual({
    isValid: false, error: 'Code exceeds the 2 MiB limit.',
  });
});

test('JSON uses UTF-8 byte limits including astral characters', () => {
  expect(validateJsonBatch('["' + 'a'.repeat(MAX_JSON_BYTES - 4) + '"]')).toEqual(valid);
  expect(validateJsonBatch('["' + 'a'.repeat(MAX_JSON_BYTES - 3) + '"]').isValid).toBe(false);
  expect(validateJsonBatch('["' + '😀'.repeat(MAX_JSON_BYTES / 4) + '"]').isValid).toBe(false);
});

test('nesting is bounded before parse and ignores string contents', () => {
  expect(validateJsonBatch('['.repeat(MAX_JSON_DEPTH) + '0' + ']'.repeat(MAX_JSON_DEPTH))).toEqual(valid);
  expect(validateJsonBatch('['.repeat(MAX_JSON_DEPTH + 1) + '0' + ']'.repeat(MAX_JSON_DEPTH + 1)).isValid).toBe(false);
  expect(validateJsonBatch(JSON.stringify({ text: '[{'.repeat(100) + '\\"' }))).toEqual(valid);
});

test.each(['{"__proto__":{}}', '{"nested":[{"constructor":{}}]}', '{"prototype":1}', '{"\\u005f_proto__":{}}', '{', '[1,]', 'null', '1', '"text"'])('rejects unsafe JSON: %s', (input) => {
  expect(validateJsonBatch(input).isValid).toBe(false);
});

test('normal object and array batches pass', () => {
  expect(validateJsonBatch('{"laps":[{"lap":1}]}')).toEqual(valid);
  expect(validateJsonBatch('[]')).toEqual(valid);
  expect(validateJsonBatch({}).isValid).toBe(false);
});
