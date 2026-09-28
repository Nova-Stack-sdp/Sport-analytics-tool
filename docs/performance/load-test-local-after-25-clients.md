# Load test

Generated 2026-09-28T01:31:29.078Z against `http://localhost:8099` — 25 concurrent clients, 20 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **PASS** — overall p95 414 ms, 360 requests in 3.5 s (101.7 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 20 | 0 | 364 | 426 | 447 | ok |
| site: fixtures list | 20 | 0 | 214 | 280 | 306 | ok |
| site: fixture events | 20 | 0 | 231 | 291 | 330 | ok |
| site: season statistics | 20 | 0 | 370 | 414 | 484 | ok |
| site: career statistics | 20 | 0 | 337 | 427 | 452 | ok |
| site: race replay state | 20 | 0 | 25 | 52 | 151 | ok |
| v1: fixtures by season | 20 | 0 | 229 | 277 | 422 | ok |
| v1: one fixture | 20 | 0 | 213 | 260 | 280 | ok |
| v1: fixture statistics | 20 | 0 | 308 | 361 | 366 | ok |
| v1: events of a fixture (500) | 20 | 0 | 231 | 275 | 285 | ok |
| v1: laps of a fixture | 20 | 0 | 231 | 296 | 297 | ok |
| v1: pit stops in a season | 20 | 0 | 243 | 304 | 309 | ok |
| v1: events in a time window | 20 | 0 | 243 | 284 | 286 | ok |
| v1: driver standings | 20 | 0 | 157 | 189 | 216 | ok |
| v1: team standings | 20 | 0 | 161 | 192 | 196 | ok |
| v1: drivers | 20 | 0 | 98 | 132 | 133 | ok |
| v1: events page 2 (cursor) | 20 | 0 | 238 | 276 | 276 | ok |
| v1: stat with source events | 20 | 0 | 419 | 477 | 502 | ok |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 97 ms, 1,355,997 bytes.
