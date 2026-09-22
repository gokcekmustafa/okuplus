-- Guest Diagnostic V1 persistence foundation.
-- Additive only. This migration is intentionally prepared but must not be
-- applied to staging or production as part of this sprint.

CREATE TYPE "GuestDiagnosticSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED');

CREATE TYPE "GuestDiagnosticResultState" AS ENUM (
    'INSUFFICIENT_DATA',
    'PARTIAL_LOW_SIGNAL',
    'BALANCED_PERFORMANCE',
    'DISTINCT_SKILL_SIGNAL',
    'RECOMMENDATION_UNAVAILABLE',
    'RECOMMENDATION_AVAILABLE'
);

CREATE TYPE "GuestDiagnosticConfidenceState" AS ENUM (
    'INSUFFICIENT_DATA',
    'LOW_SIGNAL',
    'USABLE_SIGNAL',
    'BOUNDARY_SENSITIVE',
    'NOT_AVAILABLE'
);

CREATE TYPE "GuestDiagnosticRecommendationMode" AS ENUM ('RECOMMENDATION_ONLY');

CREATE TABLE "GuestDiagnosticRecommendationConfig" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "configKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "scoringContractVersion" INTEGER NOT NULL,
    "minimumAnsweredCount" INTEGER NOT NULL,
    "minimumScorableCount" INTEGER NOT NULL,
    "recommendationThresholds" JSONB NOT NULL,
    "skillSignalThresholds" JSONB NOT NULL,
    "boundaryHandling" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestDiagnosticRecommendationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDiagnosticSession" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "status" "GuestDiagnosticSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "definitionVersion" INTEGER NOT NULL,
    "scoringContractVersion" INTEGER NOT NULL,
    "recommendationConfigId" TEXT NOT NULL,
    "sourceTemplateVersionId" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "minimumScorableCount" INTEGER NOT NULL,
    "minimumAnsweredCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestDiagnosticSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDiagnosticItem" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "skillCode" TEXT NOT NULL,
    "difficulty" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestDiagnosticItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDiagnosticAnswer" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "clientAnswerId" TEXT NOT NULL,
    "answerFingerprint" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "responseOrder" INTEGER NOT NULL,
    "timeSpentMs" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestDiagnosticAnswer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDiagnosticResult" (
    "id" TEXT NOT NULL DEFAULT uuidv7(),
    "sessionId" TEXT NOT NULL,
    "scoringContractVersion" INTEGER NOT NULL,
    "recommendationConfigId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "answeredCount" INTEGER NOT NULL,
    "scoredQuestionCount" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "skillSubscores" JSONB NOT NULL,
    "resultState" "GuestDiagnosticResultState" NOT NULL,
    "confidenceState" "GuestDiagnosticConfidenceState" NOT NULL,
    "recommendationMode" "GuestDiagnosticRecommendationMode" NOT NULL DEFAULT 'RECOMMENDATION_ONLY',
    "recommendedLevelCode" TEXT,
    "recommendedLevelName" TEXT,
    "recommendationCopyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestDiagnosticResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestDiagnosticRecommendationConfig_configKey_version_key"
    ON "GuestDiagnosticRecommendationConfig" ("configKey", "version");
CREATE INDEX "GuestDiagnosticRecommendationConfig_configKey_status_enable_idx"
    ON "GuestDiagnosticRecommendationConfig" ("configKey", "status", "enabled");
CREATE INDEX "GuestDiagnosticRecommendationConfig_status_publishedAt_idx"
    ON "GuestDiagnosticRecommendationConfig" ("status", "publishedAt");
CREATE UNIQUE INDEX "GuestDiagnosticRecommendationConfig_active_key"
    ON "GuestDiagnosticRecommendationConfig" ("configKey")
    WHERE "status" = 'PUBLISHED' AND "enabled" = true;

CREATE UNIQUE INDEX "GuestDiagnosticSession_tokenHash_key"
    ON "GuestDiagnosticSession" ("tokenHash");
CREATE INDEX "GuestDiagnosticSession_status_expiresAt_idx"
    ON "GuestDiagnosticSession" ("status", "expiresAt");
CREATE INDEX "GuestDiagnosticSession_recommendationConfigId_status_idx"
    ON "GuestDiagnosticSession" ("recommendationConfigId", "status");
CREATE INDEX "GuestDiagnosticSession_sourceTemplateVersionId_idx"
    ON "GuestDiagnosticSession" ("sourceTemplateVersionId");

CREATE UNIQUE INDEX "GuestDiagnosticItem_sessionId_position_key"
    ON "GuestDiagnosticItem" ("sessionId", "position");
CREATE UNIQUE INDEX "GuestDiagnosticItem_sessionId_questionVersionId_key"
    ON "GuestDiagnosticItem" ("sessionId", "questionVersionId");
CREATE UNIQUE INDEX "GuestDiagnosticItem_id_sessionId_key"
    ON "GuestDiagnosticItem" ("id", "sessionId");
CREATE INDEX "GuestDiagnosticItem_questionVersionId_idx"
    ON "GuestDiagnosticItem" ("questionVersionId");

CREATE UNIQUE INDEX "GuestDiagnosticAnswer_sessionId_itemId_key"
    ON "GuestDiagnosticAnswer" ("sessionId", "itemId");
CREATE UNIQUE INDEX "GuestDiagnosticAnswer_sessionId_clientAnswerId_key"
    ON "GuestDiagnosticAnswer" ("sessionId", "clientAnswerId");
CREATE INDEX "GuestDiagnosticAnswer_sessionId_answeredAt_idx"
    ON "GuestDiagnosticAnswer" ("sessionId", "answeredAt");
CREATE INDEX "GuestDiagnosticAnswer_itemId_idx"
    ON "GuestDiagnosticAnswer" ("itemId");

CREATE UNIQUE INDEX "GuestDiagnosticResult_sessionId_key"
    ON "GuestDiagnosticResult" ("sessionId");
CREATE INDEX "GuestDiagnosticResult_createdAt_idx"
    ON "GuestDiagnosticResult" ("createdAt");
CREATE INDEX "GuestDiagnosticResult_resultState_createdAt_idx"
    ON "GuestDiagnosticResult" ("resultState", "createdAt");

ALTER TABLE "GuestDiagnosticSession"
    ADD CONSTRAINT "GuestDiagnosticSession_recommendationConfigId_fkey"
    FOREIGN KEY ("recommendationConfigId")
    REFERENCES "GuestDiagnosticRecommendationConfig"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticSession"
    ADD CONSTRAINT "GuestDiagnosticSession_sourceTemplateVersionId_fkey"
    FOREIGN KEY ("sourceTemplateVersionId")
    REFERENCES "ExerciseTemplateVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticItem"
    ADD CONSTRAINT "GuestDiagnosticItem_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "GuestDiagnosticSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticItem"
    ADD CONSTRAINT "GuestDiagnosticItem_questionVersionId_fkey"
    FOREIGN KEY ("questionVersionId")
    REFERENCES "QuestionVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticAnswer"
    ADD CONSTRAINT "GuestDiagnosticAnswer_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "GuestDiagnosticSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticAnswer"
    ADD CONSTRAINT "GuestDiagnosticAnswer_itemId_sessionId_fkey"
    FOREIGN KEY ("itemId", "sessionId")
    REFERENCES "GuestDiagnosticItem"("id", "sessionId")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticResult"
    ADD CONSTRAINT "GuestDiagnosticResult_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "GuestDiagnosticSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestDiagnosticResult"
    ADD CONSTRAINT "GuestDiagnosticResult_recommendationConfigId_fkey"
    FOREIGN KEY ("recommendationConfigId")
    REFERENCES "GuestDiagnosticRecommendationConfig"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recommendation configuration is globally readable only when it is both
-- published and explicitly enabled. No guest-session or platform-role
-- bypass is provided by these policies.
ALTER TABLE "GuestDiagnosticRecommendationConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestDiagnosticRecommendationConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_diagnostic_recommendation_config_select"
    ON "GuestDiagnosticRecommendationConfig"
    FOR SELECT
    USING ("status" = 'PUBLISHED' AND "enabled" = true);

-- Guest rows are isolated by a server-validated transaction-local context.
-- app.guest_operation is intentionally required for writes; an unset or
-- client-controlled context must not create a write path.
ALTER TABLE "GuestDiagnosticSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestDiagnosticSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_diagnostic_session_select"
    ON "GuestDiagnosticSession"
    FOR SELECT
    USING ("id" = NULLIF(current_setting('app.guest_session_id', true), ''));
CREATE POLICY "guest_diagnostic_session_insert"
    ON "GuestDiagnosticSession"
    FOR INSERT
    WITH CHECK (
        "id" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) = 'CREATE'
    );
CREATE POLICY "guest_diagnostic_session_update"
    ON "GuestDiagnosticSession"
    FOR UPDATE
    USING (
        "id" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) IN ('ANSWER', 'COMPLETE', 'EXPIRE')
    )
    WITH CHECK ("id" = NULLIF(current_setting('app.guest_session_id', true), ''));

ALTER TABLE "GuestDiagnosticItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestDiagnosticItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_diagnostic_item_select"
    ON "GuestDiagnosticItem"
    FOR SELECT
    USING ("sessionId" = NULLIF(current_setting('app.guest_session_id', true), ''));
CREATE POLICY "guest_diagnostic_item_insert"
    ON "GuestDiagnosticItem"
    FOR INSERT
    WITH CHECK (
        "sessionId" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) = 'CREATE'
    );

ALTER TABLE "GuestDiagnosticAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestDiagnosticAnswer" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_diagnostic_answer_select"
    ON "GuestDiagnosticAnswer"
    FOR SELECT
    USING ("sessionId" = NULLIF(current_setting('app.guest_session_id', true), ''));
CREATE POLICY "guest_diagnostic_answer_insert"
    ON "GuestDiagnosticAnswer"
    FOR INSERT
    WITH CHECK (
        "sessionId" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) = 'ANSWER'
    );

ALTER TABLE "GuestDiagnosticResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuestDiagnosticResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_diagnostic_result_select"
    ON "GuestDiagnosticResult"
    FOR SELECT
    USING ("sessionId" = NULLIF(current_setting('app.guest_session_id', true), ''));
CREATE POLICY "guest_diagnostic_result_insert"
    ON "GuestDiagnosticResult"
    FOR INSERT
    WITH CHECK (
        "sessionId" = NULLIF(current_setting('app.guest_session_id', true), '')
        AND current_setting('app.guest_operation', true) = 'COMPLETE'
    );
