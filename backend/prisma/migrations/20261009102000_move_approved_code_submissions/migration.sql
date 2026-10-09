-- Data migration: finish moving code that was approved while approval still
-- copied it. After this, code_submission only holds pending and rejected
-- code, and every approved script lives once, in verified_code.

-- 1. An approved row should always have a verified copy (the old review
--    transaction created both together). If one is missing, create it from
--    the submission, keeping the original reviewer and review time. Rows
--    with no recorded reviewer are NOT given an invented one: they are left
--    in place and reported by the notice at the end for manual review.
INSERT INTO "verified_code" (
    "verified_code_id", "source_submission_id", "title", "language", "code",
    "description", "tags", "submitter_id", "submitter_email", "submitted_at",
    "verified_by", "verified_at"
)
SELECT
    gen_random_uuid()::text, cs."code_submission_id", cs."title", cs."language", cs."code",
    cs."description", cs."tags", cs."submitter_id", cs."submitter_email", cs."submitted_at",
    cs."reviewed_by", COALESCE(cs."reviewed_at", cs."submitted_at")
FROM "code_submission" AS cs
WHERE cs."status" = 'approved'
  AND cs."reviewed_by" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "verified_code" AS v
      WHERE v."source_submission_id" = cs."code_submission_id"
  );

-- 2. Delete approved submissions whose code is now in verified_code.
DELETE FROM "code_submission" AS cs
WHERE cs."status" = 'approved'
  AND EXISTS (
      SELECT 1 FROM "verified_code" AS v
      WHERE v."source_submission_id" = cs."code_submission_id"
  );

-- 3. Report anything left behind (approved but no reviewer recorded).
DO $$
DECLARE leftover integer;
BEGIN
    SELECT count(*) INTO leftover FROM "code_submission" WHERE "status" = 'approved';
    IF leftover > 0 THEN
        RAISE NOTICE '% approved code_submission row(s) have no reviewer and were not moved; review them manually.', leftover;
    END IF;
END $$;
