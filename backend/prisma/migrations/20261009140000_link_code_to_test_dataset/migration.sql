-- A developer can attach test data (a dataset submission with purpose
-- code_test) to a code submission, so the admin can try the code on it.
-- The link is copied to verified_code when the code is approved.
-- ON DELETE SET NULL: datasets are only ever soft-deleted, but if one is
-- ever removed for real the code must not go with it.

-- AlterTable
ALTER TABLE "code_submission" ADD COLUMN "test_dataset_id" TEXT;

-- AlterTable
ALTER TABLE "verified_code" ADD COLUMN "test_dataset_id" TEXT;

-- CreateIndex
CREATE INDEX "code_submission_test_dataset_id_idx" ON "code_submission"("test_dataset_id");

-- CreateIndex
CREATE INDEX "verified_code_test_dataset_id_idx" ON "verified_code"("test_dataset_id");

-- AddForeignKey
ALTER TABLE "code_submission" ADD CONSTRAINT "code_submission_test_dataset_id_fkey" FOREIGN KEY ("test_dataset_id") REFERENCES "submission"("submission_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_code" ADD CONSTRAINT "verified_code_test_dataset_id_fkey" FOREIGN KEY ("test_dataset_id") REFERENCES "submission"("submission_id") ON DELETE SET NULL ON UPDATE CASCADE;
