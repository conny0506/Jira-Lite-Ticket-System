CREATE TYPE "MeetingTargetMode" AS ENUM ('ALL', 'SELECTED');

ALTER TABLE "Meeting"
ADD COLUMN "targetMode" "MeetingTargetMode" NOT NULL DEFAULT 'ALL';

CREATE TABLE "MeetingDepartment" (
  "meetingId" TEXT NOT NULL,
  "department" "Department" NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingDepartment_pkey" PRIMARY KEY ("meetingId","department")
);

CREATE INDEX "MeetingDepartment_department_idx" ON "MeetingDepartment"("department");

ALTER TABLE "MeetingDepartment"
ADD CONSTRAINT "MeetingDepartment_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
