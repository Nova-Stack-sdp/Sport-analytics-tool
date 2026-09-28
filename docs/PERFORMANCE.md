# Performance

## Target

> **With 10 clients reading at the same time and the response cache turned
> off, every read endpoint — the website's own and the public `/api/v1` —
> answers with a 95th-percentile response time of 500 ms or less, and no
> request fails.**

The cache is off for the target so it measures the real database path;
with the cache on (the production default, 60 s) repeat reads are answered
from memory and are much faster (see [With the cache on](#with-the-cache-on)).

`backend/scripts/load-test.js` checks this target. It exits with code 1
when any endpoint is over.

## How it is measured

```bash
cd backend
# 1. start the API with rate limits and the cache off
RATE_LIMIT_PER_MINUTE=0 RATE_LIMIT_V1_PER_MINUTE=0 RATE_LIMIT_EXPORTS_PER_MINUTE=0 \
CACHE_TTL_SECONDS=0 npm start

# 2. in another terminal
node scripts/load-test.js --concurrency 10 --requests 20 --report ../docs/performance/my-run.md
```

The script finds a real race, driver and season through the API, then sends
18 kinds of request (listed below) 20 times each, 10 at a time, after one
warm-up round. For each endpoint it reports p50, p95 and max, then times one
CSV export on its own. The export is not part of the mix because exports are
limited to 10 a minute.

| Website | Public API |
|---|---|
| `/api/overview` | `/api/v1/fixtures?season=` |
| `/api/fixtures` | `/api/v1/fixtures/:id`, `/:id/statistics`, `/:id/statistics/:driverId` |
| `/api/fixtures/:id/events` | `/api/v1/events` by fixture, fixture + type, season + type, time window, and page 2 with a cursor |
| `/api/statistics?view=season` / `career` | `/api/v1/statistics/drivers`, `/teams`, `/api/v1/drivers` |
| `/api/race-replay/:id/state` | |

Test data: `backend/scripts/perf/seed-synthetic.sql` fills an empty local
database with three seasons of made-up data at realistic size: 162
sessions, 3,240 entries and **321,858 events** (a race has about 3,700).
The script refuses to run on any database whose name doesn't contain
`perf`, so it can't be run on Neon by mistake.

`backend/scripts/perf/explain-queries.sql` prints the query plans for the
heaviest event-log reads. It is read-only and safe to run on Neon.

## What was changed

1. **Two indexes on the event log**
   (migration `20261001090000_add_event_time_indexes`):
   `(occurred_at, event_id)` and `(session_id, occurred_at, event_id)`.
   The v1 API sorts events by `(occurred_at, event_id)`, which is its cursor
   order. Before these indexes, a time-window query and the Overview count
   of events in the last 24 hours read the **whole table**. Each page of a
   fixture's events also sorted all of that fixture's events.
2. **Independent queries sent together** on the Overview, Fixtures list and
   fixture event log routes (`Promise.all` instead of one `await` after
   another). Overview used to wait for 8 database round trips one after
   another. It now waits for 2.

### Query plans (321,858 events, local Postgres 16)

| Query | Before | After |
|---|---|---|
| v1 events in a time window (`from=`) | Parallel **seq scan** + sort, 37.0 ms | index scan, 0.08 ms |
| Overview "events in last 24 h" count | Parallel **seq scan**, 34.1 ms | index-only scan, 0.02 ms |
| v1 events of a fixture, first page of 500 | sort all 3,703 of the fixture's events, 2.1 ms | index scan, reads 501 rows, 0.3 ms |
| v1 events, next page by cursor | 1.7 ms | 2.5 ms (Prisma's cursor SQL uses an `OR`; unchanged) |
| v1 pit stops in a season | 0.7 ms | 0.7 ms (already indexed) |
| Fixtures list, which sessions have replay data | index-only scan, 28.7 ms | 27.4 ms (reads every event row; covered by the response cache) |

Full plans: [`performance/explain-before-indexes.txt`](performance/explain-before-indexes.txt),
[`performance/explain-after-indexes.txt`](performance/explain-after-indexes.txt).

### Response times, before and after

The database was local, so there was no network delay to it. The load
generator, API and Postgres shared one 2-CPU machine, so the numbers under
load are worst case.

| | Before | After |
|---|---|---|
| 10 clients: overall p95 | 294 ms | **178 ms** |
| 10 clients: slowest endpoint p95 | 387 ms (Overview) | 216 ms (stat with source events) |
| 10 clients: throughput | 73 req/s | 102 req/s |
| 1 client: Overview p50 | 41 ms | 7 ms |
| 1 client: events in a time window p50 | 38 ms | 5 ms |
| 25 clients: overall p95 | — | 414 ms (all endpoints pass) |

Reports: [before](performance/load-test-local-before.md) ·
[after](performance/load-test-local-after.md) ·
[after, 25 clients](performance/load-test-local-after-25-clients.md).

### With 20 ms of network delay to the database

Neon is reached over the network, so each query round trip costs time even
when the query itself is fast. To test this, a small TCP proxy added 10 ms
each way between the API and Postgres. Single client, p50:

| Route | Before (one query after another) | After (queries sent together) |
|---|---|---|
| `/api/overview` | 246 ms | **113 ms** |
| `/api/fixtures` | 250 ms | **118 ms** |
| `/api/fixtures/:id/events` | 202 ms | **112 ms** |

With 10 clients and the delay added, every endpoint still met the target.
Overall p95 was 274 ms
([report](performance/load-test-simulated-20ms-db-after.md)).

### With the cache on

With production settings (cache 60 s) and 25 clients, 360 requests
completed in 0.3 s. Overall p95 was 50 ms and every response after the
warm-up came from memory.

## Results on the real deployment

Record runs against Neon here. There are two useful runs:

- **API on your laptop, database on Neon.** This measures the database
  path over a real network. Your distance to Neon's region is part of the
  result.
  ```bash
  RATE_LIMIT_PER_MINUTE=0 RATE_LIMIT_V1_PER_MINUTE=0 RATE_LIMIT_EXPORTS_PER_MINUTE=0 \
  CACHE_TTL_SECONDS=0 npm start
  node scripts/load-test.js --report ../docs/performance/neon-from-laptop.md
  ```
- **The deployed API on Northflank, with production settings.** This is
  what a user sees. Keep the cache on. Stay under the public API's
  120-requests-a-minute limit by sending fewer requests:
  ```bash
  node scripts/load-test.js --base https://<your-northflank-api> --requests 6 \
    --report ../docs/performance/production.md
  ```

| Run | Date | Clients | Overall p95 | Slowest endpoint (p95) | Result |
|---|---|---:|---:|---|---|
| Neon from laptop | | 10 | | | |
| Production (Northflank) | | 10 | | | |

## Known limits

- One Node process handles about 100 uncached requests a second on the
  test machine. Past that, response time grows with the number of clients.
  The cache, and running a second instance on Northflank, are the levers.
- Prisma sends a separate query for each `include` level. A fixture with
  its meeting and circuit is 3 round trips. Prisma's `relationJoins`
  feature would make it 1, and is the next thing to try if Neon latency
  dominates.
- The Fixtures list scans the `(session_id, event_type)` index across every
  event to decide which sessions can be replayed. That cost grows with the
  table. At about 1M events, store a `replayReady` flag on the session
  during sync instead.
