# OKU+ — Stage 8I-1 Final Report

**Audit tarihi:** 2026-09-03  
**Kapsam:** Production deployment/environment readiness contract; local TEST evidence.  
**Production erişimi:** Yok.  
**Production write:** Yok.  
**Real payment:** Yok.

## STATUS

**PASS — 8I-1 readiness contract ve deployment runbook oluşturuldu; production promotion NO-GO olarak korundu.**

Bu PASS, production’ın hazır olduğu anlamına gelmez. 8G-8 production DB/deployment blocker,
8G-9B production catalog blocker ve iyzico activation dependency açık kalmıştır.

## DEPLOYMENT TARGET

**UNKNOWN.** Repository’de Dockerfile/compose, Procfile, Vercel/Render/Railway/Fly ayarı, GitHub
Actions workflow’u veya README bulunamadı. Kanıtlanan runtime: Node.js 20+, Fastify, Prisma/PostgreSQL,
`public/` statik SPA; `npm run build` + `npm start` mevcut.

## ENVIRONMENT MATRIX

[ENVIRONMENT_MATRIX_8I1.md](./ENVIRONMENT_MATRIX_8I1.md) oluşturuldu. Local ve TEST aynı local
workspace üzerinde çalışıyor; ayrı local DB yok. Current `.env` yalnız `127.0.0.1:5432/oku_plus_test`
hedefini kanıtlıyor. Staging ve production **UNKNOWN**.

## PRODUCTION IDENTITY

Production service URL, release SHA/artifact, DB host/port/name/schema, DB server identity ve
migration identity doğrulanmadı. Production identity contract şu alanları zorunlu kılar:
`environment=PRODUCTION`, service name, release SHA, app/API URL, DB identity, schema/migration
hash’leri ve verification timestamp/owner.

## DB FINGERPRINT

Salt-okunur `scripts/db-fingerprint.ts` ve `npm run db:fingerprint` eklendi. Script, explicit
`DB_FINGERPRINT_ENVIRONMENT` ve `DB_FINGERPRINT_DATABASE_URL` ister; `DATABASE_URL` fallback’i yoktur.
Host, port, database, schema, server version, live schema hash, repository schema/migration hash’i
ve Prisma migration state’i non-secret olarak raporlar; write/DDL yapmaz.

Local TEST identity: `oku_plus_test`, `public`, `127.0.0.1/32:5432`, PostgreSQL 18.6; 14/14
migration applied, pending/failed yok; latest `20260903140000_add_billing_state_audit`. Current
combined fingerprint `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`; schema,
live-schema and migration-manifest hashes are recorded by the script output and are non-secret.

## MIGRATION STRATEGY

`prisma/migrations` altında 14 versioned migration var. App startup migration çalıştırmıyor.
Production contract: backup → `prisma validate` → `migrate status` → `migrate deploy` → status/fingerprint
→ health/smoke. `migrate dev`, `reset`, `db push` ve blind startup migrate yasak. Failed migration’da
silme/down migration yok; approved forward fix veya restore planı kullanılır.

## SECRETS

Secret values repo’ya veya rapora yazılmadı. Local `.env` içinde JWT secret ve `DATABASE_URL` var;
iyzico API/secret/merchant/plan/callback alanları boş. Secret manager, rotation policy, production
binding ve access audit **UNKNOWN**. Production default JWT secret ile başlatılmamalı; current config
minimum length kontrol ediyor fakat production-specific default rejection henüz uygulanmış değil (**GAP**).

## HEALTH

`GET /health` liveness olarak mevcut; `GET /health/db` `SELECT 1` ile DB probe yapıyor ve down ise
503 dönüyor. `/ready` mevcut değil (**GAP**); production’da app+DB+migration/config readiness’ini
secret sızdırmadan ifade eden endpoint veya eşdeğer platform probe zorunludur. Production health
PASS iddiası yapılmadı.

## OBSERVABILITY

Pino structured logging, Fastify request ID (`reqId`) ve authorization/cookie/token/password redaction
kanıtlandı. Billing raw provider payload’ı response/log’a yazmıyor; payload hash ve minimize edilmiş
alanlar kullanılıyor. Metrics, tracing, alert routing, log retention ve on-call entegrasyonu repository’de
**UNKNOWN**. PII/card/CVV/raw payment logging yasak sözleşmeye alındı.

## BACKUP

Local TEST backup/restore rehearsal evidence bu task kapsamında yapılmadı. Production backup, retention,
restore test ve RPO/RTO **MISSING/UNKNOWN**; backup/restore kanıtı olmadan promotion **NO-GO**.

## SECURITY

| Kontrol                  | Durum                                  | Kanıt/not                                                                                           |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| HTTPS/TLS                | UNKNOWN                                | Deployment target yok                                                                               |
| Secure cookie            | GAP                                    | Browser bearer access/refresh token’ları `localStorage`’da tutuyor; cookie auth yok                 |
| CSRF                     | GAP/REVIEW                             | Cookie session yok, ancak production auth storage/XSS kararı açık                                   |
| CORS allowlist           | PASS (kod) / UNKNOWN (prod değer)      | Wildcard yok; `CORS_ORIGIN` explicit list olmalı                                                    |
| Rate limit/brute force   | GAP                                    | Repository’de rate-limit dependency/middleware yok                                                  |
| Webhook signature/replay | PASS (kod) / UNKNOWN (prod activation) | iyzico signature-v3 ve zaman penceresi var                                                          |
| Secret manager/rotation  | UNKNOWN                                | Provider yok                                                                                        |
| Dependency audit         | GAP                                    | `npm audit --omit=dev --audit-level=high`: 5 advisory (4 high, 1 moderate); force upgrade yapılmadı |
| Security headers         | GAP                                    | Helmet/eşdeğer header layer yok                                                                     |
| Error minimization       | PASS                                   | Generic 500 response; detay server log’a gider                                                      |

## PAYMENT DEPENDENCY

iyzico entegrasyonu mevcut kodda **SANDBOX-only**. Local `.env` credential, merchant ID, plan
reference ve HTTPS callback içermiyor; real sandbox E2E çalıştırılmadı. Production için merchant
activation, production credential/plan refs, callback/webhook, signature secret, cancel/refund
contract ve provider production adapter kararı gerekir.

## CURRICULUM DEPENDENCY

8G-9B ayrı ve açık blocker’dır. Production catalog yaratılmadı/promote edilmedi. TEST’teki 8G-8
stable pack fixture evidence (9 content / 36 question / 9 template) production-grade Level/Skill
ve direct alignment relations yerine geçmez.

## TESTS

Bu rapordaki koşum sonuçları aşağıdaki quality gate bölümünde güncellenecektir. Production DB’ye
bağlanılmadı; local TEST DB dışında hedef kullanılmadı.

## BROWSER

Browser regression yalnız local app üzerinde, test/sandbox contract ile çalıştırılır. Production URL
ve gerçek payment kullanılmaz. Existing 8H-7 evidence: full billing account UX, lifecycle, 8F,
closed-pilot ve 8G-8 pack browser PASS; catalog QA 8G-9B nedeniyle BLOCKED.

## QUALITY GATES

Koşulan local gates: `npm test` (35 dosya / 623 test PASS), lint PASS, format check PASS, typecheck
PASS, build PASS, `prisma validate` PASS, `prisma migrate status` PASS, fingerprint PASS, 8F browser
PASS, closed-pilot PASS, billing lifecycle PASS, billing account UX PASS, pack browser PASS, pack QA
PASS ve fixture QA PASS. `npm audit --omit=dev --audit-level=high` 5 advisory (4 high, 1 moderate)
bildirdi; upgrade yapılmadı. Catalog QA’nın `BLOCKED` olması beklenen 8G-9B durumudur; bu bir
production catalog PASS değildir.

## PRODUCTION WRITE

**NO.** Production DB’ye write/DDL/migration/promotion yapılmadı.

## PRODUCTION PAYMENT

**NO.** Gerçek checkout/charge/refund/cancel ve production provider çağrısı yapılmadı.

## 8G-8

**OPEN.** Production DB/deployment target/identity, staging ve backup/restore kanıtı eksik.

## 8G-9B

**OPEN.** Production-grade gerçek curriculum catalog ve Level/Skill/content/template/question
relation release’i eksik; catalog QA BLOCKED kalır.

## IYZICO SANDBOX

**BLOCKED / NOT RUN.** Local adapter/signature/replay/mocked billing contract’ları mevcut; credential,
merchant activation, plan reference ve reachable HTTPS callback yok.

## REMAINING BLOCKERS

1. Deployment target/provider, staging ve production identity’nin seçilip doğrulanması.
2. Production secret manager binding, default secret rejection, secure auth storage ve security hardening.
3. `/ready` veya eşdeğer readiness probe, metrics/alerts ve on-call evidence.
4. Production backup + restore proof ve migration rehearsal.
5. 8G-8 production DB/deployment blocker.
6. 8G-9B production curriculum catalog blocker.
7. iyzico sandbox activation/credentials/plan/callback; ardından production payment activation.

## FINAL RECOMMENDATION

**8I-1 local readiness contract PASS; production promotion NO-GO.** Runbook ve environment matrix
kullanıma hazırdır; ancak production bağlantısı, write, catalog promotion ve real payment yapılmamalıdır.
Önce deployment target + staging + backup/restore + readiness/security gates, sonra 8G-8, 8G-9B ve
iyzico bağımlılıkları kapatılmalıdır.
