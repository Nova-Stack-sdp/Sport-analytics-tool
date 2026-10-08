# Verified code storage and rejected-submission retention

## How approval works now: move, not copy

Approved code is stored **once**, in `verified_code`. When an admin approves a
submission (`PATCH /api/code-submissions/:id` with `status: 'approved'`), one
transaction:

1. reads the `code_submission` row and checks it is still `pending`;
2. inserts a `verified_code` row with every field copied from the stored
   submission (never from the request), plus `verifiedBy` (the admin's UID)
   and `verifiedAt`;
3. deletes the `code_submission` row `WHERE status = 'pending'`. If that deletes
   nothing, a concurrent reject won, and the transaction is rolled back.

Two admins approving at once: the second insert hits the unique index on
`source_submission_id`, rolls back, and gets `409`. Rejecting is a conditional
status update to `rejected` and does not touch `verified_code`.

`VerifiedCode` stores `id`, `sourceSubmissionId`, `title`, `language`, `code`,
optional `description`, `tags`, `submitterId`, `submitterEmail`, `submittedAt`,
`verifiedBy` and `verifiedAt`. Prisma uses camelCase; database column names use
the schema's `@map` names.

`sourceSubmissionId` is the ID the code had in `code_submission`. It is unique
but **not** a foreign key (dropped in `20261009101000_drop_verified_code_source_fk`),
because the row it names is deleted on approval. The admin API keeps using that
ID for approved code: the list returns it as `id` (with the verified row's own
ID as `verifiedCodeId`), and `GET /api/code-submissions/:id` falls back to
`verified_code` when `code_submission` has no such row.

Code approved before this change was copied, not moved.
`20261009102000_move_approved_code_submissions` finishes the move for it: it
creates any missing verified copy (keeping the original reviewer), then deletes
the approved `code_submission` rows. Approved rows with no recorded reviewer are
left in place and reported with a `NOTICE` for manual review. The
`approved` value of `CodeSubmissionStatus` is kept so those rows stay valid.

## Migration and deployment

From `backend`, using the usual deployment credentials:

```sh
npx prisma migrate deploy
npx prisma generate
```

Deploy the migrated database and regenerated client before starting the updated
backend. No hosted database is changed by adding this migration to Git.

## Cleanup behavior

The backend starts cleanup when its HTTP server begins listening and checks again
every hour. A row is eligible only when its status is `rejected` and its non-null
`reviewedAt` is at least seven days old. As a safeguard, a rejected row whose ID
is still named by some `verified_code.source_submission_id` is kept (and skipped
for the rest of that run); with approval moving code this should never happen. Age is
measured from review, not submission. At the exact seven-day boundary it becomes
eligible. Legacy rejected records with no review time are retained for manual
reconciliation. The job does not affect the event-sourced `Submission`/`Event`
tables or statistics.

Each run reads at most 100 candidate IDs at a time and makes at most ten deletion
batches (1,000 rows with default settings). The status and cutoff conditions are
checked again on deletion. Larger backlogs drain over subsequent
runs. Runs do not overlap within a process; independent instances may safely
select the same candidates because deletion is guarded and idempotent. A failed
run is logged and retried at the next interval; it does not stop the HTTP server.
The timer is stopped when the server closes and does not keep Node alive.

Deleted rejected code and its review record disappear from the database and
rejected history. There is no automatic recovery after deletion; database backup
restoration would be required. The UI owner should replace any promise of
permanent rejected history with this seven-day retention policy.

| Environment variable | Default | Allowed values |
| --- | --- | --- |
| `REJECTED_CODE_CLEANUP_ENABLED` | `true` | `true` or `false` |
| `REJECTED_CODE_RETENTION_DAYS` | `7` | whole days, 1–36,500 |
| `REJECTED_CODE_CLEANUP_INTERVAL_MS` | `3600000` | integer, 1–2,147,483,647 |
| `REJECTED_CODE_CLEANUP_BATCH_SIZE` | `100` | integer, 1–500 |

Invalid settings fail startup with a configuration error. Set enabled to `false`
for rollout or maintenance when cleanup must not run. An always-running backend
refreshes without any user being signed in; a stopped backend catches up at its
next startup.

## Tests

```sh
npm test -- --runInBand tests/rejected-code-cleanup.test.js
```

The PostgreSQL integration suites are opt-in because they delete their fixture
rows. `verified-code-storage.integration.test.js` covers storage and cleanup;
`code-review-move.integration.test.js` runs the real review routes (Firebase
stubbed) and covers the move, the admin list/detail, two simultaneous approvals,
and an approval racing a rejection. Run them with `--runInBand`, since both
clear the same tables.
Create a **dedicated local** database named `verified_code_test_storage` and
apply migrations there. For example in PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://TEST_USER@127.0.0.1:55433/verified_code_test_storage'
npx prisma migrate deploy
npx prisma generate
$env:VERIFIED_CODE_TEST_DATABASE_URL = $env:DATABASE_URL
npm test -- --runInBand tests/verified-code-storage.integration.test.js tests/code-review-move.integration.test.js
```

Or in bash (Linux / Kali):

```sh
export DATABASE_URL='postgresql://TEST_USER@127.0.0.1:5432/verified_code_test_storage'
npx prisma migrate deploy
npx prisma generate
VERIFIED_CODE_TEST_DATABASE_URL="$DATABASE_URL" \
  npm test -- --runInBand tests/verified-code-storage.integration.test.js tests/code-review-move.integration.test.js
```

Use only a disposable test database, never the application database. The suite
rejects remote hosts and database names outside `verified_code_test_*`. Normal
backend test runs skip these integration tests unless explicitly configured.
Together they exercise the move on approval, the unique index, rollback, the
retention boundary, protection of referenced rows, repeated cleanup and concurrent
reviews.

### Validation recorded for the move-on-approval change

- All 15 migrations applied in order to a fresh local PostgreSQL 16 database.
- The data migration was run against a database built from `main`'s migrations
  plus legacy rows (approved with a copy, approved without a copy, approved with
  no reviewer, pending, rejected), and again to confirm it is idempotent.
- Both integration suites passed three consecutive runs; the full backend suite
  passed with them skipped.

### Validation recorded for the original verified-code change

- Prisma schema validation and client generation passed.
- All ten migrations applied to a fresh dedicated local PostgreSQL database.
- The 29 focused tests (storage, cleanup and existing code-submission API) passed.
- The full backend suite passed 313 tests and failed four existing auth tests;
  the pre-change baseline passed 302 tests and failed the same four tests.
- An HTTP startup check returned 200 and the scheduled startup pass deleted an
  expired test submission without any user request initiating cleanup.
- Database/schema comparison showed no drift for verified-code storage. The
  existing migration history is missing the `user_profile` and `notification`
  tables and `NotificationType` enum already declared in the baseline schema.

The four unchanged failures are in `tests/auth-api.test.js`: creating a session
for a valid token, reading the cookie session, reflecting the developer claim,
and reporting an allowlisted admin through session/me. They were reproduced
before any implementation changes; no new test failures were introduced.

Code review checked the deletion predicate, concurrent-change recheck, unique
source constraint, restrictive foreign key, timer lifecycle and retry behavior.
The review found no remaining blockers in this change. The pipeline owner still
needs to implement approved-copy transactions and existing-approval reconciliation.
