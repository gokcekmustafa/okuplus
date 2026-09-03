-- 8G-10 pilot readiness: additive, tenant-scoped telemetry and reports.
-- No existing table or published record is changed or deleted.

-- CreateEnum
CREATE TYPE "PilotEventType" AS ENUM ('SIGNUP_COMPLETED', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED', 'LEARNING_PATH_OPENED', 'TODAY_OPENED', 'EXERCISE_STARTED', 'QUESTION_VIEWED', 'QUESTION_ATTEMPTED', 'QUESTION_ANSWERED', 'EXERCISE_COMPLETED', 'EXERCISE_ABANDONED', 'EXERCISE_RESUMED', 'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED', 'REVIEW_STARTED', 'REVIEW_COMPLETED', 'TECHNICAL_ERROR');

-- CreateEnum
CREATE TYPE "PilotFeedbackCategory" AS ENUM ('CONTENT_CLARITY', 'QUESTION_CLARITY', 'DIFFICULTY', 'GENERAL_SATISFACTION');

-- CreateEnum
CREATE TYPE "PilotBugCategory" AS ENUM ('BUG', 'CONTENT_ISSUE', 'WRONG_ANSWER', 'UNCLEAR_QUESTION', 'TECHNICAL_ERROR');

-- CreateEnum
CREATE TYPE "PilotReportStatus" AS ENUM ('OPEN', 'TRIAGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "PilotEvent" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" "PilotEventType" NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "sessionId" TEXT,
    "questionVersionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotFeedback" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "clientFeedbackId" TEXT NOT NULL,
    "category" "PilotFeedbackCategory" NOT NULL,
    "rating" INTEGER,
    "message" TEXT,
    "sessionId" TEXT,
    "questionVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotBugReport" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "clientBugId" TEXT NOT NULL,
    "category" "PilotBugCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PilotReportStatus" NOT NULL DEFAULT 'OPEN',
    "sessionId" TEXT,
    "questionVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotBugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilotEvent_tenantId_eventType_occurredAt_idx" ON "PilotEvent"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "PilotEvent_studentId_occurredAt_idx" ON "PilotEvent"("studentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotEvent_tenantId_studentId_clientEventId_key" ON "PilotEvent"("tenantId", "studentId", "clientEventId");

-- CreateIndex
CREATE INDEX "PilotFeedback_tenantId_category_createdAt_idx" ON "PilotFeedback"("tenantId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_studentId_createdAt_idx" ON "PilotFeedback"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotFeedback_tenantId_studentId_clientFeedbackId_key" ON "PilotFeedback"("tenantId", "studentId", "clientFeedbackId");

-- CreateIndex
CREATE INDEX "PilotBugReport_tenantId_status_createdAt_idx" ON "PilotBugReport"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PilotBugReport_studentId_createdAt_idx" ON "PilotBugReport"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PilotBugReport_tenantId_studentId_clientBugId_key" ON "PilotBugReport"("tenantId", "studentId", "clientBugId");

-- AddForeignKey
ALTER TABLE "PilotEvent" ADD CONSTRAINT "PilotEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotEvent" ADD CONSTRAINT "PilotEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotFeedback" ADD CONSTRAINT "PilotFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotBugReport" ADD CONSTRAINT "PilotBugReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotBugReport" ADD CONSTRAINT "PilotBugReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
