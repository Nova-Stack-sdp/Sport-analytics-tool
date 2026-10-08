-- CreateTable
CREATE TABLE "pending_signup" (
    "signup_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_signup_pkey" PRIMARY KEY ("signup_id")
);

-- CreateIndex
CREATE INDEX "pending_signup_email_created_at_idx" ON "pending_signup"("email", "created_at");
