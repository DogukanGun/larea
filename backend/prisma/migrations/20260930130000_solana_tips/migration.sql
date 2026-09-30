-- CreateEnum
CREATE TYPE "TipToken" AS ENUM ('USDC', 'SKR');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'TIP';

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromWallet" TEXT NOT NULL,
    "toWallet" TEXT NOT NULL,
    "token" "TipToken" NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "messageHash" TEXT NOT NULL,
    "signature" TEXT,
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tip_signature_key" ON "Tip"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_messageId_key" ON "Tip"("messageId");

-- CreateIndex
CREATE INDEX "Tip_status_createdAt_idx" ON "Tip"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Tip_fromUserId_createdAt_idx" ON "Tip"("fromUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

