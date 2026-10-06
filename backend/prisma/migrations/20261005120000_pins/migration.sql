-- CreateEnum
CREATE TYPE "PinTier" AS ENUM ('NEARBY', 'CITY', 'COUNTRY', 'WORLD');

-- CreateEnum
CREATE TYPE "PinStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PinRail" AS ENUM ('APPLE', 'GOOGLE', 'SOLANA_USDC');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "pinId" TEXT,
ADD COLUMN     "pinMessageId" TEXT;

-- AlterTable
ALTER TABLE "Violation" ADD COLUMN     "pinId" TEXT;

-- CreateTable
CREATE TABLE "Pin" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier" "PinTier" NOT NULL,
    "status" "PinStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "rail" "PinRail",
    "productId" TEXT NOT NULL,
    "buyerLat" DOUBLE PRECISION NOT NULL,
    "buyerLng" DOUBLE PRECISION NOT NULL,
    "messageHash" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinPurchase" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "platform" "PinRail" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT,
    "productId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PinPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinMessage" (
    "id" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT,
    "status" "MessageStatus" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "moderationReason" TEXT,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinBan" (
    "pinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinBan_pkey" PRIMARY KEY ("pinId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pin_signature_key" ON "Pin"("signature");

-- CreateIndex
CREATE INDEX "Pin_status_lat_lng_idx" ON "Pin"("status", "lat", "lng");

-- CreateIndex
CREATE INDEX "Pin_status_expiresAt_idx" ON "Pin"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Pin_ownerId_createdAt_idx" ON "Pin"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PinPurchase_pinId_key" ON "PinPurchase"("pinId");

-- CreateIndex
CREATE UNIQUE INDEX "PinPurchase_platform_transactionId_key" ON "PinPurchase"("platform", "transactionId");

-- CreateIndex
CREATE INDEX "PinMessage_pinId_createdAt_idx" ON "PinMessage"("pinId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PinMessage_authorId_clientKey_key" ON "PinMessage"("authorId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_pinId_key" ON "Report"("reporterId", "pinId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_pinMessageId_key" ON "Report"("reporterId", "pinMessageId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "Pin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_pinMessageId_fkey" FOREIGN KEY ("pinMessageId") REFERENCES "PinMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinPurchase" ADD CONSTRAINT "PinPurchase_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "Pin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinMessage" ADD CONSTRAINT "PinMessage_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "Pin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinMessage" ADD CONSTRAINT "PinMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinBan" ADD CONSTRAINT "PinBan_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "Pin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinBan" ADD CONSTRAINT "PinBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A report still targets exactly one thing, now including pins and pin messages.
ALTER TABLE "Report" DROP CONSTRAINT "Report_one_target";
ALTER TABLE "Report" ADD CONSTRAINT "Report_one_target" CHECK (
  (("messageId" IS NOT NULL)::int + ("listingId" IS NOT NULL)::int + ("pinId" IS NOT NULL)::int + ("pinMessageId" IS NOT NULL)::int) = 1
);
