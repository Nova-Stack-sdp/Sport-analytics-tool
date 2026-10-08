-- Stores each dataset upload exactly as received, so admins can download the
-- original file. One row per submission; removed with its submission.

-- CreateTable
CREATE TABLE "submission_upload" (
    "submission_id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_upload_pkey" PRIMARY KEY ("submission_id")
);

-- AddForeignKey
ALTER TABLE "submission_upload" ADD CONSTRAINT "submission_upload_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("submission_id") ON DELETE CASCADE ON UPDATE CASCADE;
