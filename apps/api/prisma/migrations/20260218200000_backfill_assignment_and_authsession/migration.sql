ALTER TABLE "TeamMember"
ADD COLUMN IF NOT EXISTS "passwordHash" TEXT NOT NULL DEFAULT '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

CREATE TABLE IF NOT EXISTS "TicketAssignment" (
  "ticketId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketAssignment_pkey" PRIMARY KEY ("ticketId", "memberId")
);

CREATE TABLE IF NOT EXISTS "ProjectAssignment" (
  "projectId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAssignment_pkey" PRIMARY KEY ("projectId", "memberId")
);

CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Ticket'
      AND column_name = 'assigneeId'
  ) THEN
    INSERT INTO "TicketAssignment" ("ticketId", "memberId", "assignedAt")
    SELECT t."id", t."assigneeId", CURRENT_TIMESTAMP
    FROM "Ticket" t
    WHERE t."assigneeId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "TicketAssignment" ta
        WHERE ta."ticketId" = t."id"
          AND ta."memberId" = t."assigneeId"
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TicketAssignment_ticketId_fkey'
  ) THEN
    ALTER TABLE "TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TicketAssignment_memberId_fkey'
  ) THEN
    ALTER TABLE "TicketAssignment"
    ADD CONSTRAINT "TicketAssignment_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAssignment_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectAssignment"
    ADD CONSTRAINT "ProjectAssignment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectAssignment_memberId_fkey'
  ) THEN
    ALTER TABLE "ProjectAssignment"
    ADD CONSTRAINT "ProjectAssignment_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuthSession_memberId_fkey'
  ) THEN
    ALTER TABLE "AuthSession"
    ADD CONSTRAINT "AuthSession_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
