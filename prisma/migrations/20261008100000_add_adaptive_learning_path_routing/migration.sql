-- Adaptive Learning Path P1 routing foundation.
-- Additive only: existing P0 enrollments, progress and curriculum rows remain
-- unchanged. This file is a protected-release artifact and is not applied by
-- the implementation task.

DO $$
BEGIN
  CREATE TYPE "StudentLearningPathRouteStatus" AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'PAUSED',
    'REASSIGNED',
    'REVIEW_REQUIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "StudentLearningPath"
  ADD COLUMN IF NOT EXISTS "routeStatus" "StudentLearningPathRouteStatus",
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recommendedPathId" TEXT,
  ADD COLUMN IF NOT EXISTS "measurementResultId" TEXT,
  ADD COLUMN IF NOT EXISTS "selectionPolicyVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "selectionReason" JSONB,
  ADD COLUMN IF NOT EXISTS "overrideByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_recommendedPathId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_recommendedPathId_fkey"
      FOREIGN KEY ("recommendedPathId") REFERENCES "LearningPath"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_measurementResultId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_measurementResultId_fkey"
      FOREIGN KEY ("measurementResultId") REFERENCES "AssessmentResult"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentLearningPath_overrideByUserId_fkey'
  ) THEN
    ALTER TABLE "StudentLearningPath"
      ADD CONSTRAINT "StudentLearningPath_overrideByUserId_fkey"
      FOREIGN KEY ("overrideByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StudentLearningPath_tenantId_studentId_routeStatus_idx"
  ON "StudentLearningPath"("tenantId", "studentId", "routeStatus");
CREATE INDEX IF NOT EXISTS "StudentLearningPath_recommendedPathId_idx"
  ON "StudentLearningPath"("recommendedPathId");

-- P0 keeps its independent enrollments. Only one adaptive P1 route may be
-- active for a student in a tenant at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "StudentLearningPath_one_active_route_idx"
  ON "StudentLearningPath"("tenantId", "studentId")
  WHERE "routeStatus" = 'ACTIVE';
