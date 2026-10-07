-- CreateEnum
CREATE TYPE "CodeSubmissionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "code_submission" (
    "code_submission_id" TEXT NOT NULL,
    "submitter_id" TEXT NOT NULL,
    "submitter_email" TEXT,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CodeSubmissionStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "code_submission_pkey" PRIMARY KEY ("code_submission_id")
);

-- CreateIndex
CREATE INDEX "code_submission_status_submitted_at_idx" ON "code_submission"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "code_submission_submitter_id_idx" ON "code_submission"("submitter_id");
