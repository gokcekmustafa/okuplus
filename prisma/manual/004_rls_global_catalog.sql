-- ============================================================
-- 004 — RLS: GLOBAL KATALOG TABLOLARI
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Content / ExerciseTemplate / Assessment: "tenantId" NULL ise GLOBAL katalog.
--   * SELECT: global kayıtlar tüm tenant'lar tarafından okunabilir.
--   * INSERT/UPDATE/DELETE (global kayıt): yalnızca platform rolleri
--     ('SUPER_ADMIN', 'CONTENT_EDITOR') tarafından yapılabilir.
--   * tenant'lı kayıtlar yalnızca ilgili tenant tarafından erişilebilir.
--
-- Skill / Level / Badge: salt global katalog; okuma tüm uygulama, yazma platform.
-- ============================================================

-- -------- Content --------
ALTER TABLE "Content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Content" FORCE ROW LEVEL SECURITY;

CREATE POLICY "content_read" ON "Content"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_insert" ON "Content"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_update" ON "Content"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "content_delete" ON "Content"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- ExerciseTemplate --------
ALTER TABLE "ExerciseTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseTemplate" FORCE ROW LEVEL SECURITY;

CREATE POLICY "template_read" ON "ExerciseTemplate"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_insert" ON "ExerciseTemplate"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_update" ON "ExerciseTemplate"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "template_delete" ON "ExerciseTemplate"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Assessment --------
ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assessment" FORCE ROW LEVEL SECURITY;

CREATE POLICY "assessment_read" ON "Assessment"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_insert" ON "Assessment"
  FOR INSERT
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_update" ON "Assessment"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" IS NULL
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "assessment_delete" ON "Assessment"
  FOR DELETE
  USING (
    ("tenantId" IS NULL AND current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Skill (salt global katalog) --------
ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "skill_read" ON "Skill" FOR SELECT USING (true);
CREATE POLICY "skill_write" ON "Skill"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));

-- -------- Level (salt global katalog) --------
ALTER TABLE "Level" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Level" FORCE ROW LEVEL SECURITY;
CREATE POLICY "level_read" ON "Level" FOR SELECT USING (true);
CREATE POLICY "level_write" ON "Level"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));

-- -------- Badge (salt global katalog) --------
ALTER TABLE "Badge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Badge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "badge_read" ON "Badge" FOR SELECT USING (true);
CREATE POLICY "badge_write" ON "Badge"
  FOR ALL
  USING (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'))
  WITH CHECK (current_setting('app.platform_role', true) IN ('SUPER_ADMIN', 'CONTENT_EDITOR'));