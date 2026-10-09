-- CreateTable
CREATE TABLE "email_verification_code" (
    "code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_code_pkey" PRIMARY KEY ("code_id")
);

-- CreateIndex
CREATE INDEX "email_verification_code_user_id_created_at_idx" ON "email_verification_code"("user_id", "created_at");
