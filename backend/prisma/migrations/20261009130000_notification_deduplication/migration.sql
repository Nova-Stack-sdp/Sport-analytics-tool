BEGIN;

ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "event_key" TEXT;
LOCK TABLE "notification" IN SHARE ROW EXCLUSIVE MODE;

-- Keep the oldest exact copy, retaining read status if any duplicate was read.
WITH duplicates AS (
  SELECT "user_id", "message", bool_or("is_read") AS was_read
  FROM "notification" GROUP BY "user_id", "message" HAVING count(*) > 1
)
UPDATE "notification" n SET "is_read" = d.was_read FROM duplicates d
WHERE n."user_id" = d."user_id" AND n."message" = d."message";

WITH ranked AS (
  SELECT "notification_id", row_number() OVER (
    PARTITION BY "user_id", "message" ORDER BY "created_at", "notification_id"
  ) AS ordinal FROM "notification"
)
DELETE FROM "notification" n USING ranked r
WHERE n."notification_id" = r."notification_id" AND r.ordinal > 1;

-- This constraint was in schema.prisma but absent from earlier migrations.
CREATE UNIQUE INDEX IF NOT EXISTS "notification_user_id_message_key"
  ON "notification"("user_id", "message");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_user_id_event_key_key"
  ON "notification"("user_id", "event_key");

COMMIT;
