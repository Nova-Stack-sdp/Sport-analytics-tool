-- CreateTable
CREATE TABLE "external_api_cache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_api_cache_pkey" PRIMARY KEY ("key")
);