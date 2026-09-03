# Oku+ — Vercel + Neon Mimari Doğrulaması (8I-6B-R)

**Tarih:** 2026-09-03  
**Kapsam:** Oku+ Fastify + Prisma + vanilla SPA backend’inin Vercel Node Functions ve Neon Postgres üzerinde çalışabilirliğinin read-only doğrulaması.  
**Güvenlik sınırı:** Bu çalışma Vercel/Neon hesabına bağlanmadı; deployment, production veritabanı, ödeme sağlayıcısı, katalog veya gerçek secret kullanılmadı. Mevcut `render.yaml` korunmuştur.

## Karar

**STATUS: COMPLETED — architecture validation complete**

**DECISION: DIRECTLY COMPATIBLE** — Vercel’in resmi Fastify entegrasyonu mevcut `src/server.ts` girişini tanıyabiliyor ve Fastify uygulamasını Node Function olarak çalıştırabiliyor. Uygulama mimarisini Next.js’e taşımak veya özel bir HTTP adapter yazmak gerekmiyor.

Bu karar “production’a hazır” anlamına gelmez. Vercel’e geçişte deployment sözleşmesi olarak şu kontrollü uyarlamalar zorunludur: Neon pooled runtime URL, ayrı migration bağlantısı/işi, Preview–Staging–Production veri izolasyonu, dağıtık rate limit, webhook raw-body/timeout doğrulaması ve production secret/domain kurulumu.

## Resmi platform bulguları

- Vercel, Fastify’i sıfır konfigürasyonla tek bir Vercel Function olarak deploy edebildiğini; `src/server.ts` gibi girişleri tanıdığını ve Fluid Compute kullandığını belirtiyor: [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify).
- Fastify’in Vercel’de Node 20+ ile mevcut uygulama olarak deploy edilebildiği ve örnek başlangıç akışında `fastify.listen()` kullanıldığı gösteriliyor: [How to ship a Fastify app on Vercel](https://vercel.com/kb/guide/ship-a-fastify-app-on-vercel).
- Node Function limitleri plan/runtime’a göre değişir; Fluid Compute açıkken limitler hâlâ request duration, bundle, memory ve payload sınırlarıyla bağlıdır: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations), [Configuring Functions](https://vercel.com/docs/functions/configuring-functions).
- Neon pooled bağlantı URL’si (`-pooler`) PgBouncer kullanır ve serverless bağlantı patlamasını azaltmak için önerilir: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).
- Neon, PostgreSQL wire uyumluluğu ve Prisma migration akışını destekler: [Neon compatibility](https://neon.com/docs/reference/compatibility), [Prisma migrations with Neon](https://neon.com/docs/guides/prisma-migrations).

## Mevcut mimari envanteri

| Alan           | Repo kanıtı                                                                 | Vercel + Neon sonucu                                                                                                         |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | `package.json`: Node `>=20`, Fastify 5, ESM                                 | Vercel Node runtime ile uyumlu; Edge runtime seçilmemeli.                                                                    |
| Entrypoint     | `src/server.ts` → `buildApp()` → `app.listen()`                             | Vercel Fastify detector’ın tanıdığı yapı; custom adapter gerekmiyor.                                                         |
| Routes/plugins | `src/app.ts`; auth, admin/student, billing, pilot, health, static           | Tek Node Function altında çalışabilir.                                                                                       |
| Prisma         | `src/lib/prisma.ts`; module-level client, development global cache          | Neon pooled `DATABASE_URL` zorunlu; Function instance’ları arasında in-memory paylaşım varsayılmamalı.                       |
| Static         | `@fastify/static`, `public/`, same-origin SPA                               | Uygulama kendi statik dosyalarını sunabilir; Vercel Preview’da asset dahil olma ve fallback gerçek preview ile doğrulanmalı. |
| Health         | `/health`, `/health/db`, `/ready`                                           | `/health` liveness; DB endpoint’leri bağlantı/migration gözlemi. Serverless’ta process readiness garantisi değildir.         |
| Shutdown       | SIGTERM/SIGINT → `app.close()` + `prisma.$disconnect()`                     | Uzun ömürlü host için yararlı; Vercel request lifecycle’ının yerine geçmez, korunabilir.                                     |
| WebSocket      | Server tarafında WebSocket plugin/route yok                                 | WebSocket uyumsuzluğu mevcut ürün için blocker değil; ileride ayrı realtime mimarisi gerekir.                                |
| Jobs/timers    | Server’da worker/queue/cron/setInterval yok                                 | Background worker bağımlılığı yok. Gelecek işler Function invocation/queue/cron sözleşmesiyle tasarlanmalı.                  |
| File storage   | Upload/file-system persistence yok; medya URL/hash metadata                 | Ephemeral filesystem blocker değil; kalıcı dosya ihtiyacı doğarsa object storage gerekir.                                    |
| CORS           | Açık origin allowlist, wildcard yok, credentials true                       | Ayrı frontend domain’inde exact Vercel/custom-domain originleri eklenmeli.                                                   |
| Rate limit     | `Map` ile process-local; kod yorumu production’da edge/Redis ister          | Uyumluluk var, production abuse-control için dağıtık limiter blocker/risk.                                                   |
| Auth/session   | JWT + DB-persisted refresh/session rotation; browser tokenları localStorage | DB-backed stateless Function modeline uyumlu; localStorage XSS riski ayrı hardening işidir.                                  |
| Billing        | iyzico sandbox, checkout/callback/webhook, Prisma transaction/idempotency   | Sync kısa request olarak çalışabilir; raw-body ve provider timeout doğrulanmadan production webhook açılmamalı.              |

## Vercel çalışma modeli

Vercel’e önerilen ilk şekil:

```text
Vercel Project (Node runtime / Fastify)
  ├─ src/server.ts  → tek backend Function
  ├─ public/        → same-origin SPA (bundling/asset smoke test gerekir)
  └─ /health, /ready, /api-style routes
           │
           └── DATABASE_URL (Neon pooled, sslmode=require)
                         │
                         └── Neon branch/project
```

Fluid Compute, aynı instance’ta concurrency ve warm reuse sağlayabilir; instance’lar yine pause/recycle edilebilir. Bu nedenle rate-limit bucket’ı, auth state’i, webhook deduplication’ı veya job state’i process memory’sine bırakılamaz. Oku+ auth ve billing state’i DB’de tuttuğu için bu riskin büyük kısmı model tarafından karşılanıyor; process-local rate limit tek belirgin dağıtık eksik.

## Endpoint ve lifecycle değerlendirmesi

| Sınıf               | Örnek                                         | Durum              | Not                                                                                                   |
| ------------------- | --------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Kısa read           | `/health`, catalog, subscription/payment read | Uygun              | DB round-trip ve Neon bölge seçimi izlenmeli.                                                         |
| DB write            | admin/student/progress/session                | Uygun              | Prisma transaction timeout’ları Vercel duration’dan kısa kalmalı.                                     |
| Auth                | `/auth/*`                                     | Uygun + hardening  | Session/refresh DB-backed; secret ve cookie/CORS kararı production öncesi.                            |
| Exercise            | session/question/attempt/progress             | Uygun              | Uzun süreli model/API çağrısı bulunmadı; mevcut servis süreleri ölçülmeli.                            |
| Billing checkout    | `/billing/checkout`, callback                 | Koşullu uygun      | Provider çağrısına explicit abort deadline eklenmeli; idempotency korunmalı.                          |
| Billing webhook     | `/billing/webhooks/iyzico`                    | Production blocker | İmza için gerçek raw bytes’ın handler’a ulaşması ve provider retry davranışı staging’de kanıtlanmalı. |
| Long-running/stream | Yok                                           | Uygunluk açığı yok | Vercel streaming bile max duration’a tabidir; indefinite stream varsayılmamalı.                       |

`src/server.ts` içindeki `listen()` çağrısı Vercel’in Fastify akışıyla çelişmiyor. `graceful-shutdown.ts` kaldırılmamalı; yalnızca Vercel’de SIGTERM’in her request sonrası bir process kapanışı gibi yorumlanmaması gerekir.

## Neon ve Prisma bağlantı stratejisi

Runtime için:

```text
DATABASE_URL=postgresql://...@...-pooler.../oku_plus?...&sslmode=require
```

Önerilen migration ayrımı:

```text
DATABASE_URL = pooled runtime URL
DIRECT_URL   = direct Neon URL, yalnızca kontrollü migration job/CI
```

Mevcut schema yalnızca `DATABASE_URL` tanımlıyor; bu dokümanda production schema veya env değişikliği yapılmadı. Uygulama aşamasında Prisma datasource için `directUrl` veya migration job override’ı seçilmeli. `prisma migrate deploy` her Function invocation’ında çalıştırılmamalı; release adımı olarak bir kez ve gözlemlenebilir biçimde çalıştırılmalı.

Neon bağlantı havuzu serverless concurrency için gereklidir ancak transaction/pool timeout’larının doğru seçilmesi, Vercel region ile Neon region’ın yakın olması ve Prisma client’ın invocation başına tekrar tekrar oluşturulmaması gerekir. Mevcut module-level client warm instance reuse için yeterli başlangıçtır; production ölçeği connection/latency ölçümü ile doğrulanmalıdır.

## Preview, Staging ve Production izolasyonu

Vercel varsayılan Local/Preview/Production ortamlarına ek olarak Pro/Enterprise hesaplarında custom environment kullanılabilir: [Vercel Environments](https://vercel.com/docs/deployments/environments), [environment variable management](https://vercel.com/docs/environment-variables/manage-across-environments).

Önerilen model:

- **Preview:** Her PR/deployment için Neon branch; schema-only veya sentetik veri. Production PII kopyalanmaz.
- **Staging:** `staging` branch veya Vercel custom `staging` environment + stable domain; ayrı Neon staging branch/project.
- **Production:** Production branch + production domain + yalnız production Neon branch/project.
- **Promosyon:** Preview/Staging DB’si Production’a bağlanmaz; uygulama deploy’u ve migration release’i ayrı onaylanır.

Neon’un Vercel entegrasyonu Preview başına branch sağlayabilir: [Neon–Vercel integration](https://neon.com/blog/neon-vercel-native-integration). Ancak branch’in başlangıç verisi ve PII politikası hesap/branch ayarlarıyla doğrulanmadan “izole” kabul edilmemelidir.

## Webhook ve billing sınırı

Mevcut servis tarafında signature, replay age, event idempotency, stale/terminal event ve DB transaction mantığı bulunuyor. Route ise `request.body` parsed ise onu JSON’a tekrar serialize ediyor. Bu, sağlayıcının imzayı orijinal byte dizisi üzerinden hesapladığı durumda canonical raw body ile aynı olduğunun varsayılmaması gerektiği anlamına gelir.

Production öncesi kabul şartları:

1. Fastify raw-body capture ile imza doğrulamasının gelen bytes üzerinde yapılması.
2. iyzico response/retry/timeout sözleşmesinin staging sandbox’ta gerçek örneklerle kanıtlanması.
3. Adapter provider `fetch` çağrılarına explicit `AbortController` deadline eklenmesi.
4. Aynı event’in iki kez gelmesi, farklı payload ile aynı event id’si ve out-of-order event testlerinin korunması.
5. Signature doğrulaması geçmeyen isteklerin güvenli status/response davranışının sağlayıcı retry politikasına göre seçilmesi.

Bu maddeler Vercel’in Fastify çalıştırmasına mimari engel değildir; production billing güvenlik kapısıdır.

## Güvenlik, performans ve operasyon

- Node runtime kullanılmalı; Prisma ve Fastify için Edge runtime seçilmemeli.
- JWT secret, iyzico key/secret ve DB URL yalnız Vercel encrypted env/secret mekanizmasında tutulmalı; client-visible/public env’e taşınmamalı.
- Production `CORS_ORIGIN` explicit HTTPS origin listesi olmalı. Ayrı domain kullanılırsa cookie/token ve `credentials` politikası birlikte test edilmeli.
- localStorage access/refresh token yaklaşımı XSS etkisini büyütür. Production için HttpOnly, Secure, SameSite cookie tabanlı oturum tasarımı ayrıca planlanmalı; bearer token sözleşmesi değiştirilecekse mobil istemcilerle birlikte versionlanmalı.
- Pino structured logging ve redaction mevcut; Vercel log retention, alert ve gerekirse drain hesabında ayrıca kurulmalı.
- `X-Request-ID`, health/DB/readiness ve generic error response mevcut. `/ready` migration state’i gözler; deployment platformunun instance readiness’i yerine geçmez.
- Process-local rate limit düşük hacimli koruma olarak kalabilir, production’da edge/Redis/managed limiter’a taşınmadan “global rate limit” iddiası kurulamaz.
- Neon backup/restore/PITR ve retention planı hesap seviyesinde kanıtlanmalı: [Neon projects / restore window](https://neon.com/docs/manage/projects). Bu çalışma production backup kanıtı üretmedi.
- `npm audit --omit=dev --audit-level=high` mevcut dependency setinde 3 HIGH advisory bildiriyor. `npm audit fix --force` çalıştırılmadı; Prisma major/downgrade değişimi ayrıca incelenmeli.

## POC ve code changes

**POC:** Vercel/Neon account veya CLI entegrasyonu bilerek çalıştırılmadı. Bu nedenle gerçek hosted preview URL’si, Vercel bundle/static asset sonucu, Neon pooled connection ve custom environment sonucu bu aşamada iddia edilmiyor.

**CODE CHANGES:** Bu validation için uygulama kodu değiştirilmedi. Önceki local release baseline’ındaki `render.yaml` değişiklikleri korunmuştur; `render.yaml` silinmemiştir.

**Local evidence:** `npm test -- --reporter=dot`, lint, format check, typecheck, build ve Prisma validate çalıştırıldı. Migration status sonucu aktif local test database’inde uygulanmamış migration listesi verirse bu, hosted validation sonucu değildir; staging/prod’a migration çalıştırıldığı anlamına gelmez.

## Sonuç

Vercel + Neon seçeneği Oku+ için **önerilebilir ve doğrudan uyumlu bir deployment yönüdür**. İlk uygulama sırası:

1. Vercel Preview + Neon schema-only/synthetic branch ile minimal hosted smoke test.
2. Pooled runtime URL ve ayrı migration job kanıtı.
3. Static asset, `/health`, `/ready`, auth ve Prisma connection smoke testleri.
4. Rate limit ve webhook raw-body/timeout hardening.
5. Stable staging domain/custom environment; ardından yalnız ayrı production approval ile production.

**8G-8 OPEN**, **8G-9B OPEN**, **IYZICO OPEN** kalır. Bu çalışma bu başlıkları kapatmaz ve production go kararı vermez.
