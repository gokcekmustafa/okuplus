# OKU+ — 8I-1 Environment Matrix

**Audit tarihi:** 2026-09-03  
**Kapsam:** Repository, local TEST PostgreSQL ve local uygulama yapılandırması.  
**Production erişimi/yazması:** Yapılmadı.

## Durum sözlüğü

Bu matris yalnızca `SET`, `MISSING` ve `UNKNOWN` kullanır.

- `SET`: Repository veya güvenli local doğrulama ile varlığı kanıtlandı; değer/secret gösterilmez.
- `MISSING`: Bu ortam için gerekli konfigürasyon veya capability repository/local config’te yok.
- `UNKNOWN`: Ortam/release/harici servis doğrulanamadı; tahmin edilmez.

## Deployment modeli kanıtı

Kanıtlanan model: Node.js 20+ üzerinde Fastify API + `public/` statik SPA + PostgreSQL/Prisma.
`package.json` içinde `build` (`tsc`), `start` (`node dist/server.js`) ve `dev` script’leri var.
`src/server.ts` uygulamayı `HOST`/`PORT` ile başlatıyor. Uygulama startup’ında otomatik
`prisma migrate deploy` veya `db push` yok.

Repository’de production’a bağlanan bir Dockerfile, compose dosyası, Procfile veya provider
deployment’ı bulunmuyor. 8I-4 kapsamında yalnız staging için Render Blueprint
(`render.yaml`) ve production deploy job’u içermeyen GitHub Actions kalite workflow’u
(`.github/workflows/ci.yml`) eklendi. Provider hesabı, remote origin ve target URL mevcut
olmadığı için staging ve production’ın gerçek deployment kimliği hâlâ **UNKNOWN**’dır.

## Matrix

| Alan                     | LOCAL                                                                                   | TEST                                                                                              | STAGING                                                        | PRODUCTION                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| App URL                  | **SET** — varsayılan local listener `http://127.0.0.1:3000`                             | **SET** — local TEST runner aynı-origin; izole pilot koşusu gerekirse `3001` kullanılabilir       | **UNKNOWN** — Render staging service tanımı var, hesap/URL yok | **UNKNOWN**                                                                                                         |
| API URL                  | **SET** — SPA ile aynı origin                                                           | **SET** — SPA ile aynı origin                                                                     | **UNKNOWN** — gerçek ingress yok                               | **UNKNOWN**                                                                                                         |
| DB host/name/fingerprint | **MISSING** — ayrı local DB kanıtı yok; mevcut `.env` TEST DB’ye işaret ediyor          | **SET** — `127.0.0.1:5432/oku_plus_test`, `public`; fingerprint aşağıda                           | **UNKNOWN** — Render DB tanımı var, instance/fingerprint yok   | **UNKNOWN**                                                                                                         |
| Auth secret              | **SET** — local `.env` içinde var; değer gösterilmez                                    | **SET** — local TEST çalışma değeri var; ayrı TEST secret manager doğrulanmadı                    | **UNKNOWN** — provider binding bekliyor                        | **UNKNOWN**                                                                                                         |
| Cookie/session           | **SET** — JWT access/refresh bearer flow; browser `localStorage` kullanıyor, cookie yok | **SET** — aynı uygulama akışı                                                                     | **UNKNOWN**                                                    | **UNKNOWN**                                                                                                         |
| Storage                  | **SET** — yalnız `public/` statik dosya servisi kanıtlı                                 | **SET** — aynı local statik servis; durable object storage yok                                    | **UNKNOWN**                                                    | **UNKNOWN**                                                                                                         |
| Redis/cache              | **MISSING** — dependency/config yok                                                     | **MISSING** — dependency/config yok                                                               | **UNKNOWN**                                                    | **UNKNOWN**                                                                                                         |
| Payment provider         | **MISSING** — iyzico sandbox kodu var, credential/plan/callback yok                     | **MISSING** — `.env` içinde iyzico key/merchant/plan/callback yok                                 | **UNKNOWN** — sandbox binding/credential yok                   | **MISSING** — production merchant/credential/plan/webhook activation ve production adapter contract’ı kanıtlı değil |
| Flags                    | **SET** — `NODE_ENV`/`PILOT_MODE` güvenli default’lara sahip                            | **SET** — pilot production’da kod tarafından kapalı; current `.env` effective defaults kullanıyor | **UNKNOWN**                                                    | **UNKNOWN**                                                                                                         |
| Logging                  | **SET** — Pino structured logging ve auth/cookie/token/password redaction               | **SET** — aynı logger                                                                             | **UNKNOWN** — platform log/alert binding yok                   | **UNKNOWN**                                                                                                         |

Secret satırları yalnızca varlık durumunu bildirir. Hiçbir secret, token, password veya full
connection string bu dokümana yazılmamıştır.

## Mevcut TEST identity/fingerprint

Salt-okunur doğrulama ile mevcut local TEST PostgreSQL şu identity’yi verdi:

| Alan                    | Değer                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Database                | `oku_plus_test`                                                                       |
| Schema                  | `public`                                                                              |
| Server address          | `127.0.0.1/32`                                                                        |
| Server port             | `5432`                                                                                |
| Server version          | `PostgreSQL 18.6 on x86_64-windows`                                                   |
| Migration state         | 14 repository migration’ın 14’ü applied; pending/failed yok                           |
| Latest migration        | `20260903140000_add_billing_state_audit`                                              |
| Schema hash             | `3f40232948d9b59374112532a3999406b810aa2dc63230bd44a8981254cc7041` (`schema.prisma`)  |
| Live schema hash        | `2195fed3b6ed53957db5dfff514810a0ef317c4b1905c2bca3b15815c9de25db` (`public` columns) |
| Migration manifest hash | `8f073635f2f3d40193e30d78d031f55f609fe179c39b8758cf28bad9765fff8b`                    |
| Combined fingerprint    | `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`                    |

Fingerprint üretimi için `DATABASE_URL` fallback’i olmayan script eklendi:

```powershell
$env:DB_FINGERPRINT_ENVIRONMENT = "TEST"
$env:DB_FINGERPRINT_DATABASE_URL = "<verified-test-url>"
npm run db:fingerprint
Remove-Item Env:DB_FINGERPRINT_ENVIRONMENT, Env:DB_FINGERPRINT_DATABASE_URL
```

Script yalnızca database identity, live column schema hash, repository schema/migration hash ve
Prisma migration state okur; hiçbir INSERT/UPDATE/DELETE/DDL çalıştırmaz ve connection secret’ını
çıktılamaz.

## Staging ayrımı ve minimum sözleşme

Staging ortamı yok veya doğrulanamıyor; yalnız repo-side Render foundation tanımlı.
Production’dan önce minimum staging şu sınırları sağlamalıdır:

1. Ayrı service URL ve ayrı DB instance/database; production URL/secret kesinlikle paylaşılmaz.
2. Ayrı `JWT_SECRET`, provider sandbox hesabı ve webhook endpoint’i.
3. Production’a ait gerçek kullanıcı, catalog, merchant veya payment kullanılmaz.
4. Aynı release artifact’i staging’de çalıştırılır; `npx prisma migrate deploy`, fingerprint,
   `/health`, `/health/db`, smoke ve rollback rehearsal kanıtı saklanır.
5. Secret manager erişimi least-privilege olur; değerler CI log’una veya deploy output’una girmez.

Staging bu koşulları sağlamadan production promotion **BLOCKED** kalır.

## Dependency audit notu

2026-09-03 local audit: `npm audit --omit=dev --audit-level=high` Prisma/deepmerge-ts zincirinde
3 unresolved HIGH advisory bildirdi. Fastify ve fast-uri için güvenli patch/minor güncellemeleri
uygulandı ve advisories çıktıdan temizlendi. Otomatik `npm audit fix --force` çalıştırılmadı;
production artifact bu açık chain için owner, upgrade planı ve yeniden audit sonucu olmadan
onaylanmamalıdır.

## Production için zorunlu bilinmesi gerekenler

Production’a geçmeden önce aşağıdaki alanların her biri `SET` ve bağımsız olarak doğrulanmış
olmalıdır: deployment provider, release SHA/artifact, public app/API URL, DB host/port/name/schema,
DB server identity, current migration, backup/restore evidence, secret manager binding, CORS
allowlist, HTTPS/secure transport, health/readiness monitor, iyzico production activation ve
8G-9B gerçek catalog release planı.
