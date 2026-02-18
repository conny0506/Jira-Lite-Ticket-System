-- AlterTable
ALTER TABLE "TeamMember"
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TeamMember_passwordResetTokenHash_idx" ON "TeamMember"("passwordResetTokenHash");
