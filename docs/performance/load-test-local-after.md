# Load test

Generated 2026-09-28T01:31:25.117Z against `http://localhost:8099` — 10 concurrent clients, 20 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors.** Result: **PASS** — overall p95 178 ms, 360 requests in 3.5 s (102.2 req/s), 0 errors.

| Endpoint | Requests | Errors | p50 ms | p95 ms | max ms | |
|---|---:|---:|---:|---:|---:|---|
| site: overview | 20 | 0 | 114 | 183 | 195 | ok |
| site: fixtures list | 20 | 0 | 133 | 198 | 219 | ok |
| site: fixture events | 20 | 0 | 83 | 123 | 135 | ok |
| site: season statistics | 20 | 0 | 130 | 180 | 186 | ok |
| site: career statistics | 20 | 0 | 163 | 209 | 226 | ok |
| site: race replay state | 20 | 0 | 15 | 46 | 58 | ok |
| v1: fixtures by season | 20 | 0 | 73 | 115 | 126 | ok |
| v1: one fixture | 20 | 0 | 85 | 142 | 145 | ok |
| v1: fixture statistics | 20 | 0 | 99 | 176 | 182 | ok |
| v1: events of a fixture (500) | 20 | 0 | 77 | 132 | 159 | ok |
| v1: laps of a fixture | 20 | 0 | 96 | 143 | 151 | ok |
| v1: pit stops in a season | 20 | 0 | 88 | 128 | 165 | ok |
| v1: events in a time window | 20 | 0 | 96 | 144 | 150 | ok |
| v1: driver standings | 20 | 0 | 69 | 91 | 127 | ok |
| v1: team standings | 20 | 0 | 70 | 103 | 111 | ok |
| v1: drivers | 20 | 0 | 53 | 80 | 92 | ok |
| v1: events page 2 (cursor) | 20 | 0 | 106 | 161 | 162 | ok |
| v1: stat with source events | 20 | 0 | 140 | 216 | 216 | ok |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 109 ms, 1,355,997 bytes.
