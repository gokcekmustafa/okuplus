# OKU+ — Stage 8I-2 Final Report

**Audit tarihi:** 2026-09-03  
**Kapsam:** Production security & reliability hardening; local TEST evidence.  
**Production DB / write / DDL / migration:** NO.  
**Production payment / real user / production catalog:** NO.

## STATUS

**PASS — local/test security hardening uygulandı ve doğrulandı; PRODUCTION BLOCKED / NO-GO.**

Production block gerekçeleri: Prisma/deepmerge-ts HIGH audit zinciri, deployment/secret/TLS/backup
kanıtlarının bilinmemesi, bearer localStorage + CSP inline migration gap’i, 8G-8, 8G-9B ve iyzico
activation dependency’leri.

## DEPENDENCIES

Runtime direct dependencies: Fastify `5.12.1`, `@fastify/cors`, `@fastify/static`, Prisma client `6.19.3`,
Zod, jose, dotenv. Lockfile audit edildi; fast-uri/Fastify güvenli patch seviyelerine çıkarıldı.
Prisma CLI/config zincirindeki 3 HIGH advisory güvenli force/major değişiklikle çözülmedi ve açık risk
olarak belgelendi. Advisory/package/severity/fix ayrıntısı `SECURITY_HARDENING_8I2.md` içinde tablo halinde
kaydedildi. `npm ls --all` dependency tree kanıtı alındı.

## AUTH

Password `scrypt` + random salt + timing-safe compare; dummy hash; generic login failure; bounded auth
payloads. Mevcut unauthorized/unauthorized-access/tenant/student crossover testleri korunmuştur.

## SESSION

Short-lived access token; DB-backed refresh session; rotation, current-session revoke, replay/family
revoke, logout ve logout-all mevcut kontratta PASS. Browser bearer token’ları localStorage’da tutuyor;
HttpOnly cookie migration açık production riskidir. Cookie auth yok, bu yüzden cookie-CSRF kontrolü N/A;
ileride cookie’ye geçiş ayrı gate’tir.

## RATE LIMITING

Auth, refresh, signup/social, billing, iyzico webhook, pilot feedback/bug/event ve mutating genel
uçlar için 60 saniyelik process-local fixed-window limiter eklendi. Varsayılan limitler auth 60,
billing 60, webhook 120, pilot/default 60/120; aşım 429 + Retry-After. Multi-instance production için
edge/Redis shared limiter hâlâ zorunlu deployment işidir.

## CORS

Boş CORS allowlist cross-origin’i kapatır. `CORS_ORIGIN` yalnız explicit HTTP(S) origin listesi kabul
eder; wildcard/path/credential içeren origin reddedilir. CORS wrapper root context’te çalışacak şekilde
düzeltildi ve allowed/denied origin test edildi.

## HEADERS

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict Referrer-Policy, restrictive
Permissions-Policy ve CSP eklendi. CSP’de `unsafe-eval`/wildcard yok; mevcut inline style/event handler
uyumluluğu için `unsafe-inline` geçici gap. Production’da HTTPS varsayımı altında HSTS eklenir.

## INPUT VALIDATION

Global body limit; request/field max length; strict object schemas; malformed JSON/oversized 413;
media URL HTTP(S) ve 50 MB metadata limit; pilot feedback/bug ve billing/auth sınırları. Upload/storage
akışı bulunmadığından file scanning/storage retention N/A.

## ERROR HANDLING

Unknown server errors generic `INTERNAL_ERROR`; 4xx Fastify parser errors generic `REQUEST_ERROR`;
oversized body `PAYLOAD_TOO_LARGE`; not-found path/query client’a açılmıyor. Detaylar structured server
log’ta kalır ve secrets redacted edilir.

## PII/LOGGING

Pino structured logging ve Fastify request ID mevcut. URL/DB/password/token/authorization/cookie/secret/
API key/merchant key alanları redacted. iyzico raw payload loglanmaz; hash/minimized identifiers kullanılır.
Telemetry, feedback/bug, billing audit, session retention günleri ve owner’ları **PENDING**.

## WEBHOOK

Mevcut sandbox-only iyzico adapter’ı korunmuştur: signature-v3, event ID, payload hash, stale/replay
window, idempotency, conflict/terminal state ve transaction kontrolleri mevcut test kapsamındadır.
Production provider activation yapılmadı; gerçek callback/charge/refund çağrısı yok.

## READY

`/health` liveness 200; `/health/db` `SELECT 1` ile DB up/down ve 503; `/ready` DB + migration table
state kontrolü ile hazırsa 200, değilse 503. Local `oku_plus_test` üzerinde `/ready` 200 doğrulandı.

## DB RELIABILITY

Prisma connection URL’ine `connect_timeout=10`, `pool_timeout=10`, `socket_timeout=30`; transaction
`maxWait=10s`, `timeout=30s`; HTTP connection/request/keep-alive timeout’ları finite env config ile
ayarlanabilir. DB unavailable behavior `/health/db`/`/ready` 503 ve generic response olarak test edildi.

## GRACEFUL SHUTDOWN

SIGTERM/SIGINT handler’ları Fastify close ile yeni kabulü durdurur, aktif request drain’ini bekler ve
Prisma disconnect yapar. Başlatma hatası exit code 1. Testte SIGTERM/SIGINT emülasyonu 2/2 PASS;
production process manager’ın gerçek OS davranışı deployment target’ı bilinmediği için ayrıca doğrulanmadı.

## BACKUP/RESTORE

[DATABASE_BACKUP_RESTORE_8I2.md](./DATABASE_BACKUP_RESTORE_8I2.md) oluşturuldu. Frequency, retention,
encryption, access, restore, RPO/RTO ve verification sözleşmesi yazıldı; gerçek backup/restore kanıtı
**NOT VERIFIED**, dolayısıyla production gate NO-GO.

## SECURITY TESTS

Yeni automated tests: security headers/CSP/HSTS, CORS allow/deny + wildcard config rejection, auth
rate-limit 429, oversized body 413, readiness. Existing suite ayrıca unauth/unauthz, tenant/student
crossover, refresh replay/family revoke, malformed inputs, webhook spoof/replay/idempotency ve secret
redaction kontratlarını kapsar.

## DEPENDENCY AUDIT

Initial 5 advisory (4 HIGH, 1 MODERATE) içinden Fastify ve fast-uri patch advisories çözüldü. Final audit
Prisma/deepmerge-ts zincirinde 3 HIGH ile non-zero kalır. `npm audit fix --force` uygulanmadı; major/RC
Prisma upgrade ayrı testli iş olarak bırakıldı. Bu açık risk production’da accepted-risk owner olmadan
geçilemez.

## TESTS

`npm test -- --reporter=dot`: **37 test dosyası / 636 test PASS**. Ayrıca graceful shutdown
SIGTERM/SIGINT 2/2 PASS; tüm DB koşumları local `oku_plus_test` ile sınırlıdır.

## BROWSER

8F final QA PASS; closed-pilot operations PASS; billing lifecycle PASS; billing account UX PASS; 8G-8
curriculum pack PASS. Provider/payment browser çağrıları mock/sandbox sözleşmesindedir. Local 3000 ve
3001’de /health + /ready smoke PASS. 8G-9B catalog QA dependency nedeniyle BLOCKED.

## QUALITY GATES

| Gate                                                                   | Sonuç                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| npm test                                                               | PASS — 37 dosya / 636 test                                                                                          |
| lint / format check / typecheck / build                                | PASS                                                                                                                |
| Prisma validate / migrate status                                       | PASS — 14 migration, DB up to date                                                                                  |
| npm audit --omit=dev --audit-level=high                                | BLOCKED — Prisma/deepmerge-ts 3 HIGH; force fix yok                                                                 |
| curriculum pack QA                                                     | PASS — TEST read-only                                                                                               |
| curriculum fixture QA                                                  | PASS — TEST read-only                                                                                               |
| curriculum catalog QA                                                  | BLOCKED — beklenen 8G-9B catalog dependency                                                                         |
| browser 8F / closed-pilot / billing lifecycle / billing account / pack | PASS — local TEST/sandbox                                                                                           |
| graceful shutdown signal tests                                         | PASS — SIGTERM + SIGINT 2/2                                                                                         |
| TEST DB fingerprint                                                    | PASS — oku_plus_test, 14/14 applied, fingerprint `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e` |

Audit non-zero olduğu için production security gate kapalıdır; catalog BLOCKED production catalog
başarısı değildir.

## PRODUCTION WRITE NO

**NO.** Production DB’ye bağlanılmadı; write/DDL/migration/promotion yapılmadı. Yalnız local
`oku_plus_test` kullanıldı.

## PRODUCTION PAYMENT NO

**NO.** Gerçek checkout/charge/refund/cancel/provider production çağrısı yapılmadı. iyzico sandbox
activation bile credentials/callback eksikliği nedeniyle çalıştırılmadı.

## 8G-8 OPEN

**OPEN.** Production DB/deployment target/identity ve migration/backup/restore kanıtları yok.

## 8G-9B OPEN

**OPEN.** Production-grade catalog Level/Skill/content/template/question relation release’i yok;
catalog QA BLOCKED kalır.

## IYZICO ACTIVATION OPEN

**OPEN / NOT RUN.** Sandbox credentials, merchant/plan refs, reachable HTTPS callback ve production
provider activation yok. Real payment yapılmadı.

## REMAINING RISKS

1. Prisma/deepmerge-ts HIGH advisories.
2. Deployment target, TLS, secret manager/rotation, edge/shared limiter, metrics/alerts, retention ve
   on-call owner unknown.
3. localStorage bearer auth ve CSP `unsafe-inline` migration gap.
4. Backup/restore rehearsal, RPO/RTO ve restore evidence not verified.
5. 8G-8, 8G-9B ve iyzico activation açık dependency’leri.

## FINAL RECOMMENDATION

**Local 8I-2 hardening PASS; production GO/NO-GO kararı: NO-GO.** Önce unresolved HIGH için
upgrade/izolasyon veya named accepted-risk, ardından deployment/TLS/secrets/shared rate limit,
backup/restore/RPO-RTO, retention/observability, 8G-8, 8G-9B ve iyzico activation gate’leri kapatılmalı.
