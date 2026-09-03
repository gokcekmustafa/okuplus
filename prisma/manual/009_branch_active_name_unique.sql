-- ============================================================
-- 009 — ŞUBE: AKTİF İSİM UNIQUE INDEX'İ
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Aynı tenant içinde silinmemiş (deletedAt IS NULL) Branch
--       kayıtlarının "name" sütunu benzersiz olmalıdır. Prisma partial
--       unique index ifade edemediği için bu kural DB seviyesinde
--       manuel SQL ile garanti edilir.
--
-- Kural: Soft-delete edilmiş (deletedAt SET) şubelerin isimleri tekrar
--       kullanılabilir; silinmemiş kayıtlar (ACTIVE/INACTIVE/CLOSED dahil)
--       isim çakışmasına izin vermez.
-- ============================================================

CREATE UNIQUE INDEX "uq_branch_active_name"
  ON "Branch" ("tenantId", "name")
  WHERE "deletedAt" IS NULL;