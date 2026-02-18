-- AlterTable
ALTER TABLE "TeamMember"
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_passwordResetTokenHash_key" ON "TeamMember"("passwordResetTokenHash");
