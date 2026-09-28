# Load test

Generated 2026-09-28T11:02:04.601Z against `http://localhost:8099` — 10 concurrent clients, 10 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors** (judged on server time). Result: **PASS** — overall p95 438 ms total / 434 ms server, 180 requests in 4.2 s (42.7 req/s), 0 errors.

"Total" is what this client measured; "server" is the API's own time from its Server-Timing header (database + building the response). The difference is the network between this client and the API.

| Endpoint | Requests | Errors | total p50 | total p95 | total max | server p50 | server p95 | |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| site: overview | 10 | 0 | 374 | 394 | 394 | 369 | 390 | ok |
| site: fixtures list | 10 | 0 | 273 | 327 | 327 | 266 | 323 | ok |
| site: fixture events | 10 | 0 | 185 | 212 | 212 | 182 | 210 | ok |
| site: season statistics | 10 | 0 | 248 | 279 | 279 | 246 | 278 | ok |
| site: career statistics | 10 | 0 | 319 | 353 | 353 | 318 | 352 | ok |
| v1: fixtures by season | 10 | 0 | 207 | 281 | 281 | 205 | 280 | ok |
| v1: one fixture | 10 | 0 | 209 | 254 | 254 | 208 | 242 | ok |
| v1: fixture statistics | 10 | 0 | 365 | 446 | 446 | 364 | 434 | ok |
| v1: events of a fixture (500) | 10 | 0 | 182 | 320 | 320 | 177 | 307 | ok |
| v1: laps of a fixture | 10 | 0 | 123 | 322 | 322 | 121 | 305 | ok |
| v1: pit stops in a season | 10 | 0 | 153 | 181 | 181 | 152 | 179 | ok |
| v1: events in a time window | 10 | 0 | 138 | 166 | 166 | 135 | 162 | ok |
| v1: driver standings | 10 | 0 | 114 | 137 | 137 | 112 | 135 | ok |
| v1: team standings | 10 | 0 | 106 | 140 | 140 | 91 | 139 | ok |
| v1: drivers | 10 | 0 | 99 | 148 | 148 | 90 | 144 | ok |
| site: race replay state | 10 | 0 | 6 | 14 | 14 | 1 | 2 | ok |
| v1: events page 2 (cursor) | 10 | 0 | 430 | 496 | 496 | 425 | 491 | ok |
| v1: stat with source events | 10 | 0 | 429 | 480 | 480 | 428 | 474 | ok |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 518 ms, 1,355,997 bytes.
