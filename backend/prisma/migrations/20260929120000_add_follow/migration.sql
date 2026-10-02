-- CreateTable
CREATE TABLE "follow" (
    "follow_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "team_id" TEXT,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("follow_id"),
    CONSTRAINT "follow_one_target" CHECK (("driver_id" IS NULL) <> ("team_id" IS NULL))
);

-- CreateIndex
CREATE INDEX "follow_user_id_idx" ON "follow"("user_id");
CREATE UNIQUE INDEX "follow_user_id_driver_id_key" ON "follow"("user_id", "driver_id");
CREATE UNIQUE INDEX "follow_user_id_team_id_key" ON "follow"("user_id", "team_id");

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow" ADD CONSTRAINT "follow_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("team_id") ON DELETE CASCADE ON UPDATE CASCADE;
