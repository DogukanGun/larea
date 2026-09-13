-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "address" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'square',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'seed',
ADD COLUMN     "sourceRef" TEXT;

-- CreateIndex
CREATE INDEX "Venue_lat_lng_idx" ON "Venue"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_source_sourceRef_key" ON "Venue"("source", "sourceRef");

