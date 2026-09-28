-- Education V2 P0 compatibility migration.
--
-- The previous learning-path migrations already own LearningPath,
-- LearningUnit, LearningStep and StudentLearningStepProgress. This migration
-- evolves those tables in place and deliberately keeps their legacy columns,
-- relations and tenant scope. It must never recreate or drop them.

ALTER TYPE "LearningStepType" ADD VALUE IF NOT EXISTS 'MEASUREMENT';
ALTER TYPE "LearningStepType" ADD VALUE IF NOT EXISTS 'NEXT_LEARNING';
ALTER TYPE "LearningStepProgressStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';

ALTER TABLE "LearningPath"
  ADD COLUMN IF NOT EXISTS "levelId" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "LearningPath_code_version_key"
  ON "LearningPath"("code", "version");
CREATE INDEX IF NOT EXISTS "LearningPath_levelId_status_idx"
  ON "LearningPath"("levelId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LearningPath_levelId_fkey'
  ) THEN
    ALTER TABLE "LearningPath"
      ADD CONSTRAINT "LearningPath_levelId_fkey"
      FOREIGN KEY ("levelId") REFERENCES "Level"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "LearningStep"
  ADD COLUMN IF NOT EXISTS "skillId" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Preserve the legacy single prerequisite in the additive P0 completion rule
-- without overwriting any existing rule authored by the curriculum system.
UPDATE "LearningStep"
SET "completionRule" = jsonb_set(
  COALESCE("completionRule"::jsonb, '{}'::jsonb),
  '{prerequisiteStepIds}',
  to_jsonb(ARRAY["prerequisiteStepId"]::text[]),
  true
)
WHERE "prerequisiteStepId" IS NOT NULL
  AND NOT (COALESCE("completionRule"::jsonb, '{}'::jsonb) ? 'prerequisiteStepIds');

CREATE INDEX IF NOT EXISTS "LearningStep_skillId_idx"
  ON "LearningStep"("skillId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LearningStep_skillId_fkey'
  ) THEN
    ALTER TABLE "LearningStep"
      ADD CONSTRAINT "LearningStep_skillId_fkey"
      FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StudentLearningStepProgress"
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "accuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "evidence" JSONB;

CREATE TABLE IF NOT EXISTS "StudentLearningPath" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "learningPathId" TEXT NOT NULL,
  "currentStepId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentLearningPath_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentLearningPath_tenantId_studentId_learningPathId_key"
  ON "StudentLearningPath"("tenantId", "studentId", "learningPathId");
CREATE INDEX IF NOT EXISTS "StudentLearningPath_studentId_tenantId_updatedAt_idx"
  ON "StudentLearningPath"("studentId", "tenantId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_tenantId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_studentId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_learningPathId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_learningPathId_fkey"
      FOREIGN KEY ("learningPathId") REFERENCES "LearningPath"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_currentStepId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_currentStepId_fkey"
      FOREIGN KEY ("currentStepId") REFERENCES "LearningStep"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ExerciseSession"
  ADD COLUMN IF NOT EXISTS "learningStepId" TEXT;
CREATE INDEX IF NOT EXISTS "ExerciseSession_learningStepId_idx"
  ON "ExerciseSession"("learningStepId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ExerciseSession_learningStepId_fkey'
  ) THEN
    ALTER TABLE "ExerciseSession"
      ADD CONSTRAINT "ExerciseSession_learningStepId_fkey"
      FOREIGN KEY ("learningStepId") REFERENCES "LearningStep"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "StudentLearningPath" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentLearningPath" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename = 'StudentLearningPath'
      AND policyname = 'student_learning_path_isolation'
  ) THEN
    CREATE POLICY "student_learning_path_isolation"
      ON "StudentLearningPath" FOR ALL
      USING (
        current_setting('app.platform_role', true) <> ''
        OR (
          "studentId" = current_setting('app.user_id', true)
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        current_setting('app.platform_role', true) <> ''
        OR (
          "studentId" = current_setting('app.user_id', true)
          AND "tenantId" = current_setting('app.tenant_id', true)
        )
      );
  END IF;
END $$;
