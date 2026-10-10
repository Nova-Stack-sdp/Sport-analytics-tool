/**
 * Submission policy for uploaded code and data. It only reads input and
 * accepts or rejects it: nothing here runs, rewrites or stores what it reads.
 *
 * Two identical copies: backend/src/lib/securityHelpers.js and
 * frontend/src/utils/securityHelpers.js (the apps deploy from separate Docker
 * build contexts). A backend test fails if they ever differ.
 *
 * What protects the platform is that submitted code is never executed: it is
 * stored, reviewed by an admin, and served as text. These checks are a filter
 * in front of that review. They catch the obvious and the common, with line
 * numbers, so reviewers spend their time on what is left. They cannot prove
 * code safe: a determined author can hide intent from any static check, so a
 * passing result must never be treated as permission to execute code.
 *
 * MIME types are untrusted browser metadata, not content detection.
 */
import { parse } from 'acorn';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_JSON_DEPTH = 32;
// How many problems one error message lists. The full list is in `findings`.
export const MAX_REPORTED_FINDINGS = 3;

const MIME_TYPES = {
  js: ['text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'],
  json: ['application/json'],
};
const ok = () => ({ isValid: true, error: null });
const fail = (error) => ({ isValid: false, error });
const codeOk = () => ({ isValid: true, error: null, findings: [] });

function codeFail(findings) {
  const shown = findings.slice(0, MAX_REPORTED_FINDINGS)
    .map((f) => (f.line ? `Line ${f.line}: ${f.message}` : f.message));
  const more = findings.length - shown.length;
  const error = shown.join(' ') + (more > 0 ? ` (and ${more} more)` : '');
  return { isValid: false, error, findings };
}

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

// Checks every language shares: a non-empty string within the size limit,
// with no NUL bytes or bidirectional-override characters (which can make
// code display differently from how it runs: "Trojan Source").
function basicCodeChecks(code) {
  if (typeof code !== 'string') return codeFail([{ line: null, column: null, rule: 'empty', message: 'Code must be a non-empty string.' }]);
  if (exceedsUtf8Limit(code, MAX_FILE_BYTES)) return codeFail([{ line: null, column: null, rule: 'size', message: 'Code exceeds the 2 MiB limit.' }]);
  if (!code.trim()) return codeFail([{ line: null, column: null, rule: 'empty', message: 'Code must be a non-empty string.' }]);
  // eslint-disable-next-line no-control-regex -- Deliberately reject NUL and bidi controls in submitted source.
  const control = /[\u0000‪-‮⁦-⁩]/.exec(code);
  if (control) {
    return codeFail([{
      line: lineAt(code, control.index),
      column: null,
      rule: 'control-character',
      message: 'Code contains a NUL or text-direction control character, which can make code read differently from how it runs.',
    }]);
  }
  return null;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

// Line lookup for many positions in one text: start offsets, then binary search.
function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
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
  if (/[\\/\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(file.name) ||
      file.name !== file.name.trim() || file.name.lastIndexOf('.') <= 0 ||
      file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() !== extension) {
    return fail(`File must have a .${extension} extension.`);
  }
  if (!MIME_TYPES[extension].includes(file.type.toLowerCase())) return fail('File extension and MIME type do not match.');
  if (file.size === 0) return fail('File is empty.');
  if (file.size > MAX_FILE_BYTES) return fail('File exceeds the 2 MiB limit.');
  return ok();
}

// ---------------------------------------------------------------------------
// JavaScript
//
// The code is parsed (acorn), not pattern-matched, so comments and strings
// can't trigger false alarms, and anything that isn't valid JavaScript (a C
// file renamed to .js, say) is rejected by the parser itself.
//
// The main rule is an allowlist: a script may only use names it declares
// itself plus the standard built-ins below. Every other free name, such as
// require, process, fetch, window, eval or globalThis, is reported, however
// it is spelled (escapes like eval are decoded by the parser). Names are
// resolved through real scopes, so a local variable called `location` (car
// location data) is fine, and a parameter called `process` can't be used to
// smuggle in the global one elsewhere.
// ---------------------------------------------------------------------------

export const JS_ALLOWED_GLOBALS = new Set([
  'undefined', 'NaN', 'Infinity', 'arguments',
  'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'RegExp', 'Symbol', 'BigInt',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Intl', 'console', 'structuredClone',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'AggregateError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
]);

// Why a well-known name is unavailable, so the message says more than "no".
const JS_NAME_REASONS = [
  [['require', 'module', 'exports', '__dirname', '__filename'], 'loads modules or files'],
  [['process', 'Buffer', 'Deno', 'Bun'], 'reaches the server process'],
  [['eval', 'Function'], 'runs text as code'],
  [['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator', 'importScripts', 'Worker', 'SharedWorker'], 'reaches the network or other threads'],
  [['window', 'self', 'global', 'globalThis', 'document', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'parent', 'top', 'frames', 'opener'], 'reaches the browser or global objects'],
  [['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame'], 'schedules code to run later'],
  [['Reflect', 'Proxy', 'WeakRef', 'FinalizationRegistry', 'Atomics', 'SharedArrayBuffer', 'WebAssembly'], 'reaches engine internals'],
];
const JS_NAME_REASON = new Map(JS_NAME_REASONS.flatMap(([names, reason]) => names.map((n) => [n, reason])));

// Properties that lead to the Function constructor or to prototype
// tampering. Reading them is how sandbox escapes start, e.g.
// [].constructor.constructor('return process')().
const JS_BLOCKED_PROPERTIES = new Set([
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'getPrototypeOf', 'setPrototypeOf', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors',
  'defineProperty', 'defineProperties', 'fromCharCode', 'fromCodePoint',
]);

class Scope {
  constructor(parent, isFunction) {
    this.parent = parent;
    this.isFunction = isFunction;
    this.names = new Set();
  }

  functionScope() {
    let scope = this;
    while (!scope.isFunction) scope = scope.parent;
    return scope;
  }

  has(name) {
    for (let scope = this; scope; scope = scope.parent) if (scope.names.has(name)) return true;
    return false;
  }
}

function propertyName(node, computed) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

// A computed key put together from string pieces, e.g. obj['con' + 'structor']
// or obj[`${a}${b}`]: the usual way to hide a blocked property name.
function isBuiltKey(node) {
  if (node.type === 'TemplateLiteral') return node.expressions.length > 0;
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const stringy = (n) => (n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral' || isBuiltKey(n);
    return stringy(node.left) || stringy(node.right);
  }
  return false;
}

function analyseJavaScript(ast) {
  const findings = [];
  const references = [];
  const report = (node, rule, message) => findings.push({
    line: node.loc?.start.line ?? null,
    column: node.loc ? node.loc.start.column + 1 : null,
    rule,
    message,
  });

  function declare(pattern, target, scope) {
    switch (pattern.type) {
      case 'Identifier': target.names.add(pattern.name); break;
      case 'ObjectPattern':
        for (const prop of pattern.properties) {
          if (prop.type === 'RestElement') declare(prop.argument, target, scope);
          else {
            if (prop.computed) visit(prop.key, scope);
            declare(prop.value, target, scope);
          }
        }
        break;
      case 'ArrayPattern': for (const el of pattern.elements) if (el) declare(el, target, scope); break;
      case 'RestElement': declare(pattern.argument, target, scope); break;
      case 'AssignmentPattern': declare(pattern.left, target, scope); visit(pattern.right, scope); break;
      default: visit(pattern, scope);
    }
  }

  // Assignment targets: identifiers here are writes to existing names, so
  // they count as references (writing to an undeclared global is reported).
  function visitTarget(pattern, scope) {
    switch (pattern.type) {
      case 'ObjectPattern':
        for (const prop of pattern.properties) {
          if (prop.type === 'RestElement') visitTarget(prop.argument, scope);
          else {
            if (prop.computed) visit(prop.key, scope);
            visitTarget(prop.value, scope);
          }
        }
        break;
      case 'ArrayPattern': for (const el of pattern.elements) if (el) visitTarget(el, scope); break;
      case 'RestElement': visitTarget(pattern.argument, scope); break;
      case 'AssignmentPattern': visitTarget(pattern.left, scope); visit(pattern.right, scope); break;
      default: visit(pattern, scope);
    }
  }

  function visitFunction(node, scope) {
    const fnScope = new Scope(scope, true);
    if (node.type === 'FunctionExpression' && node.id) fnScope.names.add(node.id.name);
    for (const param of node.params) declare(param, fnScope, fnScope);
    if (node.body.type === 'BlockStatement') for (const stmt of node.body.body) visit(stmt, fnScope);
    else visit(node.body, fnScope);
  }

  function visitClass(node, scope) {
    const classScope = new Scope(scope, false);
    if (node.id) classScope.names.add(node.id.name);
    if (node.superClass) visit(node.superClass, scope);
    for (const member of node.body.body) {
      if (member.type === 'StaticBlock') {
        const blockScope = new Scope(classScope, true);
        for (const stmt of member.body) visit(stmt, blockScope);
        continue;
      }
      if (member.computed) visit(member.key, classScope);
      if (member.value) {
        if (member.value.type === 'FunctionExpression') visitFunction(member.value, classScope);
        else visit(member.value, new Scope(classScope, true));
      }
    }
  }

  function visit(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Program':
        for (const stmt of node.body) visit(stmt, scope);
        return;
      case 'Identifier':
        references.push({ node, scope });
        return;
      case 'VariableDeclaration': {
        const target = node.kind === 'var' ? scope.functionScope() : scope;
        for (const decl of node.declarations) {
          declare(decl.id, target, scope);
          visit(decl.init, scope);
        }
        return;
      }
      case 'FunctionDeclaration':
        if (node.id) scope.names.add(node.id.name);
        visitFunction(node, scope);
        return;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        visitFunction(node, scope);
        return;
      case 'ClassDeclaration':
        if (node.id) scope.names.add(node.id.name);
        visitClass(node, scope);
        return;
      case 'ClassExpression':
        visitClass(node, scope);
        return;
      case 'BlockStatement': {
        const block = new Scope(scope, false);
        for (const stmt of node.body) visit(stmt, block);
        return;
      }
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const loop = new Scope(scope, false);
        if (node.type === 'ForStatement') {
          visit(node.init, loop);
          visit(node.test, loop);
          visit(node.update, loop);
        } else {
          if (node.left.type === 'VariableDeclaration') visit(node.left, loop);
          else visitTarget(node.left, loop);
          visit(node.right, loop);
        }
        visit(node.body, loop);
        return;
      }
      case 'SwitchStatement': {
        visit(node.discriminant, scope);
        const cases = new Scope(scope, false);
        for (const c of node.cases) {
          visit(c.test, cases);
          for (const stmt of c.consequent) visit(stmt, cases);
        }
        return;
      }
      case 'CatchClause': {
        const catchScope = new Scope(scope, false);
        if (node.param) declare(node.param, catchScope, catchScope);
        visit(node.body, catchScope);
        return;
      }
      case 'LabeledStatement':
        visit(node.body, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      case 'AssignmentExpression':
        visitTarget(node.left, scope);
        visit(node.right, scope);
        return;
      case 'MemberExpression': {
        visit(node.object, scope);
        if (node.computed) visit(node.property, scope);
        const name = propertyName(node.property, node.computed);
        if (name !== null && JS_BLOCKED_PROPERTIES.has(name)) {
          report(node.property, 'blocked-property', `\`.${name}\` isn't allowed: it leads to the code constructor or to object prototypes.`);
        } else if (node.computed && isBuiltKey(node.property)) {
          report(node.property, 'built-key', 'A property name built from strings isn\'t allowed; use a fixed name such as `obj.name`.');
        }
        return;
      }
      case 'Property': {
        if (node.computed) visit(node.key, scope);
        const key = propertyName(node.key, node.computed);
        if (key === '__proto__') report(node.key, 'blocked-property', '`__proto__` isn\'t allowed in object literals.');
        visit(node.value, scope);
        return;
      }
      case 'ImportDeclaration':
        report(node, 'import', `Importing modules ('${node.source.value}') isn't allowed: scripts get their data as function arguments.`);
        return;
      case 'ImportExpression':
        report(node, 'import', 'import() isn\'t allowed: scripts can\'t load modules.');
        return;
      case 'ExportAllDeclaration':
        report(node, 'import', 'Re-exporting another module isn\'t allowed.');
        return;
      case 'ExportNamedDeclaration':
        if (node.source) {
          report(node, 'import', 'Re-exporting another module isn\'t allowed.');
          return;
        }
        if (node.declaration) visit(node.declaration, scope);
        for (const spec of node.specifiers) visit(spec.local, scope);
        return;
      case 'ExportDefaultDeclaration':
        visit(node.declaration, scope);
        return;
      case 'MetaProperty':
        if (node.meta.name === 'import') report(node, 'import', '`import.meta` isn\'t allowed.');
        return;
      default:
        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
          const value = node[key];
          if (Array.isArray(value)) for (const item of value) visit(item, scope);
          else if (value && typeof value.type === 'string') visit(value, scope);
        }
    }
  }

  visit(ast, new Scope(null, true));

  for (const { node, scope } of references) {
    const { name } = node;
    if (scope.has(name) || JS_ALLOWED_GLOBALS.has(name)) continue;
    const reason = JS_NAME_REASON.get(name);
    report(node, 'global', reason
      ? `\`${name}\` isn't available to submitted scripts: it ${reason}.`
      : `\`${name}\` isn't defined in the script and isn't a standard built-in (Math, JSON, Array…). Declare it or pass it in as a parameter.`);
  }

  return findings.sort((a, b) => (a.line - b.line) || (a.column - b.column));
}

/**
 * JavaScript policy check. Returns { isValid, error, findings }, where each
 * finding is { line, column, rule, message } and `error` summarises the first
 * few for a form field. ES modules are expected (the form's example is an
 * `export function`); imports are not allowed.
 */
export function scanForMaliciousCode(codeString) {
  const basic = basicCodeChecks(codeString);
  if (basic) return basic;
  let ast;
  try {
    ast = parse(codeString, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (err) {
    const message = String(err.message).replace(/\s*\(\d+:\d+\)$/, '');
    return codeFail([{
      line: err.loc?.line ?? null,
      column: err.loc ? err.loc.column + 1 : null,
      rule: 'syntax',
      message: `This isn't valid JavaScript: ${message}.`,
    }]);
  }
  let findings;
  try {
    findings = analyseJavaScript(ast);
  } catch (err) {
    // Only extreme nesting can exhaust the stack here; fail closed.
    if (!(err instanceof RangeError)) throw err;
    findings = [{ line: null, column: null, rule: 'nesting', message: 'The code is nested too deeply to check.' }];
  }
  return findings.length ? codeFail(findings) : codeOk();
}

// ---------------------------------------------------------------------------
// Python
//
// There is no Python parser on this side, so this is a careful text check:
// comments and ordinary string contents are blanked out first (so they can't
// trigger it), then imports, risky built-ins and double-underscore attributes
// are looked for. f-strings are left as they are, since their {…} parts run.
// Like the JavaScript check, it filters for review; it can't prove safety.
// ---------------------------------------------------------------------------

// Standard-library modules for pure computation. Anything else (os, sys,
// subprocess, socket, pathlib, pickle, urllib, requests, pandas…) can reach
// files, the network or the process. Add to this list deliberately.
export const PYTHON_ALLOWED_MODULES = new Set([
  'math', 'cmath', 'statistics', 'decimal', 'fractions', 'numbers', 'random',
  'json', 're', 'string', 'textwrap', 'datetime', 'calendar', 'zoneinfo',
  'collections', 'itertools', 'functools', 'operator', 'heapq', 'bisect', 'array',
  'copy', 'enum', 'typing', 'dataclasses', 'abc',
]);

const PYTHON_BLOCKED_BUILTINS = new Set([
  'eval', 'exec', 'compile', 'open', '__import__', 'globals', 'locals', 'vars',
  'getattr', 'setattr', 'delattr', 'input', 'breakpoint', 'exit', 'quit', 'help', 'memoryview',
]);

// Special methods a class may define or call; every other __name__ (such as
// __class__, __subclasses__, __globals__, __builtins__) is how Python
// sandbox escapes are built.
const PYTHON_ALLOWED_DUNDERS = new Set([
  '__name__', '__main__', '__init__', '__post_init__', '__repr__', '__str__', '__format__',
  '__eq__', '__ne__', '__lt__', '__le__', '__gt__', '__ge__', '__hash__', '__bool__',
  '__len__', '__iter__', '__next__', '__contains__', '__getitem__', '__setitem__', '__delitem__',
  '__add__', '__radd__', '__sub__', '__rsub__', '__mul__', '__rmul__', '__truediv__', '__rtruediv__',
  '__floordiv__', '__mod__', '__neg__', '__abs__', '__round__', '__enter__', '__exit__',
  '__slots__', '__all__', '__doc__', '__version__',
]);

// Blanks comments and the contents of non-f-strings (keeping newlines, so
// line numbers stay right). Returns { text } or { error, index }.
function maskPython(code) {
  const out = code.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < code.length) {
    const c = code[i];
    if (c === '#') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let p = i;
      while (p > 0 && /[rRbBuUfF]/.test(code[p - 1])) p -= 1;
      const prefix = code.slice(p, i);
      const isPrefix = prefix.length <= 2 && (p === 0 || !/[\w]/.test(code[p - 1]));
      const fString = isPrefix && /f/i.test(prefix);
      const quote = code.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      let j = i + quote.length;
      let closed = false;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (quote.length === 1 && code[j] === '\n') break;
        if (code.startsWith(quote, j)) { closed = true; break; }
        j += 1;
      }
      if (!closed) return { error: 'This string is never closed.', index: i };
      if (!fString) blank(i + quote.length, j);
      i = j + quote.length;
      continue;
    }
    i += 1;
  }
  return { text: out.join('') };
}

/**
 * Python policy check, same result shape as scanForMaliciousCode.
 */
export function scanPythonCode(codeString) {
  const basic = basicCodeChecks(codeString);
  if (basic) return basic;
  const masked = maskPython(codeString);
  if (masked.error) {
    return codeFail([{ line: lineAt(codeString, masked.index), column: null, rule: 'syntax', message: masked.error }]);
  }
  const text = masked.text;
  const findings = [];
  const lineOf = lineFinder(text);
  const report = (index, rule, message) => findings.push({ line: lineOf(index), column: null, rule, message });

  // from X import y
  const fromImport = /\bfrom[ \t]+(\.*)([\w.]*)[ \t]+import\b/g;
  const fromStarts = new Set();
  for (let m = fromImport.exec(text); m; m = fromImport.exec(text)) {
    fromStarts.add(m.index + m[0].length - 'import'.length);
    const root = m[2].split('.')[0];
    if (m[1] || !PYTHON_ALLOWED_MODULES.has(root)) {
      report(m.index, 'import', `Importing \`${m[1]}${m[2]}\` isn't allowed: only standard modules for calculations (math, statistics, collections, datetime…) can be imported.`);
    }
  }
  // import a, b.c as d
  const plainImport = /\bimport\b/g;
  for (let m = plainImport.exec(text); m; m = plainImport.exec(text)) {
    if (fromStarts.has(m.index)) continue;
    const rest = text.slice(m.index + 6).split(/[\n;]/)[0];
    const names = /^[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)[ \t]*$/.exec(rest);
    if (!names) {
      report(m.index, 'import', 'This import can\'t be checked; write it as `import module` on one line.');
      continue;
    }
    for (const part of names[1].split(',')) {
      const module = part.trim().split(/[ \t]+/)[0];
      if (!PYTHON_ALLOWED_MODULES.has(module.split('.')[0])) {
        report(m.index, 'import', `Importing \`${module}\` isn't allowed: only standard modules for calculations (math, statistics, collections, datetime…) can be imported.`);
      }
    }
  }
  // Risky built-ins, used as names (not as someone's attribute, like df.eval).
  const word = /[A-Za-z_][\w]*/g;
  for (let m = word.exec(text); m; m = word.exec(text)) {
    const name = m[0];
    let p = m.index - 1;
    while (p >= 0 && (text[p] === ' ' || text[p] === '\t')) p -= 1;
    if (PYTHON_BLOCKED_BUILTINS.has(name) && text[p] !== '.') {
      report(m.index, 'builtin', `\`${name}\` isn't allowed: it can run code, read files or reach the interpreter.`);
    } else if (/^__\w+__$/.test(name) && !PYTHON_ALLOWED_DUNDERS.has(name)) {
      report(m.index, 'dunder', `\`${name}\` isn't allowed: double-underscore attributes reach Python internals.`);
    }
  }

  findings.sort((a, b) => a.line - b.line);
  return findings.length ? codeFail(findings) : codeOk();
}

/** Picks the check for a submission's language. */
export function checkSubmissionCode(language, code) {
  if (language === 'JavaScript') return scanForMaliciousCode(code);
  if (language === 'Python') return scanPythonCode(code);
  return codeFail([{ line: null, column: null, rule: 'language', message: 'Only JavaScript and Python can be checked.' }]);
}

// ---------------------------------------------------------------------------
// JSON datasets
// ---------------------------------------------------------------------------

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
