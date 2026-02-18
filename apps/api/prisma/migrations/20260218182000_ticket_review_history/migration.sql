-- CreateEnum
CREATE TYPE "TicketReviewAction" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Ticket"
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "TicketReview" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" "TicketReviewAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketReview_ticketId_createdAt_idx" ON "TicketReview"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReview" ADD CONSTRAINT "TicketReview_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReview" ADD CONSTRAINT "TicketReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
