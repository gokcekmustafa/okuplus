-- Release 0.6 learning experience foundation.
-- Additive only: no existing content, question, attempt, or user rows are
-- changed. New student records are written through product services.

ALTER TABLE "Attempt"
  ADD COLUMN "exposureStartedAt" TIMESTAMP(3),
  ADD COLUMN "answerStartedAt" TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "interactionDurationMs" INTEGER,
  ADD COLUMN "answerDurationMs" INTEGER,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hintUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstAttemptCorrect" BOOLEAN,
  ADD COLUMN "finalResult" BOOLEAN;

CREATE TABLE "StudentBaseline" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sourceAssessmentResultId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentBaseline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentLessonProgress" (
  "id" TEXT NOT NULL DEFAULT uuidv7(),
  "tenantId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "contentVersionId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentBaseline_tenantId_studentId_key"
  ON "StudentBaseline"("tenantId", "studentId");
CREATE INDEX "StudentBaseline_studentId_tenantId_capturedAt_idx"
  ON "StudentBaseline"("studentId", "tenantId", "capturedAt");
CREATE UNIQUE INDEX "StudentLessonProgress_tenantId_studentId_contentVersionId_key"
  ON "StudentLessonProgress"("tenantId", "studentId", "contentVersionId");
CREATE INDEX "StudentLessonProgress_studentId_tenantId_completedAt_idx"
  ON "StudentLessonProgress"("studentId", "tenantId", "completedAt");

ALTER TABLE "StudentBaseline"
  ADD CONSTRAINT "StudentBaseline_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentBaseline_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentBaseline_sourceAssessmentResultId_fkey"
  FOREIGN KEY ("sourceAssessmentResultId") REFERENCES "AssessmentResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentLessonProgress"
  ADD CONSTRAINT "StudentLessonProgress_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentLessonProgress_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StudentLessonProgress_contentVersionId_fkey"
  FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentBaseline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentBaseline" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_baseline_isolation" ON "StudentBaseline"
  FOR ALL
  USING ("studentId" = current_setting('app.user_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("studentId" = current_setting('app.user_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentLessonProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentLessonProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_lesson_progress_isolation" ON "StudentLessonProgress"
  FOR ALL
  USING ("studentId" = current_setting('app.user_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("studentId" = current_setting('app.user_id', true)
    AND "tenantId" = current_setting('app.tenant_id', true));
