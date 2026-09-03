-- ============================================================
-- 001 — UUID v7 DESTEĞİ
-- Oku+ veri katmanı / manuel SQL
-- ============================================================
-- Amaç: Tüm PK'lar `@default(dbgenerated("uuidv7()"))` kullanır.
--       Bu migration, şema tabloları OLUŞTURULMADAN ÖNCE çalışmalıdır,
--       aksi halde `DEFAULT uuidv7()` çözümlenemez.
--
-- Gereksinimler:
--   * PostgreSQL 18+   : uuidv7() YERLEŞİK olarak mevcuttur, extension GEREKMEZ.
--   * PostgreSQL < 18  : pg_uuidv7 extension'ı gerekir.
--       - Neon / Supabase : `CREATE EXTENSION pg_uuidv7;` desteklenir.
--       - Azure Flexible  : extension allowlist'e eklenmelidir.
--       - Kendi sunucu    : pg_uuidv7 paketi kurulmalı (PGXN veya GitHub).
-- ============================================================

-- PostgreSQL 18+: uuidv7() yerleşiktir; extension gerekmez.
-- PostgreSQL < 18 : pg_uuidv7 extension'ı kurulmalıdır (PGXN veya GitHub).
-- NOT: pg_uuidv7 çekirdek dağıtımda YOKTUR; koşulsuz CREATE EXTENSION,
--      PG18+ üzerinde "extension has no installation script" hatası verir.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    CREATE EXTENSION IF NOT EXISTS pg_uuidv7;
  END IF;
END
$$;
