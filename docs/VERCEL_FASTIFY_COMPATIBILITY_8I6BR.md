# Oku+ — Vercel Fastify Uyumluluk Matrisi (8I-6B-R)

## A–H doğrudan yanıt

| Soru                                      | Yanıt                                                                   | Kanıt / risk                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Fastify mevcut haliyle çalışır mı?** | **Evet, Node runtime’da çalışabilir.**                                  | Vercel resmi Fastify dokümanı zero-config Fastify deployment’ını ve `src/server.ts` girişini tanıyor. Edge runtime seçilmemeli.               |
| **B. Entrypoint değişmeli mi?**           | **Zorunlu değil.**                                                      | Mevcut `src/server.ts` algılanan adlandırmalardan biridir. Vercel preview’da gerçek bundle/boot smoke test yine zorunlu.                      |
| **C. `listen()` sorun mu?**               | **Resmi Fastify akışında engel olarak belirtilmiyor.**                  | Vercel’in Fastify rehberinde `fastify.listen()` örneği var. Vercel’in Function wrapper’ı process modelini yönetir.                            |
| **D. Adapter gerekli mi?**                | **Özel adapter zorunlu değil.**                                         | Vercel Fastify desteği mevcut uygulamayı Function’a sarıyor. Custom `api/index` adapter’ı eklemek bu aşamada gereksizdir.                     |
| **E. Lifecycle nasıl değişir?**           | Uzun ömürlü server varsayımı bırakılmalı.                               | Fluid Compute warm instance/concurrency sağlayabilir ama instance pause/recycle olur; request sonrası process-local state güvenilir değildir. |
| **F. Graceful shutdown?**                 | Mevcut hook korunabilir, fakat Vercel liveness/readiness yerine geçmez. | SIGTERM/SIGINT cleanup uzun-lived host için faydalıdır; Vercel request completion’ı platform yönetir.                                         |
| **G. In-memory state?**                   | DB dışındaki server state için production’da güvenilmez.                | Rate-limit `Map` process-local; auth/billing state ise DB’de ve bu açıdan uygun.                                                              |
| **H. Background job?**                    | Mevcut backend’de worker/timer/cron/WebSocket yok.                      | Gelecek async işler `waitUntil`/cron/queue sözleşmesiyle ve max duration içinde tasarlanmalı; indefinite work için ayrı worker gerekir.       |

Resmi kaynaklar: [Vercel Fastify](https://vercel.com/docs/frameworks/backend/fastify), [Fastify deployment guide](https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel), [Fluid Compute](https://vercel.com/docs/fluid-compute), [Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js).

## Repo entrypoint ve startup

`src/server.ts` şu sözleşmeyi kullanıyor:

1. `dotenv/config` yükleniyor.
2. `loadEnv()` ile env doğrulanıyor.
3. `buildApp(env)` tüm Fastify plugin ve route’larını kuruyor.
4. graceful shutdown kaydediliyor.
5. `app.listen({ port, host })` çağrılıyor.

`package.json` Node `>=20`, `type: module`, `build: tsc -p tsconfig.build.json`, `start: node dist/server.js` kullanıyor. Vercel’in güncel Fastify detector’ı kaynak girişini doğrudan tanıyabildiğinden `vercel.json` veya Next.js migration gerekmiyor. Vercel’de seçilecek runtime Node olmalı; Prisma/Node API kullanan uygulama Edge’e taşınmamalı.

## Request lifecycle ve timeout

Uygulama Fastify seviyesinde:

- body limit: 1 MB default, env ile 10 MB’a kadar,
- connection timeout: 10 s default,
- request timeout: 30 s default,
- keep-alive timeout: 5 s default,
- Prisma transaction `maxWait`: 10 s, `timeout`: 30 s.

Vercel Function max duration plan/runtime’a bağlıdır: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations). Uygulama timeout’larının platform limitinden önce kontrollü response üretmesi hedeflenmeli. Provider `fetch` çağrıları için ayrıca `AbortController` deadline’ı eklenmesi gerekir; yalnız Vercel’in üst timeout’una güvenilmemeli.

Streaming ileride gerekirse Node 20+ ile mümkündür ancak indefinite stream değildir ve max duration’a tabidir: [Streaming Functions](https://vercel.com/docs/functions/streaming-functions).

## Route sınıfları ve uyumluluk

| Route grubu                      | Hosted Function değerlendirmesi                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                        | DB’siz liveness; kısa ve uygun.                                                                                                              |
| `/health/db`, `/ready`           | Neon round-trip; uygun, fakat monitoring probe’ları maliyet/latency bakımından ayarlanmalı. `/ready` serverless instance readiness değildir. |
| Auth/session                     | JWT imzalama + DB session/refresh rotation; uygun. Secret ve browser storage hardening ayrı.                                                 |
| Admin/student/content/progress   | Prisma read/write; uygun. Connection pooling ve transaction timeout izlenmeli.                                                               |
| Exercise/session                 | Senkron DB işlemleri; uygun. Gerçek hosted latency benchmark yapılmadı.                                                                      |
| Billing checkout/cancel/callback | Sync provider + DB işlemleri; duration ve provider timeout ile sınırlı. Idempotency korunmalı.                                               |
| `/billing/webhooks/iyzico`       | Platformda route edilebilir; production kabulü raw-body signature capture ve retry testine bağlı.                                            |
| Static `/`                       | `@fastify/static` ile `public/` sunuluyor. Vercel hosted smoke testinde asset path/cache/fallback doğrulanmalı.                              |

WebSocket plugin’i, server worker’ı, queue ve server cron’u bulunmadı. Tarayıcıdaki `setTimeout` kullanımları UI geri bildirimi içindir; server background job değildir.

## Static frontend

Oku+ vanilla SPA’dır; `public/index.html`, `/styles.css` ve `/app.js` same-origin olarak Fastify static plugin’inden sunulur. Uygulamada browser history router (`pushState`, `pathname`, `hashchange`) bulunmadı; bu nedenle Next.js rewrite veya framework migration gerekçesi yoktur.

Bu yine de hosted preview’da şu testleri gerektirir:

- `/` → `index.html`, CSS ve JS 200;
- asset URL’leri `/` ile doğru çözülüyor;
- `/health` API route’u static fallback tarafından yutulmuyor;
- mevcut callback/API path’leri HTML yerine beklenen JSON’i döndürüyor.

## Webhook raw body notu

`src/modules/billing/routes.ts` webhook handler’ı `request.body` string değilse `JSON.stringify(request.body)` yapıp `processIyzicoWebhook()` fonksiyonuna gönderiyor. Service katmanı `Uint8Array` ve signature doğrulaması kabul ediyor, fakat route seviyesinde original bytes’ın korunacağı garanti edilmiyor. Bu nedenle Vercel uyumluluk kararı **webhook production-ready** kararı değildir.

Gerekli küçük uygulama hardening’i: raw request bytes’ı capture eden Fastify yaklaşımı, imzayı bu bytes üzerinde doğrulama, provider request için abort deadline ve hosted sandbox retry/duplicate tests. Bunlar custom Vercel adapter değil; billing boundary hardening’idir.

## Lifecycle/state kararı

`src/lib/prisma.ts` production’da global cache kullanmıyor; module-level `PrismaClient` warm Function instance’ında yeniden kullanılabilir. Neon pooled URL ile birlikte bu kabul edilebilir başlangıçtır. Fluid Compute instance’larının concurrency ve recycle davranışı nedeniyle:

- rate limit `Map` global koruma olarak kabul edilmemeli;
- job queue, lock veya webhook deduplication memory’de tutulmamalı;
- mevcut DB-backed session, subscription, payment ve webhook event tabloları kullanılmalı;
- request sonrası kritik iş `waitUntil` ile ertelenmemeli; kritik DB commit response’dan önce tamamlanmalı.

Vercel’in `waitUntil()` API’si response sonrası iş için vardır ama iş yine invocation max duration’ına tabidir: [Vercel Functions API Reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).

## Uyumluluk sonucu

**Fastify:** DIRECTLY COMPATIBLE.  
**Custom adapter:** NOT REQUIRED.  
**Deployment adaptation:** REQUIRED (env, Neon pool/migration, distributed rate limit, webhook raw body, hosted static smoke test).  
**Architecture rewrite:** NOT REQUIRED.  
**Real Vercel POC:** Bu görevde çalıştırılmadı; hesap/integration kullanılmadı.
