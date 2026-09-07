-- Training Engine V1: persist one daily composition and its ordered items.
-- This artifact is intentionally not applied in this task.

CREATE TYPE "TrainingSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

CREATE TYPE "TrainingSessionItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "composition" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "totalItems" INTEGER NOT NULL,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "totalGP" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingSessionItem" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "trainingSessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "family" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "exerciseSessionId" TEXT,
    "status" "TrainingSessionItemStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSessionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingSession_tenantId_studentId_sessionDate_key"
  ON "TrainingSession"("tenantId", "studentId", "sessionDate");

CREATE INDEX "TrainingSession_studentId_sessionDate_idx"
  ON "TrainingSession"("studentId", "sessionDate");

CREATE INDEX "TrainingSession_studentId_tenantId_status_idx"
  ON "TrainingSession"("studentId", "tenantId", "status");

CREATE INDEX "TrainingSession_tenantId_status_idx"
  ON "TrainingSession"("tenantId", "status");

CREATE UNIQUE INDEX "TrainingSessionItem_trainingSessionId_position_key"
  ON "TrainingSessionItem"("trainingSessionId", "position");

CREATE UNIQUE INDEX "TrainingSessionItem_exerciseSessionId_key"
  ON "TrainingSessionItem"("exerciseSessionId");

CREATE INDEX "TrainingSessionItem_trainingSessionId_status_idx"
  ON "TrainingSessionItem"("trainingSessionId", "status");

CREATE INDEX "TrainingSessionItem_templateVersionId_idx"
  ON "TrainingSessionItem"("templateVersionId");

ALTER TABLE "TrainingSession"
  ADD CONSTRAINT "TrainingSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingSession"
  ADD CONSTRAINT "TrainingSession_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingSessionItem"
  ADD CONSTRAINT "TrainingSessionItem_trainingSessionId_fkey"
  FOREIGN KEY ("trainingSessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingSessionItem"
  ADD CONSTRAINT "TrainingSessionItem_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "ExerciseTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TrainingSessionItem"
  ADD CONSTRAINT "TrainingSessionItem_exerciseSessionId_fkey"
  FOREIGN KEY ("exerciseSessionId") REFERENCES "ExerciseSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant isolation follows the repository's existing RLS contract.
-- No DELETE policies are created: daily training history is append-only.
ALTER TABLE "TrainingSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingSession" FORCE ROW LEVEL SECURITY;

CREATE POLICY "training_session_read" ON "TrainingSession"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "training_session_insert" ON "TrainingSession"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "training_session_update" ON "TrainingSession"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "TrainingSessionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingSessionItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY "training_session_item_read" ON "TrainingSessionItem"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "TrainingSession" parent
      WHERE parent."id" = "TrainingSessionItem"."trainingSessionId"
        AND parent."tenantId" = current_setting('app.tenant_id', true)
    )
  );

CREATE POLICY "training_session_item_insert" ON "TrainingSessionItem"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "TrainingSession" parent
      WHERE parent."id" = "TrainingSessionItem"."trainingSessionId"
        AND parent."tenantId" = current_setting('app.tenant_id', true)
    )
  );

CREATE POLICY "training_session_item_update" ON "TrainingSessionItem"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "TrainingSession" parent
      WHERE parent."id" = "TrainingSessionItem"."trainingSessionId"
        AND parent."tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "TrainingSession" parent
      WHERE parent."id" = "TrainingSessionItem"."trainingSessionId"
        AND parent."tenantId" = current_setting('app.tenant_id', true)
    )
  );
