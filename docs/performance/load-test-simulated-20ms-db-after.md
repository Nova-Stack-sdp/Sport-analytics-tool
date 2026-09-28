# Load test

Generated 2026-09-28T01:31:11.300Z against `http://localhost:8099` — 10 concurrent clients, 15 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **PASS** — overall p95 274 ms, 270 requests in 4.2 s (65.0 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 15 | 0 | 218 | 274 | 274 | ok |
| site: fixtures list | 15 | 0 | 163 | 262 | 262 | ok |
| site: fixture events | 15 | 0 | 170 | 196 | 196 | ok |
| site: season statistics | 15 | 0 | 232 | 327 | 327 | ok |
| site: career statistics | 15 | 0 | 244 | 359 | 359 | ok |
| site: race replay state | 15 | 0 | 5 | 14 | 14 | ok |
| v1: fixtures by season | 15 | 0 | 115 | 247 | 247 | ok |
| v1: one fixture | 15 | 0 | 116 | 163 | 163 | ok |
| v1: fixture statistics | 15 | 0 | 145 | 185 | 185 | ok |
| v1: events of a fixture (500) | 15 | 0 | 121 | 175 | 175 | ok |
| v1: laps of a fixture | 15 | 0 | 112 | 185 | 185 | ok |
| v1: pit stops in a season | 15 | 0 | 194 | 234 | 234 | ok |
| v1: events in a time window | 15 | 0 | 168 | 250 | 250 | ok |
| v1: driver standings | 15 | 0 | 85 | 104 | 104 | ok |
| v1: team standings | 15 | 0 | 88 | 135 | 135 | ok |
| v1: drivers | 15 | 0 | 44 | 71 | 71 | ok |
| v1: events page 2 (cursor) | 15 | 0 | 152 | 217 | 217 | ok |
| v1: stat with source events | 15 | 0 | 246 | 362 | 362 | ok |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 218 ms, 1,355,997 bytes.
