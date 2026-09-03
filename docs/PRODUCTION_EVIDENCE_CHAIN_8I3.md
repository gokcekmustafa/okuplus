# OKU+ — 8I-3 Production Evidence Chain

**Audit tarihi:** 2026-09-03  
**Kural:** Bu belge production’a bağlanmaz, secret göstermez, production write/payment/catalog
oluşturmaz. Kanıt olmayan alanlar UNKNOWN, NOT VERIFIED veya BLOCKED olarak kalır.

## 1. Deployment platform discovery

Repository’de doğrulanan uygulama modeli Node.js `>=20`, Fastify API, `public/` statik SPA ve
PostgreSQL/Prisma’dır. `package.json` içinde `build`, `start`, `dev`, test ve QA script’leri bulunur;
`src/server.ts` migration çalıştırmadan `HOST`/`PORT` üzerinden listener açar.

Repository taramasında Dockerfile, Compose, Procfile, Vercel/Railway/Render/Fly manifesti,
Kubernetes/Helm manifesti, GitHub Actions workflow’u, README veya release script’i bulunmadı.
Git remote `origin` configured değil ve repository’de commit yok. Sonuç:

| Alan              | Sonuç                                                     |
| ----------------- | --------------------------------------------------------- |
| PLATFORM          | **UNKNOWN**                                               |
| SERVICE           | **UNKNOWN**                                               |
| DEPLOYMENT SOURCE | **UNKNOWN**                                               |
| APP RUNTIME       | **CONFIRMED** — Node.js >=20 + Fastify + static `public/` |
| RELEASE ARTIFACT  | **UNKNOWN**                                               |
| PRODUCTION URL    | **UNKNOWN**                                               |

Platform, service name veya deploy komutu tahmin edilmemiştir.

## 2. GitHub / CI-CD audit

`.github/workflows` ve diğer workflow dosyaları yoktur. Bu nedenle deploy target, environment name,
production branch, deployment job ve repository secret isimleri için repository kanıtı yoktur.

| Kanıt                        | Durum                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| GitHub Actions workflow      | **MISSING** — repository’de workflow yok                                             |
| Production branch strategy   | **UNKNOWN** — branch/release politikası yok; çalışma checkout’ı `master`, commit yok |
| Deployment secret names      | **UNKNOWN** — workflow yok; değerler aranmadı/gösterilmedi                           |
| Secret existence/value       | **UNKNOWN** — provider veya secret manager bilinmiyor                                |
| CI artifact digest/signature | **UNKNOWN**                                                                          |

Local `.env` yalnız local/test çalışma kanıtıdır; production secret manager veya environment
binding’i hakkında çıkarım yapılmamıştır.

## 3. Environment evidence matrix

Durumlar: `KNOWN`, `UNKNOWN`, `NOT USED`. `KNOWN` hücrelerindeki açıklamalar secret değerlerini
içermez.

| Alan    | LOCAL                                                        | TEST                                                           | STAGING     | PRODUCTION  |
| ------- | ------------------------------------------------------------ | -------------------------------------------------------------- | ----------- | ----------- |
| APP     | **KNOWN** — local Fastify listener                           | **KNOWN** — local TEST runner                                  | **UNKNOWN** | **UNKNOWN** |
| API     | **KNOWN** — SPA ile same-origin                              | **KNOWN** — SPA ile same-origin                                | **UNKNOWN** | **UNKNOWN** |
| DB      | **KNOWN** — local `.env` verified TEST DB’yi kullanıyor      | **KNOWN** — `127.0.0.1:5432/oku_plus_test/public`              | **UNKNOWN** | **UNKNOWN** |
| AUTH    | **KNOWN** — JWT bearer; local secret set, değer gösterilmedi | **KNOWN** — aynı local TEST config                             | **UNKNOWN** | **UNKNOWN** |
| STORAGE | **KNOWN** — `public/` statik dosya                           | **KNOWN** — external object storage yok                        | **UNKNOWN** | **UNKNOWN** |
| REDIS   | **NOT USED** — dependency/config yok                         | **NOT USED** — dependency/config yok                           | **UNKNOWN** | **UNKNOWN** |
| BILLING | **KNOWN** — sandbox-only adapter mevcut, credential yok      | **KNOWN** — mock/test contract; gerçek provider activation yok | **UNKNOWN** | **UNKNOWN** |

Production için APP/API/DB/AUTH/STORAGE/REDIS/BILLING alanlarının hiçbiri runtime’dan doğrulanmadı.

## 4. Production DB discovery

Repository’de production DB connection binding’i yoktur. `.env.example` yalnız placeholder içerir;
local `.env` güvenli parse ile TEST hedefi olarak kullanılmış, full connection string rapora alınmamıştır.

| Production DB alanı    | Sonuç            |
| ---------------------- | ---------------- |
| Host                   | **UNKNOWN**      |
| Port                   | **UNKNOWN**      |
| Database               | **UNKNOWN**      |
| Provider               | **UNKNOWN**      |
| SSL/TLS requirement    | **UNKNOWN**      |
| Schema                 | **UNKNOWN**      |
| Secret manager binding | **UNKNOWN**      |
| Runtime connectivity   | **NOT VERIFIED** |

Production DB’ye bağlanılmadı. `oku_plus_test` production yerine kullanılmayacaktır.

## 5. DB fingerprint protocol

[`scripts/db-fingerprint.ts`](../scripts/db-fingerprint.ts) aşağıdaki güvenlik sınırlarını uygular:

- `DB_FINGERPRINT_ENVIRONMENT` değerini `LOCAL|TEST|STAGING|PRODUCTION` olarak açıkça ister.
- `DB_FINGERPRINT_DATABASE_URL` ister; `DATABASE_URL` fallback’i yoktur.
- Yalnız PostgreSQL URL kabul eder.
- Server identity (`inet_server_addr`, port, version), current database/schema/user, migration state
  ve public column schema’yı read-only sorgularla alır.
- `schema.prisma`, migration manifest hash’i, live schema hash’i, last applied migration ve
  environment’i birleştirerek combined fingerprint üretir.
- `INSERT/UPDATE/DELETE/DDL` çalıştırmaz; `productionWrite: NO` raporlar.

Production doğrulama, yalnız authorized source ve secret manager’dan alınan hedef ile aşağıdaki
şablonda yapılmalıdır; bu komut 8I-3’te çalıştırılmadı:

```powershell
$env:DB_FINGERPRINT_ENVIRONMENT = "PRODUCTION"
$env:DB_FINGERPRINT_DATABASE_URL = "<secret-manager-injected-verified-production-url>"
npm run db:fingerprint
Remove-Item Env:DB_FINGERPRINT_ENVIRONMENT, Env:DB_FINGERPRINT_DATABASE_URL
```

TEST referansı:

`544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`

Production fingerprint şu anda **NOT GENERATED**’dır. Promotion öncesi production fingerprint,
TEST fingerprint’inden farklı DB identity ve environment göstermeli; yalnız hash’in farklı olması
tek başına yeterli sayılmamalıdır.

## 6. Staging

Staging service, staging DB, staging URL veya staging secret binding repository’de bulunamadı:
**STAGING = NOT CONFIRMED / UNKNOWN**.

Production ile aynı DB kullanıldığına dair kanıt yoktur; ancak ayrı DB kanıtı da yoktur. Bu nedenle
ayrılık kanıtlanana kadar promotion **HIGH RISK / BLOCKED** kabul edilir. Minimum sözleşme:
ayrı service URL, ayrı DB, ayrı JWT/provider sandbox secret, aynı artifact, migration/fingerprint,
health/readiness/smoke/rollback rehearsal.

## 7. Production access boundary

Repository kişisel production credential veya gerçek deployment owner bilgisi içermez. Teknik rol
sınırı aşağıdaki gibi tanımlanmalıdır:

| Rol                    | Yetki sınırı                                                     | Mevcut kanıt               |
| ---------------------- | ---------------------------------------------------------------- | -------------------------- |
| Deployment owner       | provider/service release, deploy/rollback, artifact evidence     | **UNKNOWN / NOT ASSIGNED** |
| Database owner         | DB provisioning, backup/restore, migration approval, fingerprint | **UNKNOWN / NOT ASSIGNED** |
| Security/release owner | secret rotation, TLS/CORS, audit risk acceptance, observability  | **UNKNOWN / NOT ASSIGNED** |
| Billing owner          | iyzico merchant/plan/webhook activation, payment contract        | **UNKNOWN / NOT ASSIGNED** |
| Catalog owner          | authorized export, Level/Skill validation, promotion             | **UNKNOWN / NOT ASSIGNED** |

Gerçek kişi credential’ı istenmemiş, üretilmemiş veya raporlanmamıştır.

## 8. Production catalog evidence

Authorized catalog source repository’de yoktur. Local `oku_plus_test` kayıtları fixture olarak
sınıflandırılmıştır; `qa:curriculum-catalog` Level/Skill fixture, doğrudan Level→Skill relation
ve Content→Level schema eksikliği nedeniyle **BLOCKED** döner. Bu aşamada catalog oluşturulmadı.

Gerekli evidence chain:

```text
AUTHORIZED SOURCE
  → verified catalog export + owner/version/signature
  → Level/Skill identity validation
  → Level→Skill and Content→Level relation validation
  → content/question/template eligibility validation
  → isolated staging smoke
  → approved production promotion
```

`CATALOG = UNKNOWN`; fixture catalog production catalog değildir.

## 9. iyzico evidence

Production veya sandbox credential istenmedi, üretilmedi ve değeri raporlanmadı.

| Requirement                        | Durum       | Evidence                             |
| ---------------------------------- | ----------- | ------------------------------------ |
| Sandbox merchant                   | **MISSING** | Local env’de configured değil        |
| Sandbox API key                    | **MISSING** | Local env’de configured değil        |
| Sandbox secret                     | **MISSING** | Local env’de configured değil        |
| Sandbox plan reference             | **MISSING** | Monthly/yearly refs yok              |
| HTTPS callback URL                 | **MISSING** | Verified reachable callback yok      |
| Webhook activation                 | **UNKNOWN** | Provider panel/runtime kanıtı yok    |
| Webhook signature secret           | **UNKNOWN** | Activation/secret manager kanıtı yok |
| Production merchant/credential     | **UNKNOWN** | Production hesabı keşfedilmedi       |
| Production plan/webhook activation | **UNKNOWN** | Activation yapılmadı                 |

Kod tarafındaki sandbox-only adapter base URL’yi sandbox host ile sınırlar; signature-v3, stale/replay,
event-id idempotency ve billing transaction testleri local/mock contract’ta PASS’tir. Bu, gerçek iyzico
activation veya payment kanıtı değildir.

## 10. Runbook evidence check

| Runbook gate       | Durum                 | Not                                                      |
| ------------------ | --------------------- | -------------------------------------------------------- |
| Deployment         | **BLOCKED**           | Target/source bilinmiyor                                 |
| Migrations         | **PASS / TEST ONLY**  | TEST’te 14/14 güncel; production safety yok              |
| Backup             | **BLOCKED**           | Production backup evidence yok                           |
| Health             | **PASS / LOCAL TEST** | `/health` 200; production monitor unknown                |
| Readiness          | **PASS / LOCAL TEST** | `/ready` DB+migration kontrolü; production probe unknown |
| Smoke              | **PASS / LOCAL TEST** | Browser/QA local TEST; production URL yok                |
| Rollback           | **BLOCKED**           | Artifact/staging/restore rehearsal yok                   |
| Catalog validation | **BLOCKED**           | 8G-9B; fixture relation’ları yeterli değil               |
| Payment validation | **BLOCKED**           | iyzico activation/credential yok                         |

## 11. Security and dependency decision

Detaylı risk sınıflaması [Stage 8I-3 Final Report](./STAGE_8I3_FINAL_REPORT.md) ve 8I-2 security
belgesinde tutulur. Production için şu anda BLOCKER olanlar: unresolved HIGH audit zinciri,
unverified backup/restore, unknown secret rotation, localStorage bearer + CSP migration gap,
production catalog ve iyzico activation.

## 12. Test evidence

Tüm test/QA hedefleri local `oku_plus_test` ile sınırlı tutuldu:

- `npm test -- --reporter=dot`: **636/636 PASS**.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`: **PASS**.
- `npx prisma validate`, `npx prisma migrate status`: **PASS**.
- Browser 8F final, billing lifecycle, billing account UX, closed-pilot operations, curriculum pack:
  **PASS**.
- Curriculum pack QA ve fixture QA: **PASS / TEST read-only**.
- Curriculum catalog QA: **BLOCKED / expected 8G-9B**.
- Production write/payment/catalog promotion: **NO**.
