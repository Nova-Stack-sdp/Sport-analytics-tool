-- Synthetic data for load testing — NEVER run this against Neon.
--
-- Fills an EMPTY, migrated database with three seasons of made-up but
-- realistically sized data: 3 × 24 meetings, each with a qualifying and a
-- race session (plus 6 sprints a season), 20 drivers in 10 teams, and
-- ~270,000 events (laps, position changes, pit stops, stints, weather,
-- race control, grid and classification), plus the derived stats tables.
--
-- Usage (local Postgres):
--   createdb f1perf
--   for f in prisma/migrations/2*/migration.sql; do psql -d f1perf -f "$f"; done
--   psql -d f1perf -f scripts/perf/seed-synthetic.sql
--
-- Refuses to run unless the database name contains "perf".

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() !~ 'perf' THEN
    RAISE EXCEPTION 'Refusing to seed synthetic data into "%": use a database whose name contains "perf".', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM event) THEN
    RAISE EXCEPTION 'Database already has events; seed an empty database.';
  END IF;
END $$;

BEGIN;

INSERT INTO circuit (circuit_id, openf1_key, name, country, location)
SELECT gen_random_uuid(), 900 + c, 'Circuit ' || c, 'Country ' || c, 'City ' || c
FROM generate_series(1, 24) c;

INSERT INTO meeting (meeting_id, openf1_key, season, name, circuit_id, start_date)
SELECT gen_random_uuid(), s * 100 + c, s, 'Synthetic Grand Prix ' || c,
       (SELECT circuit_id FROM circuit WHERE openf1_key = 900 + c),
       make_date(s, 3, 1) + (c * 10)
FROM generate_series(2023, 2025) s, generate_series(1, 24) c;

-- Q and Race for every meeting; Sprint for every fourth.
INSERT INTO session (session_id, openf1_key, meeting_id, type, start_time, end_time, status)
SELECT gen_random_uuid(), m.openf1_key * 10 + k.n, m.meeting_id, k.t::"SessionType",
       m.start_date + k.day_offset + time '14:00', m.start_date + k.day_offset + time '15:45', 'finished'
FROM meeting m
CROSS JOIN (VALUES (1, 'Q', 1), (2, 'Race', 2), (3, 'Sprint', 1)) AS k(n, t, day_offset)
WHERE k.t <> 'Sprint' OR (m.openf1_key % 100) % 4 = 0;

INSERT INTO team (team_id, name, season)
SELECT gen_random_uuid(), 'Team ' || t, s FROM generate_series(2023, 2025) s, generate_series(1, 10) t;

INSERT INTO driver (driver_id, name, driver_number)
SELECT gen_random_uuid(), 'Driver ' || d, d FROM generate_series(1, 20) d;

INSERT INTO entry (entry_id, session_id, driver_id, team_id)
SELECT gen_random_uuid(), se.session_id, dr.driver_id, tm.team_id
FROM session se
JOIN meeting m ON m.meeting_id = se.meeting_id
CROSS JOIN driver dr
JOIN team tm ON tm.season = m.season AND tm.name = 'Team ' || ((dr.driver_number + 1) / 2);

INSERT INTO submission (submission_id, source, session_id, status, submitted_at)
SELECT gen_random_uuid(), 'openf1_sync', session_id, 'accepted', start_time FROM session;

-- Per-session shape: laps and the length of the session.
CREATE TEMP TABLE shape AS
SELECT se.session_id, se.type, se.start_time, sub.submission_id,
       CASE se.type WHEN 'Race' THEN 57 WHEN 'Sprint' THEN 19 ELSE 15 END AS laps
FROM session se JOIN submission sub ON sub.session_id = se.session_id;

-- Car position within a session: a stable order with a small per-session shuffle.
CREATE TEMP TABLE grid AS
SELECT e.entry_id, e.session_id, dr.driver_number,
       row_number() OVER (PARTITION BY e.session_id ORDER BY (dr.driver_number * 7 + hashtext(e.session_id)) % 20, dr.driver_number) AS pos
FROM entry e JOIN driver dr ON dr.driver_id = e.driver_id;

-- lap_completed
INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'lap_completed', l,
       s.start_time + make_interval(secs => l * 92 + g.pos),
       jsonb_build_object('lap_time_ms', 90000 + g.pos * 150 + (l % 7) * 40, 'is_pit_out_lap', l = 20,
                          'position', NULL, 'sector_1_ms', 30000, 'sector_2_ms', 30000, 'sector_3_ms', 30000 + g.pos * 150),
       s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id, generate_series(1, s.laps) l;

-- position_change: race and sprint only, a couple per car per lap
INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'position_change', l,
       s.start_time + make_interval(secs => l * 92 + k * 40 + g.pos),
       jsonb_build_object('from_position', g.pos, 'to_position', g.pos, 'cause', 'on_track'),
       s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id, generate_series(1, s.laps) l, generate_series(0, 1) k
WHERE s.type IN ('Race', 'Sprint');

-- pit_stop + tyre_stint (race only)
INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'pit_stop', 20,
       s.start_time + make_interval(secs => 20 * 92 + g.pos),
       jsonb_build_object('pit_duration_ms', 22000 + g.pos * 50), s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id WHERE s.type = 'Race';

INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'tyre_stint', st * 20 + 1, s.start_time,
       jsonb_build_object('stint_number', st + 1, 'compound', (ARRAY['SOFT','MEDIUM','HARD'])[st + 1], 'lap_start', st * 20 + 1),
       s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id, generate_series(0, 2) st WHERE s.type = 'Race';

-- weather and race control: session-wide
INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, NULL, 'weather_snapshot', NULL,
       s.start_time + make_interval(mins => w),
       jsonb_build_object('air_temp_c', 24, 'track_temp_c', 38, 'humidity', 50, 'rainfall', false), s.submission_id
FROM shape s, generate_series(0, 105) w;

INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, NULL, 'race_control_message', r,
       s.start_time + make_interval(secs => r * 92 + 5),
       jsonb_build_object('message', 'Synthetic message ' || r), s.submission_id
FROM shape s, generate_series(1, s.laps) r;

-- grid and classification
INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'grid_position', NULL, s.start_time,
       jsonb_build_object('position', g.pos), s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id WHERE s.type IN ('Race', 'Sprint');

INSERT INTO event (event_id, session_id, entry_id, event_type, lap_number, occurred_at, payload, source_submission_id)
SELECT gen_random_uuid(), s.session_id, g.entry_id, 'classification', NULL,
       s.start_time + interval '105 minutes',
       jsonb_build_object('final_position', g.pos, 'status', 'finished',
         'points', CASE WHEN s.type = 'Race' THEN COALESCE((ARRAY[25,18,15,12,10,8,6,4,2,1])[g.pos], 0)
                        WHEN s.type = 'Sprint' THEN GREATEST(9 - g.pos, 0) ELSE 0 END),
       s.submission_id
FROM shape s JOIN grid g ON g.session_id = s.session_id;

-- Derived tables (what derivation would have written).
INSERT INTO driver_session_stats (entry_id, fastest_lap_ms, avg_lap_ms, total_pit_time_ms, positions_gained, final_position, points)
SELECT g.entry_id, 90000 + g.pos * 150, 90120 + g.pos * 150, 22000 + g.pos * 50, 0, g.pos,
       (e.payload->>'points')::float
FROM grid g JOIN event e ON e.entry_id = g.entry_id AND e.event_type = 'classification';

INSERT INTO driver_career_stats (driver_id, season, wins, podiums, points, dnf_count)
SELECT en.driver_id, m.season,
       count(*) FILTER (WHERE ds.final_position = 1 AND se.type = 'Race'),
       count(*) FILTER (WHERE ds.final_position <= 3 AND se.type = 'Race'),
       sum(ds.points), 0
FROM entry en JOIN session se ON se.session_id = en.session_id JOIN meeting m ON m.meeting_id = se.meeting_id
JOIN driver_session_stats ds ON ds.entry_id = en.entry_id
WHERE se.type IN ('Race', 'Sprint')
GROUP BY en.driver_id, m.season;

INSERT INTO team_season_stats (team_id, season, points, wins, reliability_rate)
SELECT en.team_id, m.season, sum(ds.points), count(*) FILTER (WHERE ds.final_position = 1 AND se.type = 'Race'), 1
FROM entry en JOIN session se ON se.session_id = en.session_id JOIN meeting m ON m.meeting_id = se.meeting_id
JOIN driver_session_stats ds ON ds.entry_id = en.entry_id
WHERE se.type IN ('Race', 'Sprint')
GROUP BY en.team_id, m.season;

COMMIT;
ANALYZE;

SELECT (SELECT count(*) FROM session) AS sessions, (SELECT count(*) FROM entry) AS entries, (SELECT count(*) FROM event) AS events;
