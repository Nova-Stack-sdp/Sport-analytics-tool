# Submission security policy

`frontend/src/utils/securityHelpers.js` exports dependency-free ES modules. Each
validator returns `{ isValid, error }`; the optional `validateFileContents` helper
is asynchronous and resolves to that same shape. Inputs are rejected, never
silently modified or evaluated. The file includes a React submission example.

- `validateFileUpload(file, expectedExtension)`: permits `.js` and `.json` with
  explicit MIME allowlists; rejects missing/generic MIME types, ambiguous paths,
  empty files and sizes above 2 MiB (2,097,152 bytes).
- `validateFileContents`: reads UTF-8 with fatal decoding after the size gate,
  checks byte count, then runs JSON validation or the JavaScript policy scan.
- `validateJsonBatch`: caps UTF-8 text at 1 MiB (1,048,576 bytes), checks at most
  32 nested containers before parsing, requires an object/array and rejects
  `__proto__`, `prototype` and `constructor` keys at every level.
- `scanForMaliciousCode`: conservatively rejects the requested dangerous APIs,
  dynamic Function/constructor references, escaped identifiers/strings, and
  obvious C preprocessor directives and common C declarations (such as `int main`).
  It intentionally flags prohibited words in
  strings/comments too. It does not validate JavaScript syntax.

Both applications deploy from separate Docker build contexts. The backend keeps
an identical helper at `backend/src/lib/securityHelpers.js`; a parity test ensures
changes to one copy are also applied to the other.

The existing dataset form validates its JSON before submission, including the
final body after adding metadata. The API independently limits raw request bytes
to 1 MiB, validates nesting and keys before Express parsing, and checks dataset
record containers before accessing the database. This replaces the previous
20 MiB dataset limit. The route requires `application/json`. Malformed input
returns 400, oversized bodies 413, unsupported encodings 415. Parser errors are
not logged because they may contain private request bodies.

The code form and API both scan JavaScript before submission/storage. Existing
50,000-character code limits remain; Python submissions retain existing validation
and are not covered by the JavaScript scanner. No file picker or multipart API is
introduced; file validators are available for future file-input callers.

## Active submission paths after merging main

The developer page renders `frontend/src/pages/CodeSubmissionPage.js` for its
Submit Code tab. Its `handleSubmit` calls `validateSubmission` from
`features/code-submission/submissionFormat.js`, which calls `scanForMaliciousCode`
for JavaScript. An invalid result populates the existing field errors and returns
before `submitCodeSubmission` is called. Keep this shared gate when editing the
form; importing and calling the scanner again in the component duplicates rules.

`POST /api/code-submissions` is mounted in `backend/src/app.js`. Its middleware
order is `requireAuth`, `requireVerifiedEmail`, `requireDeveloperOrAdmin`, then
`validateCodeSubmission`. The latter calls the existing `validateBody` (including
the security scan), returns the existing 400 error shape on failure, and passes
normalized fields through `res.locals.validatedSubmission`. The handler then
checks optional test-dataset ownership and stores the submission. Authentication,
review endpoints, notifications and transaction behavior remain unchanged.

These are separate, active features, not obsolete copies:

| File | Responsibility |
| --- | --- |
| `frontend/src/pages/CodeSubmissionPage.js` | Submit scripts |
| `frontend/src/components/developer/SubmissionsPanel.js` | Submit JSON datasets |
| `frontend/src/components/admin/CodeSubmissionsPanel.js` | Review submitted scripts |
| `backend/src/routes/codeSubmissions.js` | Script submission and review |
| `backend/src/routes/submissions.js` | Dataset submission, listing and review |

There is no developer `CodeSubmissionsPanel.js` in this checkout. Do not move the
dataset handler into the admin review panel or delete the dataset route: the
script form also calls its listing endpoint to populate the test-dataset picker.

Before removing a file in a future refactor, inspect all references from the
repository root (including tests and API clients):

```powershell
rg -n '\bSubmissionsPanel\b|\bsubmissionsRouter\b|/api/submissions|listSubmissions|submitData|reviewSubmission' frontend/src backend/src backend/tests
```

Migrate every live caller and route deliberately, preserve the dataset feature,
and verify script rejection, successful submission, test-dataset selection,
dataset uploads and admin review before deleting files. Remove obsolete imports
and route mounts alongside a deletion; keep regression tests for the replacement.
Run the frontend build and affected frontend/backend tests afterward. For this
migration, both dataset files remain required and no deletion is appropriate.

## Boundaries

Browser MIME metadata is user-controlled and often inferred from a filename.
There is no reliable language signature distinguishing arbitrary C/JS/plain text.
Passing metadata checks does not establish a file's actual language. JSON gets a
real syntax check; JavaScript gets only a conservative heuristic check.

Arbitrary computed names, encoded payloads, other languages and unknown dangerous
APIs can bypass any denylist. These helpers must not be treated as permission to
execute code, publish it as trusted code, or interpolate it into HTML. Keep scripts
inert and render them as text. Any future execution service needs independent
isolation, resource quotas and denial of credentials, network and host access.
Dataset business schemas, authorization and review remain required. This policy
does not detect all secrets or personal data in uploads.
