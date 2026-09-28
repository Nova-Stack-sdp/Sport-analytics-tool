# Load test

Generated 2026-09-28T01:27:04.468Z against `http://localhost:8099` — 10 concurrent clients, 20 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **PASS** — overall p95 294 ms, 360 requests in 4.9 s (72.9 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 20 | 0 | 329 | 387 | 404 | ok |
| site: fixtures list | 20 | 0 | 228 | 316 | 357 | ok |
| site: fixture events | 20 | 0 | 192 | 259 | 277 | ok |
| site: season statistics | 20 | 0 | 136 | 212 | 214 | ok |
| site: career statistics | 20 | 0 | 177 | 246 | 268 | ok |
| site: race replay state | 20 | 0 | 20 | 43 | 46 | ok |
| v1: fixtures by season | 20 | 0 | 108 | 172 | 176 | ok |
| v1: one fixture | 20 | 0 | 100 | 159 | 171 | ok |
| v1: fixture statistics | 20 | 0 | 142 | 211 | 244 | ok |
| v1: events of a fixture (500) | 20 | 0 | 132 | 189 | 250 | ok |
| v1: laps of a fixture | 20 | 0 | 129 | 172 | 182 | ok |
| v1: pit stops in a season | 20 | 0 | 118 | 172 | 213 | ok |
| v1: events in a time window | 20 | 0 | 147 | 213 | 248 | ok |
| v1: driver standings | 20 | 0 | 70 | 130 | 159 | ok |
| v1: team standings | 20 | 0 | 75 | 112 | 122 | ok |
| v1: drivers | 20 | 0 | 49 | 100 | 121 | ok |
| v1: events page 2 (cursor) | 20 | 0 | 90 | 137 | 138 | ok |
| v1: stat with source events | 20 | 0 | 135 | 213 | 234 | ok |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 139 ms, 1,355,997 bytes.
