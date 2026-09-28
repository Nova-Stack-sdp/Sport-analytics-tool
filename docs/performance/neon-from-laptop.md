# Load test

Generated 2026-09-28T10:47:43.249Z against `http://localhost:8080` — 10 concurrent clients, 30 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **FAIL** — overall p95 10736 ms, 540 requests in 244.3 s (2.2 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 30 | 0 | 6175 | 9292 | 9398 | OVER |
| site: fixtures list | 30 | 0 | 3417 | 6824 | 7120 | OVER |
| site: fixture events | 30 | 0 | 3858 | 7467 | 10340 | OVER |
| site: season statistics | 30 | 0 | 7829 | 13884 | 15863 | OVER |
| site: career statistics | 30 | 0 | 10519 | 17389 | 21045 | OVER |
| v1: fixtures by season | 30 | 0 | 2982 | 5971 | 5988 | OVER |
| v1: one fixture | 30 | 0 | 2678 | 5386 | 5771 | OVER |
| v1: fixture statistics | 30 | 0 | 4126 | 6121 | 6599 | OVER |
| v1: events of a fixture (500) | 30 | 0 | 5343 | 9001 | 9632 | OVER |
| v1: laps of a fixture | 30 | 0 | 4069 | 10736 | 11769 | OVER |
| v1: pit stops in a season | 30 | 0 | 3488 | 7202 | 7347 | OVER |
| v1: events in a time window | 30 | 0 | 3497 | 6124 | 6461 | OVER |
| v1: driver standings | 30 | 0 | 2212 | 3689 | 3787 | OVER |
| v1: team standings | 30 | 0 | 1885 | 3436 | 3504 | OVER |
| v1: drivers | 30 | 0 | 812 | 1937 | 1938 | OVER |
| site: race replay state | 30 | 0 | 2 | 16255 | 17593 | OVER |
| v1: events page 2 (cursor) | 30 | 0 | 3990 | 8549 | 9206 | OVER |
| v1: stat with source events | 30 | 0 | 7133 | 11266 | 12267 | OVER |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=c92248de-29dc-42d8-8f12-876c1da3ced3&format=csv` — 10498 ms, 1,621,154 bytes.
