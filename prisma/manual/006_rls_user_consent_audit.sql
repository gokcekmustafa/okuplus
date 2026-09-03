-- ============================================================
-- 006 — RLS: USER (global kimlik) / CONSENT / AUDITLOG
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- User global kimliktir (tenant'sız). Tenant izolasyonu "aynı tenant
-- üyeliği" üzerinden sağlanır; kişi kendini görür. Öğretmen-sınıf kapsamı
-- (senaryo 7) app katmanında RBAC ile uygulanır; RLS burada genel eşik çeker.
--
-- EK GUC (User tablosu için): SET LOCAL app.user_id = '<uuid>';
--   Not: INSERT sırasında app, UUID v7'yi istemcide üretip app.user_id olarak
--   verir; böylece kayıt oluşturma akışı RLS'i geçer.
-- ============================================================

-- -------- User --------
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA kendisi VEYA aynı tenant'ta aktif/pending üye.
CREATE POLICY "user_read" ON "User"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User"."id"
        AND m."tenantId" = current_setting('app.tenant_id', true)
        AND m."status" IN ('ACTIVE', 'PENDING')
    )
  );

-- Oluşturma: platform rolü VEYA id'si app.user_id ile eşleşen (kayıt akışı).
CREATE POLICY "user_insert" ON "User"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  );

-- Güncelleme: platform rolü VEYA kendisi.
CREATE POLICY "user_update" ON "User"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "id" = current_setting('app.user_id', true)
  );

-- Silme: yalnızca platform (soft-delete app'te yapılır).
CREATE POLICY "user_delete" ON "User"
  FOR DELETE
  USING (current_setting('app.platform_role', true) <> '');

-- -------- Consent (tenant_id NULL = platform seviyesi) --------
ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA kendisi VEYA aynı tenant üyesi.
CREATE POLICY "consent_read" ON "Consent"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "Consent"."userId"
        AND m."tenantId" = current_setting('app.tenant_id', true)
        AND m."status" IN ('ACTIVE', 'PENDING')
    )
  );

-- Yazma: platform rolü VEYA kendi rızası VEYA aynı tenant bağlamında.
CREATE POLICY "consent_insert" ON "Consent"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

CREATE POLICY "consent_update" ON "Consent"
  FOR UPDATE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- Silme: platform rolü VEYA kendisi (rıza geri çekme akışı).
CREATE POLICY "consent_delete" ON "Consent"
  FOR DELETE
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "userId" = current_setting('app.user_id', true)
  );

-- -------- AuditLog (tenant_id NULL = platform seviyesi; append-only) --------
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

-- Görme: platform rolü VEYA ilgili tenant bağlamı.
CREATE POLICY "audit_read" ON "AuditLog"
  FOR SELECT
  USING (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );

-- Yazma: yalnızca INSERT (append-only); UPDATE/DELETE policy YOK.
CREATE POLICY "audit_insert" ON "AuditLog"
  FOR INSERT
  WITH CHECK (
    current_setting('app.platform_role', true) <> ''
    OR "tenantId" = current_setting('app.tenant_id', true)
  );