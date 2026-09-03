# Oku+ — Neon Staging Database Evidence (8I-6C)

**Tarih:** 2026-09-03  
**STATUS:** **BLOCKED — Neon account/project access unavailable**  
**Scope:** Neon staging database, branch, migration and fingerprint contract. Production DB oluşturulmadı.

## Database availability

| Alan                         | Sonuç                |
| ---------------------------- | -------------------- |
| Neon account                 | **NOT VERIFIED**     |
| Neon project                 | **NOT CREATED**      |
| Staging branch               | **NOT CREATED**      |
| Staging pooled URL           | **NOT AVAILABLE**    |
| Staging direct migration URL | **NOT AVAILABLE**    |
| Remote migration status      | **NOT RUN**          |
| Staging fingerprint          | **NOT AVAILABLE**    |
| Production branch/DB         | **NOT CREATED / NO** |

Windows browser helper iki kez altyapı hatası verdi; Neon CLI kurulu değil; credential veya account state tahmin edilmedi.

## TEST reference

Repository’de kayıtlı TEST referansı:

```text
environment: TEST
host: 127.0.0.1
port: 5432
database: oku_plus_test
schema: public
combined fingerprint: 544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e
```

Bu TEST hedefi local-only’dir ve staging olarak kullanılamaz. Staging fingerprint aynı `scripts/db-fingerprint.ts` ile explicit `DB_FINGERPRINT_ENVIRONMENT=STAGING` etiketiyle alınmalı ve TEST fingerprint’inden farklı olmalıdır. Fingerprint output’unda secret veya full connection URL kaydedilmemeli.

Örnek güvenli invocation:

```powershell
$env:DB_FINGERPRINT_ENVIRONMENT = "STAGING"
$env:DB_FINGERPRINT_DATABASE_URL = "<secret-manager-injected-staging-url>"
npm run db:fingerprint
Remove-Item Env:DB_FINGERPRINT_ENVIRONMENT, Env:DB_FINGERPRINT_DATABASE_URL
```

Bu komut bu görevde çalıştırılmadı; staging URL yoktur.

## Neon connection strategy

Neon resmi pooling dokümanına göre serverless runtime’da pooled endpoint (`-pooler`) kullanılmalı: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

Önerilen staging wiring:

```text
DATABASE_URL        = Neon pooled runtime URL, sslmode=require
DIRECT_DATABASE_URL = Neon direct URL, migration job only
```

Mevcut Prisma schema’sı `DATABASE_URL` kullanıyor. Uygulama değişikliği bu stage’de yapılmadı. Migration için Prisma `directUrl` veya controlled job override’ı uygulama aşamasında seçilmeli. `prisma migrate deploy` her Vercel Function invocation’ında çalıştırılmamalı.

Neon PostgreSQL wire compatibility ve Prisma migration desteği sunuyor: [PostgreSQL compatibility](https://neon.com/docs/reference/compatibility), [Prisma migrations](https://neon.com/docs/guides/prisma-migrations).

## Migration contract

Repo migration manifestinde mevcut migration directory sayısı: **14**.

Local controlled evidence:

- local `prisma migrate deploy`: 8 pending migration yalnız local test DB’ye uygulandı;
- ardından `npx prisma migrate status`: **Database schema is up to date**;
- remote Neon migration: **NOT RUN**.

Staging’de beklenen sıra:

1. Neon staging branch/project identity’yi redacted olarak doğrula.
2. `prisma migrate status` ile pending/failed state’i oku.
3. Backup/restore policy ve migration approval’ı doğrula.
4. Ayrı migration job ile `prisma migrate deploy` çalıştır.
5. Tekrar status, `/ready` ve fingerprint al.
6. Fingerprint’in TEST’ten farklı DB identity gösterdiğini doğrula.

## Branch and data isolation

Preview için Neon branch per deployment kullanılabilir; Vercel Preview environment ile branch wiring hesapta kurulup doğrulanmalıdır: [Neon branching](https://neon.com/docs/guides/branching-intro), [Neon–Vercel native integration](https://neon.com/blog/neon-vercel-native-integration).

Staging/Preview branch’lerinde production PII kopyalanmamalı. Schema-only veya synthetic seed tercih edilmeli. Preview/Staging URL’si Production DB’ye bağlanmamalı; production branch bu görevde oluşturulmadı.

## Backup and restore

Neon restore window ve backup/PITR kabiliyeti plan/proje ayarına bağlıdır. Staging resource yok olduğu için backup policy, restore point, RPO/RTO veya restore fingerprint kanıtı üretilemedi. Production backup/restore kesinlikle test edilmedi.

## Safety boundary

- Neon project/branch/database create: **NO**
- remote DB URL read/use: **NO**
- remote migration/write: **NO**
- production DB/branch/backup: **NO**
- production PII: **NO**
- real payment/catalog: **NO**

**Database decision:** local Prisma/Neon architecture is compatible, but 8I-6C hosted staging database acceptance is **BLOCKED** until an authorized Neon account and separate staging resource are supplied.
