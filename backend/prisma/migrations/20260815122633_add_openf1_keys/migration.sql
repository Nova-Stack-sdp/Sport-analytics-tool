/*
  Warnings:

  - A unique constraint covering the columns `[openf1_key]` on the table `circuit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[driver_number]` on the table `driver` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[openf1_key]` on the table `meeting` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[openf1_key]` on the table `session` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "circuit" ADD COLUMN     "openf1_key" INTEGER;

-- AlterTable
ALTER TABLE "meeting" ADD COLUMN     "openf1_key" INTEGER;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "openf1_key" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "circuit_openf1_key_key" ON "circuit"("openf1_key");

-- CreateIndex
CREATE UNIQUE INDEX "driver_driver_number_key" ON "driver"("driver_number");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_openf1_key_key" ON "meeting"("openf1_key");

-- CreateIndex
CREATE UNIQUE INDEX "session_openf1_key_key" ON "session"("openf1_key");
