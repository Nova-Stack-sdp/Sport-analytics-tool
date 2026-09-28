-- Event log reads are ordered by (occurred_at, event_id) — the v1 API's
-- stable cursor order. Without these, a time-window query and the Overview
-- "events in the last 24 hours" count scan the whole table, and paging a
-- fixture's events sorts every event of that fixture on every page.
-- See docs/PERFORMANCE.md for the before/after plans.

-- CreateIndex
CREATE INDEX "event_occurred_at_event_id_idx" ON "event"("occurred_at", "event_id");

-- CreateIndex
CREATE INDEX "event_session_id_occurred_at_event_id_idx" ON "event"("session_id", "occurred_at", "event_id");
