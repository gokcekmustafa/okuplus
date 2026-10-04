-- Assignment foundation: pin exercise versions and introduce the student
-- assignment lifecycle. This migration is additive and is intentionally not
-- applied to production by this change.

CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'SYSTEM');
CREATE TYPE "StudentAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED');

ALTER TABLE "Assignment"
  ADD COLUMN "templateVersionId" TEXT;

-- Pin legacy assignments when a published version exists. Rows without a
-- published version remain nullable for compatibility and are handled by the
-- legacy fallback in the service until they can be reviewed safely.
UPDATE "Assignment" AS a
SET "templateVersionId" = latest."id"
FROM (
  SELECT DISTINCT ON ("templateId") "templateId", "id"
  FROM "ExerciseTemplateVersion"
  WHERE "status" = 'PUBLISHED'
  ORDER BY "templateId", "version" DESC
) AS latest
WHERE a."templateVersionId" IS NULL
  AND a."templateId" = latest."templateId";

CREATE TABLE "StudentAssignment" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',
  "status" "StudentAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentAssignment_assignmentId_studentId_key"
  ON "StudentAssignment"("assignmentId", "studentId");
CREATE INDEX "Assignment_templateVersionId_idx"
  ON "Assignment"("templateVersionId");
CREATE INDEX "StudentAssignment_tenantId_studentId_status_idx"
  ON "StudentAssignment"("tenantId", "studentId", "status");
CREATE INDEX "StudentAssignment_assignmentId_status_idx"
  ON "StudentAssignment"("assignmentId", "status");

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentAssignment"
  ADD CONSTRAINT "StudentAssignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentAssignment_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentAssignment_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentAssignment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
