-- Only PASSED / FAILED remain; earlier pending attempts are closed as FAILED.
UPDATE "VerificationSession" SET "status" = 'FAILED' WHERE "status" NOT IN ('PASSED', 'FAILED');
-- AlterEnum
BEGIN;
CREATE TYPE "VerificationStatus_new" AS ENUM ('PASSED', 'FAILED');
ALTER TABLE "public"."VerificationSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "VerificationSession" ALTER COLUMN "status" TYPE "VerificationStatus_new" USING ("status"::text::"VerificationStatus_new");
ALTER TYPE "VerificationStatus" RENAME TO "VerificationStatus_old";
ALTER TYPE "VerificationStatus_new" RENAME TO "VerificationStatus";
DROP TYPE "public"."VerificationStatus_old";
COMMIT;

-- DropIndex
DROP INDEX "VerificationSession_provider_providerRef_key";

-- AlterTable
ALTER TABLE "VerificationSession" DROP COLUMN "attempt",
DROP COLUMN "launchUrl",
ALTER COLUMN "status" DROP DEFAULT;

