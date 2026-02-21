CREATE TYPE "Department" AS ENUM ('SOFTWARE', 'INDUSTRIAL', 'MECHANICAL', 'ELECTRICAL_ELECTRONICS');

ALTER TABLE "TeamMember"
ADD COLUMN "isIntern" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TeamMemberDepartment" (
  "memberId" TEXT NOT NULL,
  "department" "Department" NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMemberDepartment_pkey" PRIMARY KEY ("memberId", "department")
);

CREATE INDEX "TeamMemberDepartment_department_idx" ON "TeamMemberDepartment"("department");

ALTER TABLE "TeamMemberDepartment"
ADD CONSTRAINT "TeamMemberDepartment_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
