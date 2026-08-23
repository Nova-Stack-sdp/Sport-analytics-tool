-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('FP1', 'FP2', 'FP3', 'Q', 'Sprint', 'Race');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('scheduled', 'live', 'finished');

-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('openf1_sync', 'manual_upload');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'accepted', 'rejected', 'partially_accepted');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('lap_completed', 'pit_stop', 'tyre_stint', 'position_change', 'flag_event', 'race_control_message', 'weather_snapshot', 'session_status_change', 'classification');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('driver', 'team');

-- CreateTable
CREATE TABLE "circuit" (
    "circuit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "circuit_pkey" PRIMARY KEY ("circuit_id")
);

-- CreateTable
CREATE TABLE "meeting" (
    "meeting_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "circuit_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,

    CONSTRAINT "meeting_pkey" PRIMARY KEY ("meeting_id")
);

-- CreateTable
CREATE TABLE "session" (
    "session_id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "team" (
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" INTEGER NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("team_id")
);

-- CreateTable
CREATE TABLE "driver" (
    "driver_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driver_number" INTEGER NOT NULL,

    CONSTRAINT "driver_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "entry" (
    "entry_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "submission" (
    "submission_id" TEXT NOT NULL,
    "source" "SubmissionSource" NOT NULL,
    "submitter_id" TEXT,
    "session_id" TEXT NOT NULL,
    "file_ref" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "validation_errors" JSONB,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "submission_pkey" PRIMARY KEY ("submission_id")
);

-- CreateTable
CREATE TABLE "event" (
    "event_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "event_type" "EventType" NOT NULL,
    "lap_number" INTEGER,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "source_submission_id" TEXT NOT NULL,
    "superseded_by" TEXT,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "driver_session_stats" (
    "entry_id" TEXT NOT NULL,
    "fastest_lap_ms" INTEGER,
    "avg_lap_ms" DOUBLE PRECISION,
    "total_pit_time_ms" INTEGER,
    "positions_gained" INTEGER,
    "final_position" INTEGER,
    "points" DOUBLE PRECISION,

    CONSTRAINT "driver_session_stats_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "driver_career_stats" (
    "driver_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "podiums" INTEGER NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dnf_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "driver_career_stats_pkey" PRIMARY KEY ("driver_id","season")
);

-- CreateTable
CREATE TABLE "team_season_stats" (
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "reliability_rate" DOUBLE PRECISION,

    CONSTRAINT "team_season_stats_pkey" PRIMARY KEY ("team_id","season")
);

-- CreateTable
CREATE TABLE "head_to_head" (
    "id" TEXT NOT NULL,
    "subject_a_id" TEXT NOT NULL,
    "subject_b_id" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "wins_a" INTEGER NOT NULL DEFAULT 0,
    "wins_b" INTEGER NOT NULL DEFAULT 0,
    "sample_size" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "head_to_head_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_season_idx" ON "meeting"("season");

-- CreateIndex
CREATE INDEX "meeting_circuit_id_idx" ON "meeting"("circuit_id");

-- CreateIndex
CREATE INDEX "session_meeting_id_idx" ON "session"("meeting_id");

-- CreateIndex
CREATE INDEX "session_type_idx" ON "session"("type");

-- CreateIndex
CREATE UNIQUE INDEX "team_name_season_key" ON "team"("name", "season");

-- CreateIndex
CREATE INDEX "entry_team_id_idx" ON "entry"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_session_id_driver_id_key" ON "entry"("session_id", "driver_id");

-- CreateIndex
CREATE INDEX "submission_session_id_idx" ON "submission"("session_id");

-- CreateIndex
CREATE INDEX "submission_status_idx" ON "submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "event_superseded_by_key" ON "event"("superseded_by");

-- CreateIndex
CREATE INDEX "event_session_id_event_type_idx" ON "event"("session_id", "event_type");

-- CreateIndex
CREATE INDEX "event_entry_id_idx" ON "event"("entry_id");

-- CreateIndex
CREATE INDEX "event_source_submission_id_idx" ON "event"("source_submission_id");

-- CreateIndex
CREATE INDEX "event_session_id_lap_number_idx" ON "event"("session_id", "lap_number");

-- CreateIndex
CREATE UNIQUE INDEX "head_to_head_subject_a_id_subject_b_id_subject_type_key" ON "head_to_head"("subject_a_id", "subject_b_id", "subject_type");

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuit"("circuit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("meeting_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("team_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entry"("entry_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_source_submission_id_fkey" FOREIGN KEY ("source_submission_id") REFERENCES "submission"("submission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "event"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_session_stats" ADD CONSTRAINT "driver_session_stats_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entry"("entry_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_career_stats" ADD CONSTRAINT "driver_career_stats_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_season_stats" ADD CONSTRAINT "team_season_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("team_id") ON DELETE RESTRICT ON UPDATE CASCADE;
