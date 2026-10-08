# Dataset submissions: purposes, original uploads, admin review and deletion

Developers upload datasets (batches of OpenF1-shaped race records) with
`POST /api/submissions`. This document covers what happens to them and what
admins can do with them.

## Two kinds of dataset

Every dataset has a `purpose` (`submission.purpose`, enum `SubmissionPurpose`):

| Purpose | Sent as | Validated | Written to the event log | Reviewed | Can affect statistics |
|---|---|---|---|---|---|
| Race data | `purpose` omitted or `"race_data"` | yes | yes, valid records only | accepted/rejected by an admin | yes, once accepted |
| Test data | `"purpose": "code_test"` | yes, same rules | **never** | not on its own (reviewed with its code) | **never** |

Test data exists so a developer can send sample input alongside submitted
code. Because it never reaches the event log, it cannot show up in
statistics, the public API, fixtures, race replay or time travel, whatever
its status. `PATCH /api/submissions/:id` refuses it with `409`.

A batch where nothing validates is auto-rejected (`422`) for both purposes.
Every submission records a summary: `{ validRecords, rejectedRecords, eventsWritten }`.

## Original uploads

Every dataset submitted from this change on is stored exactly as it was
received, byte for byte, in `submission_upload` (one row per submission,
removed with it), together with its content type, size and SHA-256. The
body parser on `/api/submissions` keeps the raw bytes (`req.rawBody`) for
this. Uploads are kept even for auto-rejected batches.

Datasets submitted earlier have no stored upload. Downloading one gives a
**rebuilt** JSON file instead: the accepted records (from the events it
wrote) and the rejected records with their reasons (from the validation
report), marked `"rebuilt": true`. Formatting and fields that were never
stored cannot be recovered.

## Admin endpoints (`/api/admin/datasets`, admins only)

Only developer uploads (`source = manual_upload`) are listed; OpenF1 sync
batches are not.

| Method and path | What it does |
|---|---|
| `GET /?view=pending\|accepted\|rejected\|test\|deleted` | One tab of datasets, newest first (max 200), plus the count for every tab |
| `GET /:id` | One dataset, with its rejected records and what the download will be |
| `GET /:id/upload` | Download: original bytes (`X-Dataset-Upload: original`, `X-Content-SHA256`) or a rebuilt file (`X-Dataset-Upload: rebuilt`), always as an attachment, `Cache-Control: no-store` |
| `DELETE /:id` | Soft delete |
| `POST /:id/restore` | Undo a soft delete |

Accepting or rejecting race data stays on `PATCH /api/submissions/:id`.

## Deleting is a soft delete

The event log is append-only, so deleting a dataset does not remove rows.
`DELETE` sets `submission.deleted_at` / `deleted_by`, and every read of the
event log filters that dataset's events out:

- statistics (`derivation/db.js`, `derivation/rebuild.js`: `LIVE` requires an accepted, undeleted source)
- the public API (`api/v1`: event lists, exports, single events, traceability)
- fixtures, race replay, time travel and the overview (`lib/eventVisibility.js`: `FROM_UNDELETED_DATASET`)

**Any new code that reads `event` must apply `FROM_UNDELETED_DATASET`** (or the
derivation's `LIVE` filter) as well.

If the deleted dataset was accepted race data, its session's statistics are
recomputed immediately. Restoring clears the fields and recomputes again.
Both actions are conditional updates, so repeating one gives `409`. If the
recompute fails, the delete or restore is still saved; the response says
`statisticsRecalculated: false` with a warning. Restore and delete again to
retry.

A deleted dataset cannot be reviewed until it is restored. Developers still
see their own deleted datasets in their list, marked "Deleted by admin".

## Known gap (not changed here)

The public API, fixtures, race replay and time travel show events from
**pending** and **rejected** race data too. Only statistics wait for
acceptance. Deleted datasets are hidden everywhere, but unreviewed ones are
not. Making those reads wait for acceptance is a separate decision.

## Migrations

- `20261009110000_add_submission_purpose_and_soft_delete`: `purpose` (default `race_data`), `deleted_at`, `deleted_by`, and an index on `(purpose, deleted_at, submitted_at)`
- `20261009111000_add_submission_upload`: the `submission_upload` table

No backfill is needed: every existing submission is race data and not deleted.

## Tests

```sh
DATABASE_URL=postgresql://nobody@127.0.0.1:1/none npm test
```

The PostgreSQL suite (`tests/dataset-lifecycle.integration.test.js`) is
opt-in and needs a dedicated local `verified_code_test_*` database with the
migrations applied:

```sh
export LOCAL_DB='postgresql://USER:PASS@127.0.0.1:5432/verified_code_test_datasets'
DIRECT_URL="$LOCAL_DB" DATABASE_URL="$LOCAL_DB" npx prisma migrate deploy
VERIFIED_CODE_TEST_DATABASE_URL="$LOCAL_DB" DATABASE_URL="$LOCAL_DB" \
  npm test -- --runInBand tests/dataset-lifecycle.integration.test.js
```
