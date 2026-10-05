-- Smart assignment recommendations.
-- Additive and non-destructive. Production application is delegated to the
-- protected migration workflow; this change performs no database write.

ALTER TABLE "Assignment"
  ALTER COLUMN "classId" DROP NOT NULL,
  ALTER COLUMN "teacherId" DROP NOT NULL;

CREATE TYPE "AssignmentRecommendationStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DISMISSED',
  'EXPIRED'
);

CREATE TABLE "AssignmentRecommendation" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "learningStepId" TEXT,
  "status" "AssignmentRecommendationStatus" NOT NULL DEFAULT 'PENDING',
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "acceptedById" TEXT,
  "assignmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentAutomationSetting" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT,
  "classId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "maxActiveAssignments" INTEGER NOT NULL DEFAULT 1,
  "cooldownHours" INTEGER NOT NULL DEFAULT 168,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssignmentAutomationSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssignmentAutomationSetting_target_check" CHECK (
    (CASE WHEN "studentId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "classId" IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT "AssignmentAutomationSetting_limits_check" CHECK (
    "maxActiveAssignments" BETWEEN 1 AND 3 AND "cooldownHours" BETWEEN 1 AND 720
  )
);

CREATE UNIQUE INDEX "AssignmentRecommendation_tenantId_studentId_skillId_templateVersionId_key"
  ON "AssignmentRecommendation"("tenantId", "studentId", "skillId", "templateVersionId");
CREATE UNIQUE INDEX "AssignmentRecommendation_assignmentId_key"
  ON "AssignmentRecommendation"("assignmentId");
CREATE INDEX "AssignmentRecommendation_tenantId_studentId_status_idx"
  ON "AssignmentRecommendation"("tenantId", "studentId", "status");
CREATE INDEX "AssignmentRecommendation_tenantId_skillId_status_idx"
  ON "AssignmentRecommendation"("tenantId", "skillId", "status");
CREATE INDEX "AssignmentRecommendation_templateId_status_idx"
  ON "AssignmentRecommendation"("templateId", "status");
CREATE INDEX "AssignmentRecommendation_templateVersionId_status_idx"
  ON "AssignmentRecommendation"("templateVersionId", "status");
CREATE UNIQUE INDEX "AssignmentAutomationSetting_tenantId_studentId_key"
  ON "AssignmentAutomationSetting"("tenantId", "studentId");
CREATE UNIQUE INDEX "AssignmentAutomationSetting_tenantId_classId_key"
  ON "AssignmentAutomationSetting"("tenantId", "classId");
CREATE INDEX "AssignmentAutomationSetting_tenantId_enabled_idx"
  ON "AssignmentAutomationSetting"("tenantId", "enabled");

ALTER TABLE "AssignmentRecommendation"
  ADD CONSTRAINT "AssignmentRecommendation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ExerciseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_templateVersionId_fkey"
    FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_learningStepId_fkey"
    FOREIGN KEY ("learningStepId") REFERENCES "LearningStep"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_acceptedById_fkey"
    FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentRecommendation_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentAutomationSetting"
  ADD CONSTRAINT "AssignmentAutomationSetting_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentAutomationSetting_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssignmentAutomationSetting_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssignmentRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssignmentRecommendation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AssignmentRecommendation"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "AssignmentAutomationSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssignmentAutomationSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AssignmentAutomationSetting"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
