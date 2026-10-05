-- Independent gamification foundation.
-- Additive only: no existing rows are rewritten and no production data is
-- seeded by this migration. Production application is delegated to the
-- protected migration workflow.

ALTER TYPE "PointEventType" ADD VALUE IF NOT EXISTS 'ASSIGNMENT_COMPLETED';
ALTER TYPE "PointEventType" ADD VALUE IF NOT EXISTS 'TRAINING_COMPLETED';
ALTER TYPE "PointEventType" ADD VALUE IF NOT EXISTS 'LEARNING_ACTIVITY_COMPLETED';

ALTER TABLE "PointEvent"
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "gamificationEventId" TEXT;

CREATE TYPE "GamificationEventType" AS ENUM (
  'ASSIGNMENT_COMPLETED',
  'TRAINING_COMPLETED',
  'LEARNING_ACTIVITY_COMPLETED'
);

CREATE TABLE "GamificationEvent" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "eventType" "GamificationEventType" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GamificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AchievementDefinition" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentAchievement" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "achievementDefinitionId" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentAchievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamificationStreakDay" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "activityDate" DATE NOT NULL,
  "timezone" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GamificationStreakDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamificationStreakState" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "currentDays" INTEGER NOT NULL DEFAULT 0,
  "longestDays" INTEGER NOT NULL DEFAULT 0,
  "lastActivityDate" DATE,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GamificationStreakState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GamificationEvent_tenantId_idempotencyKey_key"
  ON "GamificationEvent"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "GamificationEvent_source_key"
  ON "GamificationEvent"("tenantId", "studentId", "eventType", "sourceType", "sourceReference");
CREATE INDEX "GamificationEvent_tenantId_studentId_eventType_occurredAt_idx"
  ON "GamificationEvent"("tenantId", "studentId", "eventType", "occurredAt");
CREATE INDEX "GamificationEvent_tenantId_studentId_sourceType_sourceReference_idx"
  ON "GamificationEvent"("tenantId", "studentId", "sourceType", "sourceReference");

CREATE UNIQUE INDEX "AchievementDefinition_code_key"
  ON "AchievementDefinition"("code");

CREATE UNIQUE INDEX "StudentAchievement_tenant_student_definition_key"
  ON "StudentAchievement"("tenantId", "studentId", "achievementDefinitionId");
CREATE INDEX "StudentAchievement_tenantId_studentId_awardedAt_idx"
  ON "StudentAchievement"("tenantId", "studentId", "awardedAt");

CREATE UNIQUE INDEX "GamificationStreakDay_tenant_student_date_key"
  ON "GamificationStreakDay"("tenantId", "studentId", "activityDate");
CREATE INDEX "GamificationStreakDay_tenantId_studentId_activityDate_idx"
  ON "GamificationStreakDay"("tenantId", "studentId", "activityDate");

CREATE UNIQUE INDEX "GamificationStreakState_tenant_student_key"
  ON "GamificationStreakState"("tenantId", "studentId");
CREATE INDEX "GamificationStreakState_tenantId_lastActivityDate_idx"
  ON "GamificationStreakState"("tenantId", "lastActivityDate");
CREATE INDEX "PointEvent_gamificationEventId_idx"
  ON "PointEvent"("gamificationEventId");

ALTER TABLE "GamificationEvent"
  ADD CONSTRAINT "GamificationEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GamificationEvent_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AchievementDefinition"
  ADD CONSTRAINT "AchievementDefinition_code_nonempty_check"
    CHECK (length(trim("code")) > 0),
  ADD CONSTRAINT "AchievementDefinition_name_nonempty_check"
    CHECK (length(trim("name")) > 0);

ALTER TABLE "StudentAchievement"
  ADD CONSTRAINT "StudentAchievement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentAchievement_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentAchievement_achievementDefinitionId_fkey"
    FOREIGN KEY ("achievementDefinitionId") REFERENCES "AchievementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentAchievement_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "GamificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GamificationStreakDay"
  ADD CONSTRAINT "GamificationStreakDay_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GamificationStreakDay_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GamificationStreakDay_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "GamificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GamificationStreakState"
  ADD CONSTRAINT "GamificationStreakState_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GamificationStreakState_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointEvent"
  ADD CONSTRAINT "PointEvent_gamificationEventId_fkey"
    FOREIGN KEY ("gamificationEventId") REFERENCES "GamificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GamificationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamificationEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "GamificationEvent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "GamificationEvent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "StudentAchievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentAchievement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "StudentAchievement"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "StudentAchievement"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "GamificationStreakDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamificationStreakDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "GamificationStreakDay"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "GamificationStreakDay"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER TABLE "GamificationStreakState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamificationStreakState" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "GamificationStreakState"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "GamificationStreakState"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_update" ON "GamificationStreakState"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
