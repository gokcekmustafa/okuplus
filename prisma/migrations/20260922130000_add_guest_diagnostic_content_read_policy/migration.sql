-- Guest Diagnostic content-read boundary.
--
-- The restricted guest role may read only the published global source graph
-- while app.guest_operation=CREATE. Existing authenticated/platform read
-- behavior is preserved for all other contexts. No guest write privilege is
-- granted on source content.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oku_guest_app') THEN
    EXECUTE 'GRANT SELECT ON
      "Content",
      "ContentVersion",
      "ContentSkill",
      "Question",
      "QuestionVersion",
      "ExerciseTemplate",
      "ExerciseTemplateVersion",
      "ExerciseTemplateVersionContent",
      "ExerciseTemplateVersionQuestion",
      "Skill"
    TO oku_guest_app';
  END IF;
END
$$;

-- Restrictive policies close the broad legacy global-read policies only while
-- a guest source-read context is active. Authenticated/platform behavior keeps
-- its previous policy semantics because the condition is true outside these
-- three server-controlled guest operations.
CREATE POLICY "guest_diagnostic_content_published_restriction" ON "Content"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR ("tenantId" IS NULL AND "status" = 'PUBLISHED')
  );

CREATE POLICY "guest_diagnostic_content_version_published_restriction" ON "ContentVersion"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR (
      "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Content" c
        WHERE c."id" = "ContentVersion"."contentId"
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
  );

CREATE POLICY "guest_diagnostic_content_skill_published_restriction" ON "ContentSkill"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND c."tenantId" IS NULL
        AND c."status" = 'PUBLISHED'
    )
  );

CREATE POLICY "guest_diagnostic_question_published_restriction" ON "Question"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR (
      "status" = 'PUBLISHED'
      AND EXISTS (
        SELECT 1 FROM "Content" c
        WHERE c."id" = "Question"."contentId"
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
  );

CREATE POLICY "guest_diagnostic_question_version_published_restriction" ON "QuestionVersion"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR (
      "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Question" q
        JOIN "Content" c ON c."id" = q."contentId"
        WHERE q."id" = "QuestionVersion"."questionId"
          AND q."status" = 'PUBLISHED'
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
  );

CREATE POLICY "guest_diagnostic_template_published_restriction" ON "ExerciseTemplate"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR ("tenantId" IS NULL AND "status" = 'PUBLISHED')
  );

CREATE POLICY "guest_diagnostic_template_version_published_restriction" ON "ExerciseTemplateVersion"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR (
      "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "ExerciseTemplate" t
        WHERE t."id" = "ExerciseTemplateVersion"."templateId"
          AND t."tenantId" IS NULL
          AND t."status" = 'PUBLISHED'
      )
    )
  );

CREATE POLICY "guest_diagnostic_template_content_published_restriction"
  ON "ExerciseTemplateVersionContent"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR EXISTS (
      SELECT 1
      FROM "ExerciseTemplateVersion" tv
      JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
      JOIN "ContentVersion" cv ON cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
      JOIN "Content" c ON c."id" = cv."contentId"
      WHERE tv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND tv."status" = 'PUBLISHED'
        AND tv."publishedAt" IS NOT NULL
        AND t."tenantId" IS NULL
        AND t."status" = 'PUBLISHED'
        AND cv."status" = 'PUBLISHED'
        AND cv."publishedAt" IS NOT NULL
        AND c."tenantId" IS NULL
        AND c."status" = 'PUBLISHED'
    )
  );

CREATE POLICY "guest_diagnostic_template_question_published_restriction"
  ON "ExerciseTemplateVersionQuestion"
  AS RESTRICTIVE FOR SELECT
  USING (
    current_setting('app.guest_operation', true) NOT IN ('CREATE', 'READ', 'ANSWER')
    OR EXISTS (
      SELECT 1
      FROM "ExerciseTemplateVersion" tv
      JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
      JOIN "QuestionVersion" qv ON qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
      JOIN "Question" q ON q."id" = qv."questionId"
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE tv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND tv."status" = 'PUBLISHED'
        AND tv."publishedAt" IS NOT NULL
        AND t."tenantId" IS NULL
        AND t."status" = 'PUBLISHED'
        AND qv."status" = 'PUBLISHED'
        AND qv."publishedAt" IS NOT NULL
        AND q."status" = 'PUBLISHED'
        AND c."tenantId" IS NULL
        AND c."status" = 'PUBLISHED'
    )
  );

DROP POLICY IF EXISTS "content_read" ON "Content";
CREATE POLICY "content_read" ON "Content"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "tenantId" IS NULL
      AND "status" = 'PUBLISHED'
    )
    OR current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS "template_read" ON "ExerciseTemplate";
CREATE POLICY "template_read" ON "ExerciseTemplate"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "tenantId" IS NULL
      AND "status" = 'PUBLISHED'
    )
    OR current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS "cv_read" ON "ContentVersion";
CREATE POLICY "cv_read" ON "ContentVersion"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Content" c
        WHERE c."id" = "ContentVersion"."contentId"
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "q_read" ON "Question";
CREATE POLICY "q_read" ON "Question"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "status" = 'PUBLISHED'
      AND EXISTS (
        SELECT 1 FROM "Content" c
        WHERE c."id" = "Question"."contentId"
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "qv_read" ON "QuestionVersion";
CREATE POLICY "qv_read" ON "QuestionVersion"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Question" q
        JOIN "Content" c ON c."id" = q."contentId"
        JOIN "ContentVersion" cv ON cv."id" = "QuestionVersion"."contentVersionId"
        WHERE q."id" = "QuestionVersion"."questionId"
          AND q."status" = 'PUBLISHED'
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
          AND cv."status" = 'PUBLISHED'
          AND cv."publishedAt" IS NOT NULL
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "cs_read" ON "ContentSkill";
CREATE POLICY "cs_read" ON "ContentSkill"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND EXISTS (
        SELECT 1 FROM "Content" c
        WHERE c."id" = "ContentSkill"."contentId"
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "etv_read" ON "ExerciseTemplateVersion";
CREATE POLICY "etv_read" ON "ExerciseTemplateVersion"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND "status" = 'PUBLISHED'
      AND "publishedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "ExerciseTemplate" t
        WHERE t."id" = "ExerciseTemplateVersion"."templateId"
          AND t."tenantId" IS NULL
          AND t."status" = 'PUBLISHED'
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "etvc_read" ON "ExerciseTemplateVersionContent";
CREATE POLICY "etvc_read" ON "ExerciseTemplateVersionContent"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND EXISTS (
        SELECT 1
        FROM "ExerciseTemplateVersion" tv
        JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
        JOIN "ContentVersion" cv ON cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
        JOIN "Content" c ON c."id" = cv."contentId"
        WHERE tv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
          AND tv."status" = 'PUBLISHED'
          AND tv."publishedAt" IS NOT NULL
          AND t."tenantId" IS NULL
          AND t."status" = 'PUBLISHED'
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
          AND cv."status" = 'PUBLISHED'
          AND cv."publishedAt" IS NOT NULL
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "ExerciseTemplateVersion" tv
      JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
      JOIN "ContentVersion" cv ON cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
      JOIN "Content" c ON c."id" = cv."contentId"
      WHERE tv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

DROP POLICY IF EXISTS "etvq_read" ON "ExerciseTemplateVersionQuestion";
CREATE POLICY "etvq_read" ON "ExerciseTemplateVersionQuestion"
  FOR SELECT
  USING (
    (
      current_setting('app.guest_operation', true) = 'CREATE'
      AND EXISTS (
        SELECT 1
        FROM "ExerciseTemplateVersion" tv
        JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
        JOIN "QuestionVersion" qv ON qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
        JOIN "Question" q ON q."id" = qv."questionId"
        JOIN "Content" c ON c."id" = q."contentId"
        WHERE tv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
          AND tv."status" = 'PUBLISHED'
          AND tv."publishedAt" IS NOT NULL
          AND t."tenantId" IS NULL
          AND t."status" = 'PUBLISHED'
          AND qv."status" = 'PUBLISHED'
          AND qv."publishedAt" IS NOT NULL
          AND q."status" = 'PUBLISHED'
          AND c."tenantId" IS NULL
          AND c."status" = 'PUBLISHED'
      )
    )
    OR current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1
      FROM "ExerciseTemplateVersion" tv
      JOIN "ExerciseTemplate" t ON t."id" = tv."templateId"
      JOIN "QuestionVersion" qv ON qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
      JOIN "Question" q ON q."id" = qv."questionId"
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE tv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );
