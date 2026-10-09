# Approved code in the public API

When a developer's script is approved by an admin, it becomes part of the
public v1 API. Anyone can call it up by name; the API returns the code exactly
as it was written, and what it does.

## Endpoints

| Endpoint | Who | What |
|---|---|---|
| `GET /api/v1/code` | anyone | every approved script, newest first; optional `language=JavaScript\|Python`, `tag=<tag>` |
| `GET /api/v1/code/:slug` | anyone | one script |
| `GET /api/admin/verified-code` | admins | everything published, with submitter, approver and public address |
| `DELETE /api/admin/verified-code/:id` | admins | take a script off the public API (permanent) |

Response shape (fixed for v1; the stats page depends on it):

```json
{
  "data": {
    "slug": "average-pit-loss",
    "name": "Average pit loss",
    "description": "Mean pit-lane time lost per stop, in seconds.",
    "language": "JavaScript",
    "code": "export function avgPitLoss(stops) { ... }",
    "tags": ["pits", "strategy"],
    "approvedAt": "2026-10-08T12:00:00.000Z",
    "endpoint": "/api/v1/code/average-pit-loss"
  }
}
```

The list returns `{ "data": [ ...same objects... ] }`.

- The API **never runs** submitted code; it only returns it as text. Admins vet
  code before approving it.
- **Who submitted or approved** a script is not part of the public response.
  Admins see it through the admin endpoint.
- Like all of v1: no sign-in, rate-limited, cached for up to 60 seconds.

Frontend helpers in `frontend/src/api/client.js`: `listPublicCode`,
`getPublicCode`, `publicCodeUrl`, `listPublishedCode`, `removePublishedCode`.

## Slugs

`verified_code.slug` is the script's permanent public name. It is assigned **by
the database** when a `verified_code` row is inserted (trigger
`verified_code_assign_slug`, function `verified_code_next_slug`, migration
`20261009120000_add_verified_code_slug`). So any code path that approves code
gets a slug without doing anything:

1. lower-case the title
2. turn every run of characters other than `a-z` and `0-9` into one `-`
3. trim, and cut to 60 characters (`code` if nothing is left)
4. if that slug is taken, add `-2`, `-3`, ...

A transaction-scoped advisory lock serialises slug assignment, so scripts with
the same name approved at the same moment cannot clash. A slug never changes
after it is assigned. Code approved before the migration was backfilled oldest
first.

In Prisma the field is `slug String @unique @default("")`: the empty default
lets `prisma.verifiedCode.create` omit it, the trigger replaces it, and Prisma
reads the real value back.

## Removing a script

`DELETE /api/admin/verified-code/:id` deletes the `verified_code` row and logs
the admin's UID. The public address returns `404` straight away (or within the
60-second cache). Once approval moves code instead of copying it (branch
`sprint-4/feat-move-approved-code`), this is the only copy, so removal cannot be
undone. The admin UI must ask for confirmation. The Remove button itself is
added to the admin code panel in a later branch.

## Tests

```sh
DATABASE_URL=postgresql://nobody@127.0.0.1:1/none npm test   # unit tests
```

PostgreSQL suite (opt-in, local `verified_code_test_*` database with migrations
applied):

```sh
VERIFIED_CODE_TEST_DATABASE_URL="$LOCAL_DB" DATABASE_URL="$LOCAL_DB" \
  npm test -- --runInBand tests/public-code-api.integration.test.js
```
