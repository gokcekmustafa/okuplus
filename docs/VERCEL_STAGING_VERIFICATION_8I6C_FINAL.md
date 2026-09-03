# Oku+ — Vercel Preview + Neon Staging Verification (8I-6C Recovery)

**Tarih:** 2026-09-03  
**STATUS:** **BLOCKED**  
**Scope:** Yalnız verilen Vercel Preview URL’sinin ve GitHub source ilişkisinin doğrulanması. Production kapsam dışıdır.

## Given deployment claim

```text
Environment: Preview
Branch: staging
Deployment: Ready
URL: https://okuplus-jutu0q3ho-gokcekmustafas-projects.vercel.app
Claimed source commit: bfa95db
```

Bu alanlar kullanıcı tarafından sağlanan deployment bilgisi olarak kabul edildi; Vercel hesap/API erişimi olmadan bağımsız gerçeklik kanıtı sayılmadı.

## GitHub verification

Read-only git kontrolü:

```text
repository: https://github.com/gokcekmustafa/okuplus.git
origin/master:  bfa95dbcaf34e70e7e992aa7c0334e87c8e13839
origin/staging: bfa95dbcaf34e70e7e992aa7c0334e87c8e13839
local HEAD:     bfa95dbcaf34e70e7e992aa7c0334e87c8e13839
worktree:       CLEAN
```

GitHub branch heads claimed `bfa95db` ile eşleşiyor. Bu, Vercel deployment’ın gerçekten bu commit’ten üretildiğini tek başına kanıtlamaz; Vercel deployment metadata’sına erişim yoktur.

## Hosted URL result

URL HTTPS üzerinden erişilebilir ve `Server: Vercel` header’ı döner. Ancak aşağıdaki yolların tamamı Oku+ response’u yerine Vercel login sayfasını döndürdü:

| Path               | HTTP | Content-Type | Body/title       | Oku+ kanıtı |
| ------------------ | ---: | ------------ | ---------------- | ----------- |
| `/`                |  200 | `text/html`  | `Login – Vercel` | **NO**      |
| `/health`          |  200 | `text/html`  | `Login – Vercel` | **NO**      |
| `/health/db`       |  200 | `text/html`  | `Login – Vercel` | **NO**      |
| `/ready`           |  200 | `text/html`  | `Login – Vercel` | **NO**      |
| `/auth/me`         |  200 | `text/html`  | `Login – Vercel` | **NO**      |
| `/billing/catalog` |  200 | `text/html`  | `Login – Vercel` | **NO**      |

Sonuç: URL, Vercel katmanında erişilebilir olsa da public Oku+ Fastify Function response’u değildir. Bu durum Vercel deployment protection/auth gate veya yanlış/public olmayan alias ile açıklanabilir; yetkili Vercel session olmadan ayrıştırılamaz.

Vercel login sayfasındaki `Access-Control-Allow-Origin: *` header’ı Oku+ CORS sonucu olarak değerlendirilmedi. Aynı nedenle login HTML’inden `DATABASE_URL`, `APP_ENV`, Neon identity, migration status veya application CSP/security sonucu çıkarılmadı.

## Environment and database verification

| Kontrol                                  | Sonuç                          | Gerekçe                                                                                                    |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Vercel Preview `DATABASE_URL` configured | **NOT VERIFIABLE**             | Function response yerine login HTML’i geliyor; dashboard/API erişimi yok.                                  |
| `APP_ENV=staging`                        | **NOT VERIFIABLE**             | Application runtime response erişilebilir değil.                                                           |
| Neon staging DB reachable                | **NOT VERIFIABLE**             | `/health/db` application JSON’i dönmedi.                                                                   |
| Staging fingerprint                      | **NOT AVAILABLE**              | Neon direct/pooled URL veya account erişimi yok.                                                           |
| TEST fingerprint comparison              | **NOT RUN**                    | TEST reference `544e7a658f0cfde80642ba9f65b4b80db6f1d4cbc3be72dba938c4d7eeb7dd4e`; staging hash alınamadı. |
| Remote migration status                  | **NOT RUN**                    | Neon DB’ye erişim yok.                                                                                     |
| Production data/PII/payment              | **NOT VERIFIED, NOT ACCESSED** | Production bağlantısı kurulmadı; uygulama response’u alınamadı.                                            |

Mevcut repository’nin executable Prisma contract’ı `DATABASE_URL`’dir; `DIRECT_DATABASE_URL`/`DIRECT_URL` kullanılmaz. Vercel environment’ına bir direct variable eklenmiş olsa bile mevcut uygulama onu otomatik kullanmaz.

## Hosted regression result

Hosted response gerçek Oku+ API olmadığı için aşağıdakiler çalıştırılmadı ve PASS olarak yazılmadı:

- signup/login/logout/login;
- personal context/onboarding/learning path/exercise/question/answer/completion;
- XP/streak/progress;
- Personal A/B/Organization tenant isolation;
- billing account/premium UI;
- iyzico sandbox/mock webhook;
- CORS/CSP/application security headers;
- Vercel logs redaction;
- browser smoke;
- real-device mobile web smoke;
- cold/warm/DB latency observation.

Native mobile test bu görevin kapsamı değildir. Gerçek cihaz smoke için public, authenticated Oku+ Preview URL gerekir.

## Static source and known risks

Local source audit sonucu:

- Fastify + Prisma + vanilla SPA mimarisi Vercel Node Function için uyumludur.
- WebSocket, worker veya server cron yok; WebSocket **NOT APPLICABLE**.
- Rate limiter `Map` tabanlı ve **process-local**; Vercel multi-instance ortamında distributed değildir — **HIGH RISK**.
- Browser auth bearer tokenları localStorage’da tutuluyor; Secure/HttpOnly/SameSite cookie kanıtı yok — production için **HIGH RISK**.
- iyzico webhook route parsed body’yi yeniden JSON serialize ediyor; raw-body signature davranışı hosted olarak doğrulanamadı — **BLOCKED for production**.

## Local regression

Önceki local validation ve bu recovery baseline’ı:

- 37/37 test file, 636/636 test: **PASS**
- lint, format, typecheck, build: **PASS**
- Prisma validate/status: **PASS**, 14 migration current
- compiled local `/`, `/health`, `/health/db`, `/ready`: **PASS**, 200

Local PASS, hosted PASS yerine geçmez.

## Safety boundary

```text
Vercel project/deployment change: NO
Neon project/branch/database change: NO
Vercel/Neon secret read/create: NO
remote migration/write: NO
production deploy/DB/payment/catalog/domain/secret: NO
```

## Final decision

**8I-6C Recovery: BLOCKED.** GitHub branch/source baseline doğrulandı ve verilen hostname Vercel katmanında erişilebilir; fakat gerçek Oku+ Preview response’u, `DATABASE_URL`, `APP_ENV`, Neon staging database, migrations, fingerprint, auth/student/tenant/billing smoke ve mobile smoke doğrulanamadı.

Yetkili Vercel/Neon hesabıyla deployment protection kaldırılmadan veya güvenli biçimde authenticated smoke erişimi sağlanmadan hosted PASS verilmemelidir. Production değişkenlerine veya production kaynaklarına dokunulmamalıdır.
