-- CreateEnum
CREATE TYPE "ChatRoom" AS ENUM ('MAIN', 'REGULARS');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "authorLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "room" "ChatRoom" NOT NULL DEFAULT 'MAIN';

-- AlterTable
ALTER TABLE "Stamp" ADD COLUMN     "levelAssetId" TEXT;

-- CreateIndex
CREATE INDEX "Message_venueId_room_createdAt_idx" ON "Message"("venueId", "room", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stamp_levelAssetId_key" ON "Stamp"("levelAssetId");
