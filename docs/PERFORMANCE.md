# Performance

## Target

> **With 10 clients reading at the same time and the response cache turned
> off, every read endpoint — the website's own and the public `/api/v1` —
> answers with a 95th-percentile response time of 500 ms or less, and no
> request fails.**

The time is the API's own response time: from the request reaching the
server to the response being sent, which every response reports in a
`Server-Timing` header. It includes the database round trips (the
platform's own infrastructure) but not the network between the caller and
the API. A caller on another continent adds its own round trip on top,
whatever the platform does. The load test reports both numbers.

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

### First run against Neon: network round trips dominate

Neon is in **AWS us-east-2 (Ohio)**. The API on Northflank runs in
**Europe West (London)**, and the team's laptops are in Johannesburg.
`scripts/perf/db-ping.js` measured the laptop-to-Neon round trip at
**309 ms median** (20 × `SELECT 1`).

The first laptop runs failed badly: overall p95 of 4.5 s with 1 client and
10.7 s with 10 clients. The reports are
[`neon-from-laptop-1-client.md`](performance/neon-from-laptop-1-client.md)
and [`neon-from-laptop.md`](performance/neon-from-laptop.md).

The database itself was not slow. `v1: drivers` is a single small query
and took 307 ms, exactly one round trip. Every other endpoint took a whole
number of round trips: a fixture with its meeting and circuit took 3
(921 ms), because Prisma sent one query per `include` level and each query
waited for the one before. The response time was
**(number of sequential queries) × (round trip)**.

### What changed

1. **Relations are loaded with JOINs.** This uses Prisma's `relationJoins`
   feature (in `schema.prisma`). An `include` now becomes one SQL query
   instead of one per relation level. We checked that every response from
   69 endpoint/parameter combinations is byte-for-byte identical before and
   after (11 MB of JSON and CSV), on both test databases.
2. **The statistics routes send independent queries together**: season,
   career and the season list.
3. **Idle database connections are kept for 5 minutes** instead of `pg`'s
   default of 10 seconds. Opening a new connection to Neon costs several
   round trips (TCP, TLS, authentication), and a quiet API was paying that
   on most requests.
4. **`Server-Timing` on every response.** The load test now reports the
   API's own time next to the client's, so a run from Johannesburg against
   the London deployment can still be judged on the platform's
   performance.

Production latency was simulated with a proxy that adds 43 ms in each
direction (an 86 ms round trip, typical for London to Ohio), against the
321,858-event database, with 10 clients and the cache off:

| | Before | After |
|---|---:|---:|
| Overall p95 (server time) | 749 ms — **FAIL** | 434 ms — **PASS** |
| Slowest endpoint p95 | 881 ms (stat with source events) | 474 ms (stat with source events) |
| `v1: one fixture` p95 | 428 ms | 194 ms |
| `site: overview` p95 | 684 ms | 347 ms |
| `site: season statistics` p95 | 832 ms | 278 ms |

Reports: [before](performance/simulated-london-to-ohio-before.md) ·
[after](performance/simulated-london-to-ohio-after.md).

### Recommendation: put the database next to the API

With an 86 ms round trip the target is met, but only just. A statistic with
its source events still needs several round trips. Neon offers
**AWS eu-west-2 (London)**, the same city as the Northflank service. There
the round trip is about 1–2 ms, the same as the local results above, and
every endpoint would answer in well under 100 ms. It would also roughly
halve the round trip from the team's laptops (Johannesburg to London is
about 160 ms, compared with 309 ms to Ohio).

A Neon project can't change region, so moving means creating a London
project and copying the data across with `pg_dump` / `pg_restore`.

### Runs

- **The deployed API on Northflank.** This is the run the target is judged
  on. Server time is read from `Server-Timing`, so running it from a laptop
  is fine. To keep production rate limits on, send fewer requests: the
  public API allows 120 a minute.
  ```bash
  node scripts/load-test.js --base https://<your-northflank-api> --requests 6 \
    --report ../docs/performance/production.md
  ```
- **API on a laptop, database on Neon.** This is useful to see the effect
  of round trips. It can't meet the target from Johannesburg while Neon is
  in Ohio: at 309 ms per round trip, even a single query is 60% of the
  budget.
  ```bash
  RATE_LIMIT_PER_MINUTE=0 RATE_LIMIT_V1_PER_MINUTE=0 RATE_LIMIT_EXPORTS_PER_MINUTE=0 \
  CACHE_TTL_SECONDS=0 npm start
  node scripts/load-test.js --report ../docs/performance/neon-from-laptop-after.md
  ```

| Run | Date | Where the API ran | DB round trip | Clients | p95 total | p95 server | Result |
|---|---|---|---:|---:|---:|---:|---|
| Laptop → Neon, before | 2026-09-28 | Johannesburg | 309 ms | 10 | 10,736 ms | — | FAIL |
| Simulated production, after | 2026-09-28 | local + 86 ms proxy | 86 ms | 10 | 438 ms | 434 ms | PASS |
| Production (Northflank) | | London | | 10 | | | |

## Known limits

- One Node process handles about 100 uncached requests a second on the
  test machine. Past that, response time grows with the number of clients.
  The cache, and running a second instance on Northflank, are the levers.
- `relationJoins` is a Prisma preview feature. If a Prisma upgrade changes
  its behaviour, compare responses before and after the upgrade the same
  way (see above), or remove the line from `schema.prisma` to go back to
  one query per relation.
- Neon's free tier suspends the database after 5 minutes without queries.
  The first request after that waits for it to start, which takes about
  a second.
- The Fixtures list scans the `(session_id, event_type)` index across every
  event to decide which sessions can be replayed. That cost grows with the
  table. At about 1M events, store a `replayReady` flag on the session
  during sync instead.
