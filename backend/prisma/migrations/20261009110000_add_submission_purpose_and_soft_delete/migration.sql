-- Dataset submissions get a purpose (race data for the platform, or test
-- data for a developer's code) and a soft delete (deleted_at/deleted_by).
-- Every existing submission is race data and not deleted, which is what the
-- defaults give it, so no backfill is needed.

-- CreateEnum
CREATE TYPE "SubmissionPurpose" AS ENUM ('race_data', 'code_test');

-- AlterTable
ALTER TABLE "submission" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by" TEXT,
ADD COLUMN "purpose" "SubmissionPurpose" NOT NULL DEFAULT 'race_data';

-- CreateIndex
CREATE INDEX "submission_purpose_deleted_at_submitted_at_idx" ON "submission"("purpose", "deleted_at", "submitted_at");
