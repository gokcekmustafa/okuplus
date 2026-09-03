-- ============================================================
-- 003 — RLS: DOĞRUDAN tenant_id TAŞIYAN TABLOLAR
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Kapsam: "tenantId" NOT NULL olan ve doğrudan tenant context ile
--         izole edilen tablolar.
--
-- ÖN KOŞUL (uygulama katmanı):
--   Her istekte aynı transaction içinde (SET LOCAL) ayarlanır:
--     SET LOCAL app.tenant_id = '<uuid>';
--     SET LOCAL app.platform_role = 'SUPER_ADMIN';  -- platform personeli (opsiyonel)
--   platform_role ayarlıysa tüm tenant verilerine erişim (support/denetim).
-- ============================================================

-- -------- Branch --------
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Branch"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- AcademicYear --------
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicYear" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AcademicYear"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Class --------
ALTER TABLE "Class" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Class" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Class"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Membership --------
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Membership"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- TeacherBranchMembership --------
ALTER TABLE "TeacherBranchMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherBranchMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TeacherBranchMembership"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- TeacherClassAssignment --------
ALTER TABLE "TeacherClassAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherClassAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "TeacherClassAssignment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Enrollment --------
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Enrollment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- Guardianship --------
ALTER TABLE "Guardianship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guardianship" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Guardianship"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- ExerciseSession (SELECT/INSERT/UPDATE izinli; DELETE YOK -> geçmiş korunur) --------
ALTER TABLE "ExerciseSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExerciseSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "ExerciseSession"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "ExerciseSession"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_update" ON "ExerciseSession"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- DELETE policy TANIMLANMADI -> RLS ile silme DB seviyesinde engellenir.

-- -------- Attempt (SELECT/INSERT izinli; UPDATE/DELETE YOK -> immutable) --------
ALTER TABLE "Attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "Attempt"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "Attempt"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- UPDATE/DELETE policy TANIMLANMADI -> immutable.

-- -------- Assignment --------
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Assignment"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentProfile --------
ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentProfile"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentProgress --------
ALTER TABLE "StudentProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentProgress"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- AssessmentResult --------
ALTER TABLE "AssessmentResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentResult" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "AssessmentResult"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- StudentBadge --------
ALTER TABLE "StudentBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentBadge" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentBadge"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- -------- PointEvent (append-only: INSERT izinli; UPDATE/DELETE YOK) --------
ALTER TABLE "PointEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_read" ON "PointEvent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
CREATE POLICY "tenant_isolation_write" ON "PointEvent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );
-- UPDATE/DELETE policy TANIMLANMADI -> append-only.

-- -------- StudentStreak --------
ALTER TABLE "StudentStreak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentStreak" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "StudentStreak"
  FOR ALL
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );