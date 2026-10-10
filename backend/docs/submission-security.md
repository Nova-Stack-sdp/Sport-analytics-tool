# Submission security policy

Developers upload two kinds of content: **code** (JavaScript or Python scripts
for the public code API) and **datasets** (race data as JSON). This page says
what is checked, where, and what the checks cannot do.

## What actually protects the platform

Submitted code is **never executed** by the platform. It is stored, read by an
admin, and served as text (JSON, with `X-Content-Type-Options: nosniff`), and the
frontend shows it with React as plain text. Nothing in the backend runs it: there
is no `eval`, `new Function`, `vm` or `child_process` on any submission path.

Everything below is a filter in front of the admin review. It catches the
obvious and the common, with line numbers, so reviewers can spend their time on
what is left. **It cannot prove code safe.** A determined author can hide intent
from any static check, so a passing result must never be used as permission to
run code. Any future feature that runs submissions needs its own isolated,
resource-limited service with no credentials, no network and no host files.

## Where the rules live

`backend/src/lib/securityHelpers.js` and `frontend/src/utils/securityHelpers.js`
are the same file (the apps build from separate Docker contexts). A backend test
fails if they differ, so change both together. The browser applies the rules
before sending; the API applies them again to whatever arrives.

## Code

`checkSubmissionCode(language, code)` picks the check for the language. Every
result is `{ isValid, error, findings }`: `findings` lists every problem as
`{ line, column, rule, message }`, and `error` summarises the first three
("Line 2: `require` isn't available to submitted scripts: it loads modules or
files. …").

Both languages: at most 50,000 characters (form and API), must be text, and no
NUL or text-direction control characters (these can make code read differently
from how it runs, "Trojan Source").

### JavaScript: parsed, not pattern-matched

The code is parsed with [acorn](https://github.com/acornjs/acorn) as an ES
module (so the form's own `export function` example is valid). Comments and
strings are never inspected, and anything that isn't valid JavaScript (a C file
renamed to `.js`, a typo) is refused by the parser with its line.

| Rule | Examples refused |
|---|---|
| Only names the script declares, plus standard built-ins (`Math`, `JSON`, `Array`, `Object`, `Map`, `Set`, `Date`, `Number`, `String`, `Promise`, `Intl`, `console`, typed arrays, …) | `require`, `process`, `fetch`, `window`, `document`, `globalThis`, `eval`, `Function`, `setTimeout`, `Reflect`, `Proxy`, any undeclared name, `leak = 1` |
| No modules | `import fs from 'fs'`, `import('…')`, `import.meta`, `export … from '…'` |
| No property names that lead to the Function constructor or prototypes | `.constructor`, `.__proto__`, `.prototype`, `__defineGetter__` and friends, `getPrototypeOf`, `setPrototypeOf`, `getOwnPropertyDescriptor(s)`, `defineProperty`/`defineProperties`, `fromCharCode`/`fromCodePoint`, `{ __proto__: … }` |
| No property names built from strings | `a['con' + 'structor']`, ``a[`${x}y`]`` |

Names are resolved through real scopes: a local variable called `location`
(car location data) is fine, and a parameter called `process` does not make the
global `process` usable elsewhere. Escapes such as `eval` are decoded by the
parser, so they hide nothing. Extremely deep nesting is refused, never thrown.

Known gap: a property name held in a variable (`const k = …; obj[k]`) cannot be
checked statically. That is one reason the check is a filter and the code is
never run.

### Python: a careful text check

There is no Python parser on the JavaScript side, so comments and ordinary
string contents are blanked out first, then the code is checked for:

- **Imports** outside a small allowlist of standard modules for calculation:
  `math`, `cmath`, `statistics`, `decimal`, `fractions`, `numbers`, `random`,
  `json`, `re`, `string`, `textwrap`, `datetime`, `calendar`, `zoneinfo`,
  `collections`, `itertools`, `functools`, `operator`, `heapq`, `bisect`,
  `array`, `copy`, `enum`, `typing`, `dataclasses`, `abc`. Relative imports are
  refused too. To allow another module (pandas, say), add it to
  `PYTHON_ALLOWED_MODULES` deliberately: many libraries can read files or URLs.
- **Built-ins** that run code or reach files and the interpreter: `eval`,
  `exec`, `compile`, `open`, `__import__`, `getattr`/`setattr`/`delattr`,
  `globals`/`locals`/`vars`, `input`, `breakpoint`, `exit`/`quit`, `help`,
  `memoryview`. Attributes with those names (`df.eval`) are fine.
- **Double-underscore names** other than ordinary special methods (`__init__`,
  `__repr__`, `__len__`, `__name__`, …): `__class__`, `__subclasses__`,
  `__globals__`, `__builtins__` and the rest are how Python sandbox escapes are
  built.
- **Strings that never close.**

f-string contents are checked as code, because their `{…}` parts run.

### Review

- The admin detail view (`GET /api/code-submissions/:id`) includes
  `policyCheck: { passed, findings }`, run on the stored code with the current
  rules, and Admin → Submissions shows it under the code.
- Approving runs the check again inside the approval transaction. Code that
  fails is refused with 422 and the findings, and nothing is published. This
  covers anything queued before the rules existed or changed.

## Datasets

- At most **10 MiB** of UTF-8 JSON (a full race is roughly 1–2 MB), at most 32
  nested containers, and no `__proto__`, `prototype` or `constructor` key at any
  depth (escaped spellings included).
- The API checks size, encoding and nesting on the raw bytes before parsing,
  then the keys on the parsed body, so each upload is parsed once. It then
  requires `application/json`, a JSON object, and arrays of record objects for
  the event keys, before any database access.
- Refusals name the rule: 400 for nesting, keys, invalid UTF-8 or syntax; 413
  above 10 MiB; 415 for other encodings. Request bodies are never logged or
  echoed.

These checks don't detect secrets or personal data, and they don't replace the
dataset schema validation the ingestion code does.

## Rate limits

New uploads are limited per client IP: `RATE_LIMIT_SUBMISSIONS_PER_HOUR`
(default 30) for datasets and, separately, for code. Only `POST` to the
collection counts; it is checked before the body is read.

## Files

`validateFileUpload` / `validateFileContents` check `.js` and `.json` file
metadata and contents (MIME allowlist, unambiguous file name, at most 2 MiB,
strict UTF-8). No form uses a file picker yet; they are ready for one. Browser
MIME types are user-controlled and only a first filter.
