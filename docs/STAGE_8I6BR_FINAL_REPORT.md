# STAGE 8I-6B-R — Vercel + Neon Mimari Validasyon Final Raporu

**Tarih:** 2026-09-03  
**Proje:** Oku+  
**Scope:** Render staging blockage sonrası Vercel + Neon alternatifinin resmi doküman ve local repo kanıtı ile değerlendirilmesi.

## Final status

**STATUS: COMPLETED — architecture validation complete**  
**DECISION: DIRECTLY COMPATIBLE**  
**Production deploy:** NO  
**Production DB/Neon resource:** NO  
**Payment/catalog/iyzico real integration:** NO  
**Real secret/account integration:** NO  
**Existing Render config:** preserved; `render.yaml` deleted/overwritten değil.

Vercel Fastify desteği mevcut `src/server.ts` entrypoint’ini Node Function olarak çalıştırabilecek durumda. Özel adapter veya framework rewrite gerekmiyor. Buna karşılık production readiness için operational adaptation gerekir: Neon pooled connection, ayrı migration release, environment/data isolation, shared rate limit ve webhook raw-body/timeout kanıtı.

## Acceptance answers

| Alan              | Sonuç                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VERCEL**        | Fastify zero-config detection, `src/server.ts`, Node runtime ve Fluid Compute modeli uyumlu. Plan/runtime duration, bundle, payload ve region limitleri uygulanır.                       |
| **NEON**          | PostgreSQL wire-compatible; Prisma ile kullanılabilir. Runtime pooled `DATABASE_URL` (`-pooler`, `sslmode=require`) önerilir.                                                            |
| **FASTIFY**       | Mevcut `buildApp()` + `app.listen()` yapısı resmi Fastify deployment akışıyla uyumlu; custom adapter zorunlu değil.                                                                      |
| **PRISMA**        | Prisma 6 client mevcut modelle uyumlu; module-level client warm reuse için yeterli başlangıç. Pooling/migration ayrımı uygulama adımında netleştirilmeli.                                |
| **DATABASE**      | Runtime pooled URL; migration için direct URL veya controlled CI/job. Function invocation içinde migrate yok.                                                                            |
| **WEBHOOK**       | Route edilebilir ama production kabulü yok: parsed-body → JSON reserialization raw signature için risk; provider fetch abort timeout ve hosted sandbox retry/duplicate evidence gerekli. |
| **AUTH**          | DB-backed sessions/refresh rotation serverless modelle uyumlu. Browser localStorage tokenları XSS hardening konusu; exact CORS/cookie policy production öncesi.                          |
| **RATE LIMIT**    | Mevcut process-local `Map` düşük hacim koruması sağlar; Vercel scale-out’ta global değildir. Shared/edge/Redis limiter production gereksinimidir.                                        |
| **BILLING**       | iyzico sandbox billing state/idempotency/transaction kodu mevcut. Gerçek payment integration ve production billing açık bırakıldı.                                                       |
| **PREVIEW**       | PR/deployment başına Vercel Preview + isolated Neon branch; schema-only/synthetic data. Preview → Production DB bağlantısı yasak.                                                        |
| **STAGING**       | Vercel custom `staging` env veya stable staging branch/domain + ayrı Neon branch/project. Bu görevde kurulmadı.                                                                          |
| **SECURITY**      | Env secrets server-only; explicit HTTPS CORS; Pino redaction; HSTS production. Token storage ve distributed rate limit hardening açık.                                                   |
| **PERFORMANCE**   | Neon region Vercel region’a yakın seçilmeli; pooled URL connection exhaustion riskini azaltır. Hosted benchmark yapılmadı.                                                               |
| **POC**           | Gerçek Vercel/Neon POC çalıştırılmadı; hesap/integration intentionally kullanılmadı. Local build/test evidence çalıştırıldı.                                                             |
| **CODE CHANGES**  | Bu stage validation için uygulama koduna değişiklik yok. Dört architecture/report dokümanı eklendi. Önceki local baseline ve `render.yaml` korunuyor.                                    |
| **TESTS**         | Local gates çalıştırıldı; sonuçlar aşağıdaki evidence bölümünde. Hosted Preview, Neon branch ve real iyzico testi çalıştırılmadı.                                                        |
| **PRODUCTION NO** | Production deploy, production DB, custom domain, billing credential, secret veya catalog write yapılmadı.                                                                                |
| **8G-8 OPEN**     | OPEN; bu mimari validasyon kapatmaz.                                                                                                                                                     |
| **8G-9B OPEN**    | OPEN; bu mimari validasyon kapatmaz.                                                                                                                                                     |
| **IYZICO OPEN**   | OPEN; yalnız mevcut sandbox boundary değerlendirildi.                                                                                                                                    |

## Repo audit evidence

- `package.json`: Node `>=20`, Fastify 5, ESM, Prisma 6, `build`/`start` mevcut.
- `src/server.ts`: `buildApp`, graceful shutdown, `app.listen`.
- `src/app.ts`: auth, admin/student, billing, pilot, health ve static plugin kayıtları.
- `src/lib/prisma.ts`: env `DATABASE_URL`, transaction timeout, module-level Prisma client.
- `src/plugins/static.ts`: `public/` same-origin static.
- `src/plugins/security.ts`: security headers + process-local rate limit.
- `src/modules/health/routes.ts`: `/health`, `/health/db`, `/ready`.
- `src/modules/billing/routes.ts` ve service/provider: checkout/callback/webhook; signature/idempotency/transaction yaklaşımı.
- Server tarafında WebSocket, worker, queue, cron veya persistent local file storage bulunmadı.
- `vercel.json` veya separate `api/` adapter bulunmuyor; resmi Fastify detection sebebiyle bu tek başına eksik değildir.

## Local quality evidence

Bu stage sırasında local test PostgreSQL instance’ı yalnız `D:\oku-plus\.tmp\postgres-8b` altında başlatıldı ve test/smoke tamamlandıktan sonra durduruldu. Remote/shared/production DB kullanılmadı.

Çalıştırılan komutlar:

```text
npm test -- --reporter=dot
npm run lint
npm run format:check
npm run typecheck
npm run build
npx prisma validate
npx prisma migrate status
```

Sonuç:

- `npm test -- --reporter=dot`: **PASS — 37/37 test files, 636/636 tests**.
- `npm run lint`: **PASS**.
- `npm run format:check`: **PASS**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npx prisma validate`: **PASS**.
- `npx prisma migrate status`: **PASS — Database schema is up to date; 14 migrations found**.
- Compiled local smoke: **PASS** — `/`, `/health`, `/health/db`, `/ready` returned 200; `/ready` returned `ready: true`.

İlk full-test denemesi, yalnız local PostgreSQL data directory’sinin sekiz migration gerisinde olması nedeniyle 20 failure verdi. Local-only `npx prisma migrate deploy` sonrasında suite yeniden çalıştırıldı ve yukarıdaki PASS sonucu alındı. Bu migration hiçbir remote/shared/production database’e uygulanmadı.

`npm audit --omit=dev --audit-level=high` önceki baseline’da 3 HIGH advisory bildirdi; force upgrade çalıştırılmadı ve bu stage’de güvenlik kararı olarak saklandı.

## Resmi karar kaynakları

- [Vercel — Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify)
- [Vercel — Fastify deployment guide](https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel)
- [Vercel — Functions limits](https://vercel.com/docs/functions/limitations)
- [Vercel — Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Vercel — Environments](https://vercel.com/docs/deployments/environments)
- [Vercel — Environment variables](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Neon — Connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon — PostgreSQL compatibility](https://neon.com/docs/reference/compatibility)
- [Neon — Prisma migrations](https://neon.com/docs/guides/prisma-migrations)
- [Neon — Vercel native integration](https://neon.com/blog/neon-vercel-native-integration)
- [Neon — Projects, restore window](https://neon.com/docs/manage/projects)

## Remainings / blockers

1. Vercel Preview + Neon isolated branch hosted POC.
2. `DATABASE_URL` pooled ve `DIRECT_URL` migration wiring; one-shot migration job.
3. Static asset/root/API route hosted smoke.
4. `staging` custom environment/branch/domain and synthetic dataset.
5. Webhook raw-body capture, provider timeout/abort, retry/duplicate/out-of-order evidence.
6. Distributed rate limiter.
7. Auth cookie/token storage hardening and CORS/callback domain validation.
8. Vercel logs/alerts, Neon backup/PITR/restore evidence, region/performance benchmark.
9. Dependency HIGH advisory remediation plan.
10. Separate iyzico production readiness and billing go/no-go.

## Final recommendation

**Vercel + Neon is recommended as the next staging foundation, subject to the listed blockers.** İlk güvenli adım gerçek account integration açmadan bu repo için hazırlanmış deployment contract’ı uygulamak değil, yetkili bir Preview/Neon isolated-branch POC planını yürütmektir. Hosted evidence, migration ve security gates tamamlanmadan Production’a geçiş önerilmez.

**Final:** 8I-6B-R architecture validation tamamlandı; karar **DIRECTLY COMPATIBLE**, production deployment kararı **NO-GO / not in scope**.
