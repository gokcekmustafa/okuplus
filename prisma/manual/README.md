# Oku+ — Manuel SQL (prisma/manual)

Bu klasör, Prisma'nın doğrudan ifade edemediği tüm veritabanı gereksinimlerini
içerir: UUID v7 desteği, partial unique index'ler, RLS policy'leri,
immutable-PUBLISHED trigger'ları ve tenant compatibility trigger'ları.

## Uygulama Sırası

Dosyalar, `prisma/migrations/.../migration.sql` içine **gömülerek** (inline)
uygulanır. Sıra kritiktir:

| Sıra | Dosya                                   | İçerik                           | Neden bu sırada?                                           |
| ---- | --------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 1    | `001_uuidv7_extension.sql`              | `CREATE EXTENSION pg_uuidv7`     | `DEFAULT uuidv7()` tablolar oluşturulmadan önce var olmalı |
| 2    | (Prisma üretimi)                        | Tüm CREATE TABLE / CREATE TYPE   | Prisma tarafından üretilir                                 |
| 3    | `002_partial_unique_indexes.sql`        | Partial unique index'ler         | Tablolar var olmalı                                        |
| 4    | `003_rls_tenant_direct.sql`             | tenant_id'li tabloların RLS'i    | Tablolar var olmalı                                        |
| 5    | `004_rls_global_catalog.sql`            | Global katalog RLS'i             | —                                                          |
| 6    | `005_rls_parent_isolation.sql`          | Parent izolasyonu RLS'i          | —                                                          |
| 7    | `006_rls_user_consent_audit.sql`        | User/Consent/AuditLog RLS'i      | —                                                          |
| 8    | `007_published_immutable_triggers.sql`  | Published immutable trigger'lar  | —                                                          |
| 9    | `008_tenant_compatibility_triggers.sql` | Tenant compatibility trigger'lar | —                                                          |
| 10   | `009_branch_active_name_unique.sql`     | Branch aktif isim unique index'i | Branch tablosu + managerUserId sütunu var olmalı           |

## Gerekli GUC Değişkenleri (application katmanı)

RLS policy'leri aşağıdaki session değişkenlerine dayanır. Her istekte, **aynı
transaction içinde** `SET LOCAL` ile ayarlanmalıdır:

```sql
BEGIN;
SET LOCAL app.tenant_id     = '<tenant-uuid>';          -- her zaman
SET LOCAL app.user_id       = '<user-uuid>';            -- User/Consent için
SET LOCAL app.platform_role = 'SUPER_ADMIN';            -- yalnızca platform personeli
-- ... prisma işlemleri ...
COMMIT;
```

Prisma ile `$transaction(async (tx) => { await tx.$executeRaw\`SET LOCAL ...\`; ... })`
veya bağlantı middleware'i (ör. PgBouncer sonrası tek bağlantı) ile uygulanabilir.

## Önemli Notlar

1. **FORCE ROW LEVEL SECURITY** kullanılır → tablo sahibi (app DB user) bile
   policy'lere tabidir. RLS'i bypass etmek için `SET app.platform_role` gerekir.
2. **`app.platform_role` ayarlanmazsa** (`current_setting(..., true)` → NULL),
   tüm karşılaştırmalar `NULL` döner → hiçbir satır görünmez (safe-by-default).
3. `Attempt`, `PointEvent`, `AuditLog`, `ExerciseSession` için UPDATE/DELETE
   policy **bilinçli olarak tanımlanmamıştır** → DB seviyesinde immutable.
4. `PUBLISHED` versiyonlar trigger ile update/delete'e kapalıdır; değişiklik
   yeni `version` üretilerek yapılır.
