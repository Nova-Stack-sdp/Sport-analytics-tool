# Load test

Generated 2026-09-28T10:42:59.268Z against `http://localhost:8080` — 1 concurrent clients, 5 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **FAIL** — overall p95 4540 ms, 90 requests in 150.6 s (0.6 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 5 | 0 | 3312 | 3385 | 3385 | OVER |
| site: fixtures list | 5 | 0 | 1231 | 1337 | 1337 | OVER |
| site: fixture events | 5 | 0 | 1229 | 1536 | 1536 | OVER |
| site: season statistics | 5 | 0 | 2563 | 2579 | 2579 | OVER |
| site: career statistics | 5 | 0 | 4836 | 5499 | 5499 | OVER |
| v1: fixtures by season | 5 | 0 | 913 | 996 | 996 | OVER |
| v1: one fixture | 5 | 0 | 921 | 990 | 990 | OVER |
| v1: fixture statistics | 5 | 0 | 1307 | 1478 | 1478 | OVER |
| v1: events of a fixture (500) | 5 | 0 | 1745 | 2457 | 2457 | OVER |
| v1: laps of a fixture | 5 | 0 | 1534 | 1659 | 1659 | OVER |
| v1: pit stops in a season | 5 | 0 | 1023 | 1228 | 1228 | OVER |
| v1: events in a time window | 5 | 0 | 1319 | 1433 | 1433 | OVER |
| v1: driver standings | 5 | 0 | 619 | 663 | 663 | OVER |
| v1: team standings | 5 | 0 | 615 | 615 | 615 | OVER |
| v1: drivers | 5 | 0 | 307 | 307 | 307 | ok |
| site: race replay state | 5 | 0 | 2 | 2 | 2 | ok |
| v1: events page 2 (cursor) | 5 | 0 | 1947 | 2183 | 2183 | OVER |
| v1: stat with source events | 5 | 0 | 4298 | 4333 | 4333 | OVER |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=c92248de-29dc-42d8-8f12-876c1da3ced3&format=csv` — 13488 ms, 1,621,154 bytes.
