# Verified code storage and rejected-submission retention

## Ownership and pipeline contract

This change supplies `VerifiedCode` storage and automatic cleanup. The review
pipeline, retrieval routes and user verification indicator belong to the other
Phase 2 workstream. The existing review endpoint still changes submission status;
this migration alone does not copy approved submissions or make scripts execute.

`VerifiedCode` stores `id`, `sourceSubmissionId`, `title`, `language`, `code`,
optional `description`, `tags`, `submitterId`, `verifiedBy` and `verifiedAt`.
Prisma uses camelCase; database column names use the schema's `@map` names.

`sourceSubmissionId` is unique and references `CodeSubmission.id`. The original
row cannot be deleted while a verified copy references it. The approved source
and the verified copy are retained; cleanup only concerns rejected code.

The partner's approval handler must claim a **pending** submission and create
its verified copy in one Prisma transaction. Use the authenticated admin UID for
`verifiedBy`, copy the fields from the stored submission (not from review-request
input), and use the same review time for `reviewedAt` and `verifiedAt`. Check that
the conditional status update changed exactly one row before inserting the copy.
On a competing/repeated review, return a conflict rather than creating another
copy. A transaction failure must roll back both writes. The unique constraint is
the final protection against duplicates.

An approved status by itself is not evidence of a verified copy. Existing
approved rows need reconciliation by the pipeline owner. Preserve the original
reviewer/time when copying them; report missing review metadata for manual review
rather than inventing a verifier. The migration creates an empty verified table.

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
every hour. A row is eligible only when its status is `rejected`, its non-null
`reviewedAt` is at least seven days old, and no verified copy exists. Age is
measured from review, not submission. At the exact seven-day boundary it becomes
eligible. Legacy rejected records with no review time are retained for manual
reconciliation. The job does not affect the event-sourced `Submission`/`Event`
tables or statistics.

Each run reads at most 100 candidate IDs at a time and makes at most ten deletion
batches (1,000 rows with default settings). The status, cutoff and verified-copy
conditions are checked again on deletion. Larger backlogs drain over subsequent
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

The PostgreSQL integration suite is opt-in because it deletes its fixture rows.
Create a **dedicated local** database named `verified_code_test_storage` and
apply migrations there. For example in PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://TEST_USER@127.0.0.1:55433/verified_code_test_storage'
npx prisma migrate deploy
npx prisma generate
$env:VERIFIED_CODE_TEST_DATABASE_URL = $env:DATABASE_URL
npm test -- --runInBand tests/verified-code-storage.integration.test.js
```

Use only a disposable test database, never the application database. The suite
rejects remote hosts and database names outside `verified_code_test_*`. Normal
backend test runs skip these integration tests unless explicitly configured.
They exercise copied code, unique/foreign-key constraints, rollback, the retention
boundary, verified-record protection, repeated cleanup and a concurrent review.

### Validation recorded for this change

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
