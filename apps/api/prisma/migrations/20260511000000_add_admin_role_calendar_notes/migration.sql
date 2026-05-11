-- Add ADMIN value to TeamRole enum
ALTER TYPE "TeamRole" ADD VALUE IF NOT EXISTS 'ADMIN';

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarNote" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalendarNote_date_idx" ON "CalendarNote"("date");

-- AddForeignKey
ALTER TABLE "CalendarNote" ADD CONSTRAINT "CalendarNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
