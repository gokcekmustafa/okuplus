-- ============================================================
-- 005 — RLS: PARENT İZOLASYONU (tenant_id TAŞIMAYAN TABLOLAR)
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Bu tablolar doğrudan tenant_id taşımaz; tenant kapsamı parent entity
-- üzerinden türetilir. Policy'ler parent'ın global veya aynı tenant olmasını
-- doğrular. Yazma (INSERT/UPDATE/DELETE) için parent'ın "yazılabilir" olması
-- gerekir: global parent => platform rolü; tenant'lı parent => aynı tenant.
-- ============================================================

-- -------- ContentVersion (parent: Content) --------
ALTER TABLE "ContentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cv_read" ON "ContentVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "cv_insert" ON "ContentVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "cv_update" ON "ContentVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentVersion"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: geçmiş versiyonların silinmesi engellendi (CASCADE yok, RESTRICT).
-- Ayrıca published immutable trigger'ı (007) delete'i de bloklar.

-- -------- Question (parent: Content) --------
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Question" FORCE ROW LEVEL SECURITY;

CREATE POLICY "q_read" ON "Question"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "q_insert" ON "Question"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "q_update" ON "Question"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "q_delete" ON "Question"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "Question"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- QuestionVersion (parent: Question -> Content) --------
ALTER TABLE "QuestionVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "qv_read" ON "QuestionVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "qv_insert" ON "QuestionVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "qv_update" ON "QuestionVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Question" q
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE q."id" = "QuestionVersion"."questionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: published immutable trigger'ı (007) ile korunur.

-- -------- ContentSkill (parent: Content) --------
ALTER TABLE "ContentSkill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentSkill" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cs_read" ON "ContentSkill"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "cs_insert" ON "ContentSkill"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "cs_delete" ON "ContentSkill"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "Content" c
      WHERE c."id" = "ContentSkill"."contentId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- ExerciseTemplateVersion (parent: ExerciseTemplate) --------
ALTER TABLE "ExerciseTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etv_read" ON "ExerciseTemplateVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
    )
  );

CREATE POLICY "etv_insert" ON "ExerciseTemplateVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etv_update" ON "ExerciseTemplateVersion"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplate" t
      WHERE t."id" = "ExerciseTemplateVersion"."templateId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- DELETE: published immutable trigger'ı (007) ile korunur.

-- -------- ExerciseTemplateVersionContent (parents: template + content) --------
ALTER TABLE "ExerciseTemplateVersionContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersionContent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etvc_read" ON "ExerciseTemplateVersionContent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR (
      EXISTS (
        SELECT 1 FROM "ExerciseTemplateVersion" etv
        JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
        WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
          AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
      )
      AND EXISTS (
        SELECT 1 FROM "ContentVersion" cv
        JOIN "Content" c ON c."id" = cv."contentId"
        WHERE cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
          AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
      )
    )
  );

CREATE POLICY "etvc_insert" ON "ExerciseTemplateVersionContent"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
    AND EXISTS (
      SELECT 1 FROM "ContentVersion" cv
      JOIN "Content" c ON c."id" = cv."contentId"
      WHERE cv."id" = "ExerciseTemplateVersionContent"."contentVersionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etvc_delete" ON "ExerciseTemplateVersionContent"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionContent"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- ExerciseTemplateVersionQuestion (parents: template + question) --------
ALTER TABLE "ExerciseTemplateVersionQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplateVersionQuestion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "etvq_read" ON "ExerciseTemplateVersionQuestion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR (
      EXISTS (
        SELECT 1 FROM "ExerciseTemplateVersion" etv
        JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
        WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
          AND (t."tenantId" IS NULL OR t."tenantId" = current_setting('app.tenant_id', true))
      )
      AND EXISTS (
        SELECT 1 FROM "QuestionVersion" qv
        JOIN "Question" q ON q."id" = qv."questionId"
        JOIN "Content" c ON c."id" = q."contentId"
        WHERE qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
          AND (c."tenantId" IS NULL OR c."tenantId" = current_setting('app.tenant_id', true))
      )
    )
  );

CREATE POLICY "etvq_insert" ON "ExerciseTemplateVersionQuestion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
    AND EXISTS (
      SELECT 1 FROM "QuestionVersion" qv
      JOIN "Question" q ON q."id" = qv."questionId"
      JOIN "Content" c ON c."id" = q."contentId"
      WHERE qv."id" = "ExerciseTemplateVersionQuestion"."questionVersionId"
        AND (
          (c."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR c."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

CREATE POLICY "etvq_delete" ON "ExerciseTemplateVersionQuestion"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "ExerciseTemplateVersion" etv
      JOIN "ExerciseTemplate" t ON t."id" = etv."templateId"
      WHERE etv."id" = "ExerciseTemplateVersionQuestion"."templateVersionId"
        AND (
          (t."tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
          OR t."tenantId" = current_setting('app.tenant_id', true)
        )
    )
  );

-- -------- SessionContentVersion (parent: ExerciseSession - tenant_id taşır) --------
ALTER TABLE "SessionContentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SessionContentVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "scv_read" ON "SessionContentVersion"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR EXISTS (
      SELECT 1 FROM "ExerciseSession" s
      WHERE s."id" = "SessionContentVersion"."sessionId"
        AND s."tenantId" = current_setting('app.tenant_id', true)
    )
  );

CREATE POLICY "scv_insert" ON "SessionContentVersion"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExerciseSession" s
      WHERE s."id" = "SessionContentVersion"."sessionId"
        AND s."tenantId" = current_setting('app.tenant_id', true)
    )
  );