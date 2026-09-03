# OKU+ — Stage 8I-3 Final Report

**Audit tarihi:** 2026-09-03  
**Kapsam:** Production deployment discovery + GO/NO-GO evidence.  
**Production DB/write/migration/payment/catalog:** NO.

## STATUS

**PASS — discovery evidence chain ve karar matrisi tamamlandı; production kararı NO-GO.**

8I-3 amacı production’a deploy etmek değildir. Repository’de authorized deployment source ve
production runtime bulunamadığı için bilinmeyenler varsayılmadan kaydedildi.

## DEPLOYMENT TARGET

**PLATFORM: UNKNOWN. SERVICE: UNKNOWN. DEPLOYMENT SOURCE: UNKNOWN.** Repository’de Docker/Compose,
Procfile, Vercel/Railway/Render/Fly manifesti, GitHub Actions, README veya release config yoktur.
Git `origin` remote configured değildir ve checkout’ta commit yoktur. Confirmed olan yalnızca
Node.js `>=20` + Fastify + `public/` static SPA + PostgreSQL/Prisma uygulama modelidir.

## PRODUCTION DB

**UNKNOWN / NOT VERIFIED.** Production host, port, database, provider, SSL, schema, runtime URL veya
secret manager binding repository’de yoktur. Production DB’ye bağlanılmadı; local `.env` yalnız
`oku_plus_test` için kullanıldı.

## PRODUCTION DB FINGERPRINT

Production fingerprint **NOT GENERATED**. [`scripts/db-fingerprint.ts`](../scripts/db-fingerprint.ts)
explicit environment + explicit PostgreSQL URL ister, `DATABASE_URL` fallback’i kullanmaz ve
server/database identity, migration state, schema identity ve environment’i read-only toplar.

TEST reference fingerprint:

`544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`

TEST identity `127.0.0.1:5432/oku_plus_test/public`, PostgreSQL 18.6, 14/14 applied’dir. Production
fingerprint authorized target bulunduğunda alınmalı ve TEST’ten bağımsız DB identity göstermelidir.

## STAGING

**NOT CONFIRMED / UNKNOWN.** Ayrı staging service, URL, DB, secret veya same-artifact rehearsal
kanıtı yoktur. Production ile aynı DB kullanılmadığı kanıtlanana kadar promotion blocked/high-risk’tir.

## CATALOG SOURCE

**UNKNOWN / BLOCKED.** Authorized Level/Skill source veya verified export repository’de yoktur. Local
fixture catalog production catalog değildir. Gerekli chain:

`AUTHORIZED SOURCE → verified catalog export → catalog validation → staging smoke → approved promotion`

`qa:curriculum-catalog` TEST read-only koşuda 8G-9B nedeniyle BLOCKED kalmıştır; catalog oluşturma veya
promotion yapılmamıştır.

## IYZICO

**BLOCKED / NOT ACTIVATED.** Sandbox API key, secret, merchant, plan reference, reachable HTTPS
callback ve webhook activation local environment’ta yoktur. Adapter sandbox-only host, signature-v3,
replay window ve idempotency contract’ını test eder; provider ağına gerçek çağrı ve production
activation yapılmamıştır.

## SECURITY

Local/test hardening ve testleri PASS’tir: explicit CORS, security headers/CSP, finite body/request
limits, endpoint rate limiting, generic errors, redaction, `/health`, `/health/db`, `/ready`, DB
timeouts ve graceful shutdown mevcut.

Production risk sınıflaması:

| Risk                                | Sınıf       | Karar                                                                                                   |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| localStorage access/refresh bearer  | **BLOCKER** | XSS token theft riski; explicit risk acceptance yok. HttpOnly/Secure/SameSite cookie migration gerekli. |
| CSP `unsafe-inline`                 | **HIGH**    | Legacy inline handler/style uyumluluğu için tutuldu; nonce/hash/external handler migration gerekli.     |
| Backup/restore evidence yok         | **BLOCKER** | Production promotion öncesi backup + isolated restore şart.                                             |
| Secret rotation/binding unknown     | **BLOCKER** | Secret manager, owner, TTL/rotation ve access evidence gerekli.                                         |
| Retention/erasure owner unknown     | **BLOCKER** | Billing/session/telemetry/feedback retention policy ve deletion owner gerekli.                          |
| Process-local rate limit            | **HIGH**    | Multi-instance production’da edge/WAF veya Redis-backed shared limiter gerekli.                         |
| CORS/TLS deployment binding unknown | **HIGH**    | Explicit HTTPS allowlist, TLS termination ve trusted proxy doğrulanmalı.                                |
| Security headers                    | **LOW**     | Local/test PASS; production ingress/HTTPS termination ile tekrar doğrulanmalı.                          |
| iyzico webhook activation unknown   | **HIGH**    | Provider callback, signature secret, replay/idempotency observability kanıtlanmalı.                     |

localStorage bearer için risk production’da varsayılan olarak kabul edilebilir değildir; yalnız named
owner ve yazılı compensating controls/risk acceptance ile geçici downgrade düşünülebilir.

## DEPENDENCIES

Final `npm audit --omit=dev --audit-level=high` 3 HIGH aggregate bildirir:

| Package/node            | Advisory                                 | Fixed version/path                                                    | Breaking risk                                                                         | Exposure                                                                                                       |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts@7.1.5`    | `GHSA-ggr8-5vv4-36mx`, `<8.0.0`, CWE-674 | Upstream floor `8.0.0`; current Prisma chain güvenli şekilde çözmüyor | `npm audit fix --force` Prisma `6.12.0` öneriyor ve `isSemVerMajor=true`; uygulanmadı | Recursive merge stack exhaustion; Prisma CLI/config zinciri, request path exposure düşük ama audit gate gerçek |
| `@prisma/config@6.19.3` | Via `deepmerge-ts`, HIGH                 | Fixed path current lockfile’da yok                                    | Prisma downgrade/major test gerekir                                                   | Prisma CLI/config dependency node                                                                              |
| `prisma@6.19.3`         | Via `@prisma/config`, HIGH               | Current safe patch/minor path yok                                     | Force downgrade breaking; Prisma 7/8 migration ayrı iş                                | Migration/CLI toolchain; production release gate                                                               |

Fastify `5.12.1` ve fast-uri `4.1.4`/`3.1.7` safe patch seviyesindedir; önceki advisories audit’den
çıktı. `npm audit fix --force` kullanılmadı. Unresolved HIGH zinciri production’da BLOCKER’dır.

## BACKUP

**NOT VERIFIED / BLOCKED.** Gerçek production backup/snapshot alınmadı. Frequency, retention,
encryption, access owner ve provider evidence [DATABASE_BACKUP_RESTORE_8I2.md](./DATABASE_BACKUP_RESTORE_8I2.md)
içinde prosedür olarak tanımlıdır; kanıt değildir.

## RESTORE

**NOT VERIFIED / BLOCKED.** Isolated restore test, RPO/RTO, restore fingerprint ve smoke evidence yok.
Uygulama rollback’i DB restore kanıtı yerine geçmez.

## SECRET ROTATION

**UNKNOWN.** Repository’de production secret manager, binding, rotation mechanism, owner, TTL veya
access listesi yoktur. Secret değerleri gösterilmedi, üretilmedi veya test edilmedi.

## READINESS

Local/test evidence **PASS**: `/health` liveness 200; `/health/db` `SELECT 1` ve outage’ta 503;
`/ready` DB erişimi + `_prisma_migrations` tamamlanmamış/rollback migration kontrolü ile healthy’de
200, dependency/migration failure’da 503 döner. Production service ingress/probe/monitor binding’i
deployment target bilinmediği için **UNKNOWN**.

## GO/NO-GO

**NO-GO.** [PRODUCTION_GO_NO_GO_MATRIX_8I3.md](./PRODUCTION_GO_NO_GO_MATRIX_8I3.md) içindeki target,
production DB identity, staging, backup/restore, security, dependencies, secrets, catalog, iyzico,
migration safety, smoke ve rollback gate’lerinden production için yeterli PASS yoktur.

## PRODUCTION WRITE

**NO.** Production DB’ye bağlanılmadı; production migration, write, DDL, promotion veya gerçek kullanıcı
işlemi yapılmadı. QA/test işlemleri yalnız explicit local `oku_plus_test` hedefinde yürütüldü.

## PRODUCTION PAYMENT

**NO.** Gerçek charge/refund/cancel/checkout veya production provider çağrısı yapılmadı. Browser billing
testlerinde provider/payment çağrıları mocked; iyzico sandbox activation da credential/callback yokluğu
nedeniyle çalıştırılmadı.

## 8G-8

**OPEN.** Deployment target, production DB identity/fingerprint, promotion ve backup/restore evidence
bulunmuyor.

## 8G-9B

**OPEN.** Authorized production Level/Skill catalog ve Level→Skill/Content→Level relation evidence
yok; TEST fixture catalog QA BLOCKED.

## REMAINING BLOCKERS

1. Authorized deployment platform/service/source, release artifact ve production DB identity unknown.
2. Ayrı staging ve same-artifact migration/health/readiness/smoke/rollback rehearsal yok.
3. Production backup/restore, RPO/RTO, retention ve secret rotation kanıtı yok.
4. Prisma/deepmerge-ts zincirinde 3 HIGH; safe upgrade path yok, force uygulanmadı.
5. localStorage bearer token ve CSP `unsafe-inline` production security gaps.
6. Authorized catalog source ve iyzico merchant/plan/webhook activation yok.
7. Production TLS/edge limiter/metrics/alerts/on-call binding’i bilinmiyor.

## FINAL RECOMMENDATION

**8I-3 discovery PASS; production GO/NO-GO: NO-GO.** Deployment source ve production identity
authorized evidence ile bulunana kadar production’a bağlanılmamalı. Sonraki release gate’ler:
target + staging + DB fingerprint, backup/restore, secret rotation, dependency remediation/risk
acceptance, cookie/CSP migration veya documented acceptance, catalog validation ve iyzico activation.
