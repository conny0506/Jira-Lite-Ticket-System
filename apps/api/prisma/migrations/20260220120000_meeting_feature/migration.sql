CREATE TABLE "Meeting" (
  "id" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "meetingUrl" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "reminderSentAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Meeting_scheduledAt_canceledAt_idx" ON "Meeting"("scheduledAt", "canceledAt");
CREATE INDEX "Meeting_reminderSentAt_idx" ON "Meeting"("reminderSentAt");

ALTER TABLE "Meeting"
ADD CONSTRAINT "Meeting_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
