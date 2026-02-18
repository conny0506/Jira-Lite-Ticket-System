-- AlterTable
ALTER TABLE "TeamMember"
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'tr',
ADD COLUMN "notificationEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificationAssignmentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notificationReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lastLoginIp" TEXT;

-- CreateTable
CREATE TABLE "LoginAudit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAudit_memberId_createdAt_idx" ON "LoginAudit"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "LoginAudit" ADD CONSTRAINT "LoginAudit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
