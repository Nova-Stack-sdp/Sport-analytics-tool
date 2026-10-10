-- CreateEnum
CREATE TYPE "VideoRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "video_request" (
    "video_request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_email" TEXT,
    "race_name" TEXT NOT NULL,
    "video_url" TEXT,
    "youtube_id" TEXT,
    "hosted_description" TEXT,
    "notes" TEXT,
    "status" "VideoRequestStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_request_pkey" PRIMARY KEY ("video_request_id")
);

-- CreateIndex
CREATE INDEX "video_request_user_id_created_at_idx" ON "video_request"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "video_request_status_created_at_idx" ON "video_request"("status", "created_at");
