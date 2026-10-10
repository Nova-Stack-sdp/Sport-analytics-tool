-- Approved code gets a stable, readable public address:
--   GET /api/v1/code/<slug>   e.g. "Average pit loss" -> /api/v1/code/average-pit-loss
--
-- The slug is assigned by the database when a verified_code row is inserted,
-- so every code path that approves code gets one without having to know
-- about it. It is derived from the title once and never changes.

-- 1. The column. '' means "not assigned yet"; the trigger below replaces it.
ALTER TABLE "verified_code" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- 2. Next free slug for a title: lower-case, runs of anything other than
--    a-z/0-9 become one '-', trimmed, at most 60 characters, 'code' if
--    nothing is left. Clashes get -2, -3, ...
CREATE FUNCTION "verified_code_next_slug"(title TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    n INTEGER := 1;
BEGIN
    base := left(trim(both '-' from regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g')), 60);
    base := trim(both '-' from base);
    IF base = '' THEN
        base := 'code';
    END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM "verified_code" WHERE "slug" = candidate) LOOP
        n := n + 1;
        candidate := base || '-' || n;
    END LOOP;
    RETURN candidate;
END;
$$;

-- 3. Assign on insert when no slug was given. The transaction-scoped
--    advisory lock makes concurrent approvals take turns here, so two
--    scripts with the same title approved at the same moment cannot both
--    pick the same slug.
CREATE FUNCTION "verified_code_assign_slug"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."slug" IS NULL OR NEW."slug" = '' THEN
        PERFORM pg_advisory_xact_lock(hashtext('verified_code_slug'));
        NEW."slug" := "verified_code_next_slug"(NEW."title");
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "verified_code_assign_slug"
BEFORE INSERT ON "verified_code"
FOR EACH ROW EXECUTE FUNCTION "verified_code_assign_slug"();

-- 4. Backfill code approved before this migration, oldest first, so the
--    earliest script with a given title keeps the plain slug.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT "verified_code_id", "title" FROM "verified_code" WHERE "slug" = '' ORDER BY "verified_at", "verified_code_id" LOOP
        UPDATE "verified_code" SET "slug" = "verified_code_next_slug"(r."title") WHERE "verified_code_id" = r."verified_code_id";
    END LOOP;
END $$;

-- 5. Only now that every row has one, make it unique.
CREATE UNIQUE INDEX "verified_code_slug_key" ON "verified_code"("slug");
