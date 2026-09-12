-- Content / Question Management foundation.
-- Additive schema reconciliation for lifecycle and content identity fields.

-- Keep existing enum values backward compatible while adding the explicit
-- review/approval/retirement states used by the lifecycle policy.
ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'CONTENT_REVIEWER';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "VersionStatus" ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "QuestionStatus" ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUBMITTED_FOR_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VERSION_CREATED';

ALTER TABLE "Content"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);

ALTER TABLE "ContentVersion"
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Question"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3);

ALTER TABLE "QuestionVersion"
  ADD COLUMN IF NOT EXISTS "contentVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentVersion_reviewedById_fkey'
  ) THEN
    ALTER TABLE "ContentVersion"
      ADD CONSTRAINT "ContentVersion_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContentVersion_approvedById_fkey'
  ) THEN
    ALTER TABLE "ContentVersion"
      ADD CONSTRAINT "ContentVersion_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuestionVersion_contentVersionId_fkey'
  ) THEN
    ALTER TABLE "QuestionVersion"
      ADD CONSTRAINT "QuestionVersion_contentVersionId_fkey"
      FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuestionVersion_reviewedById_fkey'
  ) THEN
    ALTER TABLE "QuestionVersion"
      ADD CONSTRAINT "QuestionVersion_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuestionVersion_approvedById_fkey'
  ) THEN
    ALTER TABLE "QuestionVersion"
      ADD CONSTRAINT "QuestionVersion_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ContentVersion_status_publishedAt_idx"
  ON "ContentVersion"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "QuestionVersion_status_publishedAt_idx"
  ON "QuestionVersion"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "QuestionVersion_contentVersionId_idx"
  ON "QuestionVersion"("contentVersionId");

-- Global lifecycle updates are reviewer-authorized; insert policies remain
-- restricted by the existing global catalog contract.
ALTER POLICY "content_update" ON "Content"
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN
      ('SUPER_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

ALTER POLICY "cv_update" ON "ContentVersion"
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN
            ('SUPER_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

ALTER POLICY "q_update" ON "Question"
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN
            ('SUPER_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

ALTER POLICY "qv_update" ON "QuestionVersion"
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN
            ('SUPER_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE OR REPLACE FUNCTION check_question_version_content_version_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_question_content_id TEXT;
  v_version_content_id  TEXT;
BEGIN
  IF NEW."contentVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT q."contentId" INTO v_question_content_id
  FROM "Question" q
  WHERE q."id" = NEW."questionId";

  SELECT cv."contentId" INTO v_version_content_id
  FROM "ContentVersion" cv
  WHERE cv."id" = NEW."contentVersionId";

  IF v_question_content_id IS NULL OR v_version_content_id IS NULL
     OR v_question_content_id <> v_version_content_id THEN
    RAISE EXCEPTION 'QuestionVersion ve ContentVersion aynı Content kaydına ait olmalı';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_version_content_version
  ON "QuestionVersion";
CREATE TRIGGER trg_question_version_content_version
  BEFORE INSERT OR UPDATE ON "QuestionVersion"
  FOR EACH ROW
  EXECUTE FUNCTION check_question_version_content_version_compatibility();
