-- AlterTable
ALTER TABLE "TicketAssignment"
ADD COLUMN "seenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TicketAssignment_memberId_seenAt_idx" ON "TicketAssignment"("memberId", "seenAt");
