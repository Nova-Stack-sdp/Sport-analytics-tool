-- Query plans for the heaviest reads the API makes on the event log.
-- Read-only (EXPLAIN ANALYZE runs SELECTs only), safe on Neon.
--
--   psql "$DATABASE_URL" -f scripts/perf/explain-queries.sql > explain.txt
--
-- Each query is the SQL Prisma generates for the named endpoint (taken from
-- the Postgres log), with a real race fixture and season filled in.

\pset pager off
SELECT s.session_id AS fixture, m.season AS season, s.start_time AS race_start
FROM session s JOIN meeting m ON m.meeting_id = s.meeting_id
WHERE s.type = 'Race' AND EXISTS (SELECT 1 FROM event e WHERE e.session_id = s.session_id)
ORDER BY s.start_time DESC LIMIT 1 \gset
SELECT event_id AS cursor_id FROM event WHERE session_id = :'fixture' AND superseded_by IS NULL
ORDER BY occurred_at, event_id OFFSET 499 LIMIT 1 \gset

\echo '== event rows'
SELECT count(*) AS events FROM event;

\echo '== GET /api/v1/events?fixture=…&limit=500 (first page)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM event WHERE session_id = :'fixture' AND superseded_by IS NULL
ORDER BY occurred_at, event_id LIMIT 501;

\echo '== GET /api/v1/events?fixture=…&cursor=… (next page)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM event WHERE session_id = :'fixture' AND superseded_by IS NULL AND (
  (occurred_at = (SELECT occurred_at FROM event WHERE event_id = :'cursor_id') AND event_id >= :'cursor_id')
  OR occurred_at > (SELECT occurred_at FROM event WHERE event_id = :'cursor_id'))
ORDER BY occurred_at, event_id LIMIT 501;

\echo '== GET /api/v1/events?from=…&limit=100 (time window across all fixtures)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM event WHERE occurred_at >= :'race_start' AND superseded_by IS NULL
ORDER BY occurred_at, event_id LIMIT 101;

\echo '== GET /api/v1/events?season=…&type=pit_stop&limit=100'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT e.* FROM event e JOIN session s ON s.session_id = e.session_id JOIN meeting m ON m.meeting_id = s.meeting_id
WHERE m.season = :season AND e.event_type = 'pit_stop' AND e.superseded_by IS NULL
ORDER BY e.occurred_at, e.event_id LIMIT 101;

\echo '== GET /api/overview (events in the last 24 hours)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT count(*) FROM event WHERE occurred_at >= now() - interval '24 hours';

\echo '== GET /api/fixtures (which sessions have replay data)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT session_id, event_type FROM event
WHERE event_type IN ('lap_completed', 'position_change', 'classification')
GROUP BY session_id, event_type;
