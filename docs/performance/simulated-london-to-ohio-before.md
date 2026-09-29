# Load test

Generated 2026-09-28T11:00:28.682Z against `http://localhost:8099` — 10 concurrent clients, 10 requests per endpoint.

**Target: p95 ≤ 500 ms for every endpoint, no errors** (judged on server time). Result: **FAIL** — overall p95 755 ms total / 749 ms server, 180 requests in 8.2 s (22.0 req/s), 0 errors.

"Total" is what this client measured; "server" is the API's own time from its Server-Timing header (database + building the response). The difference is the network between this client and the API.

| Endpoint | Requests | Errors | total p50 | total p95 | total max | server p50 | server p95 | |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| site: overview | 10 | 0 | 647 | 688 | 688 | 646 | 684 | OVER |
| site: fixtures list | 10 | 0 | 443 | 469 | 469 | 439 | 467 | ok |
| site: fixture events | 10 | 0 | 454 | 476 | 476 | 453 | 474 | ok |
| site: season statistics | 10 | 0 | 691 | 833 | 833 | 689 | 832 | OVER |
| site: career statistics | 10 | 0 | 636 | 696 | 696 | 622 | 695 | OVER |
| v1: fixtures by season | 10 | 0 | 423 | 547 | 547 | 422 | 542 | OVER |
| v1: one fixture | 10 | 0 | 357 | 429 | 429 | 350 | 428 | ok |
| v1: fixture statistics | 10 | 0 | 495 | 558 | 558 | 494 | 553 | OVER |
| v1: events of a fixture (500) | 10 | 0 | 366 | 410 | 410 | 365 | 403 | ok |
| v1: laps of a fixture | 10 | 0 | 382 | 545 | 545 | 374 | 538 | OVER |
| v1: pit stops in a season | 10 | 0 | 410 | 542 | 542 | 408 | 540 | OVER |
| v1: events in a time window | 10 | 0 | 465 | 556 | 556 | 464 | 542 | OVER |
| v1: driver standings | 10 | 0 | 250 | 275 | 275 | 249 | 264 | ok |
| v1: team standings | 10 | 0 | 256 | 333 | 333 | 255 | 332 | ok |
| v1: drivers | 10 | 0 | 107 | 174 | 174 | 104 | 172 | ok |
| site: race replay state | 10 | 0 | 3 | 10 | 10 | 1 | 2 | ok |
| v1: events page 2 (cursor) | 10 | 0 | 444 | 495 | 495 | 441 | 493 | ok |
| v1: stat with source events | 10 | 0 | 842 | 882 | 882 | 839 | 881 | OVER |

Export (single request, not part of the concurrent mix): `/api/v1/exports/events?fixture=760701f7-51c3-4799-854c-686719486e4b&format=csv` — 640 ms, 1,355,997 bytes.
