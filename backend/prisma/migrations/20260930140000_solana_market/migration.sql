-- CreateEnum
CREATE TYPE "PaymentRail" AS ENUM ('STRIPE', 'SOLANA_USDC');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "paymentRail" "PaymentRail" NOT NULL DEFAULT 'STRIPE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "payeeWallet" TEXT,
ADD COLUMN     "payerWallet" TEXT,
ADD COLUMN     "paymentRail" "PaymentRail" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "payoutSignature" TEXT,
ADD COLUMN     "refundSignature" TEXT,
ADD COLUMN     "solanaPayExpiresAt" TIMESTAMP(3),
ADD COLUMN     "solanaPayHash" TEXT,
ADD COLUMN     "solanaPaySignature" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_solanaPaySignature_key" ON "Order"("solanaPaySignature");

