-- CreateEnum
CREATE TYPE "StampStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "Stamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "visit" INTEGER NOT NULL,
    "status" "StampStatus" NOT NULL DEFAULT 'PENDING',
    "messageHash" TEXT NOT NULL,
    "signature" TEXT,
    "assetId" TEXT,
    "leafIndex" INTEGER,
    "levelMinted" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Stamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stamp_signature_key" ON "Stamp"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Stamp_assetId_key" ON "Stamp"("assetId");

-- CreateIndex
CREATE INDEX "Stamp_userId_venueId_status_idx" ON "Stamp"("userId", "venueId", "status");

-- CreateIndex
CREATE INDEX "Stamp_status_createdAt_idx" ON "Stamp"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One confirmed stamp per user, place and day (pending and failed attempts may repeat).
CREATE UNIQUE INDEX "Stamp_one_confirmed_per_day" ON "Stamp"("userId", "venueId", "day") WHERE "status" = 'CONFIRMED';
