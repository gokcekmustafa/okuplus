-- Release 0.7 P0 learning path domain.
-- Additive only: existing content, sessions, attempts and progress are preserved.

CREATE TYPE "LearningAreaCode" AS ENUM ('FAST_READING', 'READING_COMPREHENSION');
CREATE TYPE "LearningPathStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "LearningStepType" AS ENUM ('TEACHING', 'SMALL_STUDY', 'PRACTICE', 'REINFORCEMENT', 'ASSESSMENT');
CREATE TYPE "LearningStepSource" AS ENUM ('SYSTEM_DRIVEN', 'TEACHER_ASSIGNED');
CREATE TYPE "LearningStepProgressStatus" AS ENUM ('LOCKED', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "LearningPath" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "area" "LearningAreaCode" NOT NULL,
  "status" "LearningPathStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "LearningPath_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningUnit" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT,
  "pathId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "LearningPathStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningStep" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT,
  "unitId" TEXT NOT NULL,
  "stableKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "type" "LearningStepType" NOT NULL,
  "source" "LearningStepSource" NOT NULL DEFAULT 'SYSTEM_DRIVEN',
  "status" "LearningPathStatus" NOT NULL DEFAULT 'DRAFT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "prerequisiteStepId" TEXT,
  "minimumLevelId" TEXT,
  "maximumLevelId" TEXT,
  "contentVersionId" TEXT,
  "exerciseTemplateVersionId" TEXT,
  "assessmentId" TEXT,
  "completionRule" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentLearningStepProgress" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "learningStepId" TEXT NOT NULL,
  "status" "LearningStepProgressStatus" NOT NULL DEFAULT 'LOCKED',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentLearningStepProgress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Assignment" ADD COLUMN "learningStepId" TEXT;

CREATE UNIQUE INDEX "LearningUnit_pathId_position_key"
  ON "LearningUnit"("pathId", "position");
CREATE UNIQUE INDEX "LearningUnit_pathId_code_key"
  ON "LearningUnit"("pathId", "code");
CREATE UNIQUE INDEX "LearningStep_unitId_stableKey_key"
  ON "LearningStep"("unitId", "stableKey");
CREATE UNIQUE INDEX "LearningStep_unitId_position_key"
  ON "LearningStep"("unitId", "position");
CREATE UNIQUE INDEX "StudentLearningStepProgress_tenantId_studentId_learningStepId_key"
  ON "StudentLearningStepProgress"("tenantId", "studentId", "learningStepId");

CREATE INDEX "LearningPath_tenantId_status_idx" ON "LearningPath"("tenantId", "status");
CREATE INDEX "LearningPath_area_status_idx" ON "LearningPath"("area", "status");
CREATE INDEX "LearningUnit_tenantId_status_idx" ON "LearningUnit"("tenantId", "status");
CREATE INDEX "LearningStep_tenantId_status_isActive_idx"
  ON "LearningStep"("tenantId", "status", "isActive");
CREATE INDEX "LearningStep_exerciseTemplateVersionId_idx" ON "LearningStep"("exerciseTemplateVersionId");
CREATE INDEX "LearningStep_contentVersionId_idx" ON "LearningStep"("contentVersionId");
CREATE INDEX "LearningStep_assessmentId_idx" ON "LearningStep"("assessmentId");
CREATE INDEX "LearningStep_prerequisiteStepId_idx" ON "LearningStep"("prerequisiteStepId");
CREATE INDEX "Assignment_learningStepId_idx" ON "Assignment"("learningStepId");
CREATE INDEX "StudentLearningStepProgress_studentId_tenantId_status_idx"
  ON "StudentLearningStepProgress"("studentId", "tenantId", "status");
CREATE INDEX "StudentLearningStepProgress_learningStepId_status_idx"
  ON "StudentLearningStepProgress"("learningStepId", "status");

ALTER TABLE "LearningPath"
  ADD CONSTRAINT "LearningPath_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LearningUnit"
  ADD CONSTRAINT "LearningUnit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningUnit_pathId_fkey"
  FOREIGN KEY ("pathId") REFERENCES "LearningPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearningStep"
  ADD CONSTRAINT "LearningStep_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "LearningUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_prerequisiteStepId_fkey"
  FOREIGN KEY ("prerequisiteStepId") REFERENCES "LearningStep"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_minimumLevelId_fkey"
  FOREIGN KEY ("minimumLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_maximumLevelId_fkey"
  FOREIGN KEY ("maximumLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_contentVersionId_fkey"
  FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_exerciseTemplateVersionId_fkey"
  FOREIGN KEY ("exerciseTemplateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LearningStep_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentLearningStepProgress"
  ADD CONSTRAINT "StudentLearningStepProgress_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentLearningStepProgress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentLearningStepProgress_learningStepId_fkey"
  FOREIGN KEY ("learningStepId") REFERENCES "LearningStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_learningStepId_fkey"
  FOREIGN KEY ("learningStepId") REFERENCES "LearningStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Curriculum rows are globally readable or tenant-scoped. Only platform roles
-- can write global curriculum; tenant curriculum remains tenant-scoped.
ALTER TABLE "LearningPath" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningPath" FORCE ROW LEVEL SECURITY;
CREATE POLICY "learning_path_read" ON "LearningPath" FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_path_insert" ON "LearningPath" FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_path_update" ON "LearningPath" FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_path_delete" ON "LearningPath" FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "LearningUnit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningUnit" FORCE ROW LEVEL SECURITY;
CREATE POLICY "learning_unit_read" ON "LearningUnit" FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_unit_insert" ON "LearningUnit" FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_unit_update" ON "LearningUnit" FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_unit_delete" ON "LearningUnit" FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "LearningStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LearningStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY "learning_step_read" ON "LearningStep" FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_step_insert" ON "LearningStep" FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_step_update" ON "LearningStep" FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "learning_step_delete" ON "LearningStep" FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "StudentLearningStepProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentLearningStepProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_learning_step_progress_isolation"
  ON "StudentLearningStepProgress" FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
