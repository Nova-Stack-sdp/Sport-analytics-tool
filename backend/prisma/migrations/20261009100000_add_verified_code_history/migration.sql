-- Approved code is about to be moved (not copied) into verified_code, so the
-- code_submission row will no longer exist afterwards. Keep the two pieces of
-- submission history that verified_code did not already store.

-- AlterTable
ALTER TABLE "verified_code" ADD COLUMN "submitter_email" TEXT,
ADD COLUMN "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing verified rows from their source submission. Rows whose
-- source is somehow missing keep the migration time as submitted_at.
UPDATE "verified_code" AS v
SET "submitter_email" = cs."submitter_email",
    "submitted_at"    = cs."submitted_at"
FROM "code_submission" AS cs
WHERE cs."code_submission_id" = v."source_submission_id";
