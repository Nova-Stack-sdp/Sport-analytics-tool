-- Approved code is moved into verified_code and its code_submission row is
-- deleted. The ON DELETE RESTRICT foreign key added in
-- 20261007190000_add_verified_code would block that delete, so it is dropped.
-- source_submission_id stays (with its unique index) as a plain reference to
-- the submission the code came from.

-- DropForeignKey
ALTER TABLE "verified_code" DROP CONSTRAINT "verified_code_source_submission_id_fkey";
