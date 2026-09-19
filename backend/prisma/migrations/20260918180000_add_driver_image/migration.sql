-- CreateTable
CREATE TABLE "driver_image" (
    "driver_id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_image_pkey" PRIMARY KEY ("driver_id")
);

-- AddForeignKey
ALTER TABLE "driver_image" ADD CONSTRAINT "driver_image_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver"("driver_id") ON DELETE CASCADE ON UPDATE CASCADE;
