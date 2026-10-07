-- Approved copies are separate from incoming submissions and their review status.
CREATE TABLE "verified_code" (
    "verified_code_id" TEXT NOT NULL,
    "source_submission_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitter_id" TEXT NOT NULL,
    "verified_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_code_pkey" PRIMARY KEY ("verified_code_id")
);

CREATE UNIQUE INDEX "verified_code_source_submission_id_key" ON "verified_code"("source_submission_id");
CREATE INDEX "verified_code_submitter_id_verified_at_idx" ON "verified_code"("submitter_id", "verified_at");
CREATE INDEX "code_submission_status_reviewed_at_idx" ON "code_submission"("status", "reviewed_at");

-- Even if a review status is incorrect, deleting the source must not remove
-- verified code or leave its history pointing to a nonexistent submission.
ALTER TABLE "verified_code" ADD CONSTRAINT "verified_code_source_submission_id_fkey"
    FOREIGN KEY ("source_submission_id") REFERENCES "code_submission"("code_submission_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
