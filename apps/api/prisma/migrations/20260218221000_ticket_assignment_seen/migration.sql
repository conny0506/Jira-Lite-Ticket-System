DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'TicketAssignment'
  ) THEN
    ALTER TABLE "TicketAssignment"
    ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TicketAssignment_memberId_seenAt_idx"
ON "TicketAssignment"("memberId", "seenAt");
