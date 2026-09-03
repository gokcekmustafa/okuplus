# Oku+ — Vercel + Neon Ortam ve Veri Stratejisi (8I-6B-R)

## Hedef ortam matrisi

| Ortam          | Vercel karşılığı                                                | Neon karşılığı                                               | Veri politikası                                       | Deploy/migration                                        |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| **LOCAL**      | `npm run dev` / local process                                   | local PostgreSQL veya kişisel Neon branch                    | geliştirici fixture’ı; secret `.env` dışında tutulmaz | `prisma migrate dev` yalnız local                       |
| **TEST**       | CI/local test runner                                            | disposable local DB veya isolated test branch                | sentetik/fixture; production PII yok                  | test öncesi kontrollü reset/apply                       |
| **PREVIEW**    | Vercel Preview URL, PR/deployment başına                        | Preview başına Neon branch; tercihen schema-only + synthetic | production’dan veri kopyalanmaz                       | migration branch üzerinde, deploy’dan önce              |
| **STAGING**    | Vercel custom `staging` env veya stable `staging` branch/domain | ayrı staging project/branch                                  | sentetik veya anonimleştirilmiş acceptance verisi     | tek release migration job; smoke/regression             |
| **PRODUCTION** | Vercel Production branch/domain                                 | production Neon project/branch                               | gerçek müşteri verisi                                 | approval sonrası ayrı migration release; rollback planı |

Vercel varsayılan Local/Preview/Production ortamlarını ve Pro/Enterprise custom environment’larını dokümante ediyor: [Vercel Environments](https://vercel.com/docs/deployments/environments). Git push/PR Preview deployment üretir; production branch davranışı için [Deploying Git Repositories](https://vercel.com/docs/git) kullanılmalı.

## Değişken sözleşmesi

Mevcut repo env şemasındaki anahtarlar korunur; hosted kurulumda değerler ortama göre ayrı girilir.

### Ortak backend değişkenleri

```text
APP_ENV=development|test|staging|production
NODE_ENV=development|test|production
DATABASE_URL=<runtime PostgreSQL URL>
JWT_SECRET=<environment-specific, >=32 chars>
CORS_ORIGIN=<explicit HTTPS origin allowlist>
LOG_LEVEL=info|warn|error
RATE_LIMIT_WINDOW_SECONDS=...
RATE_LIMIT_MAX=...
RATE_LIMIT_AUTH_MAX=...
RATE_LIMIT_BILLING_MAX=...
RATE_LIMIT_WEBHOOK_MAX=...
RATE_LIMIT_PILOT_MAX=...
```

### Prisma bağlantı ayrımı

Runtime URL Neon pooled endpoint olmalı:

```text
DATABASE_URL=postgresql://...@...-pooler.../oku_plus?sslmode=require&connect_timeout=10&pool_timeout=10
```

Migration için ayrı direct URL önerilir:

```text
DIRECT_URL=postgresql://...@.../oku_plus?sslmode=require
```

Mevcut `prisma/schema.prisma` datasource’u yalnız `DATABASE_URL` kullanıyor. Bu rapor uygulama kodunu/schema’yı değiştirmiyor. Uygulama adımında iki güvenli seçenekten biri seçilmeli:

1. Prisma datasource’a `directUrl = env("DIRECT_URL")` ekleyip runtime query URL’sini pooled bırakmak; veya
2. migration job’da Prisma’ya explicit direct URL override etmek.

Her invocation’da `prisma migrate deploy` çalıştırmak yasaktır: migration release pipeline’ının tekil, log’lanabilir ve approval’lı adımı olmalıdır. Neon’un Prisma migration rehberi: [Schema migration with Neon + Prisma](https://neon.com/docs/guides/prisma-migrations). Pooling rehberi: [Connection pooling](https://neon.com/docs/connect/connection-pooling).

## Preview branch ve data isolation

Önerilen Preview akışı:

```text
PR açılır
  → Neon preview branch (schema-only/synthetic)
  → migration branch üzerinde uygulanır
  → Vercel Preview DATABASE_URL branch pooled URL’i alır
  → smoke + auth + DB + UI checks
  → PR kapanınca branch cleanup
```

Neon branch’leri copy-on-write ve izole çalışma modeli sunar; Vercel native integration Preview başına branch oluşturabilir: [Neon branching introduction](https://neon.com/docs/guides/branching-intro), [Neon–Vercel native integration](https://neon.com/blog/neon-vercel-native-integration).

Branch’in parent data’sını otomatik olarak güvenli kabul etmeyin. Oku+ Preview için gerçek production PII’si kopyalanmamalı; schema-only veya sentetik seed kullanılmalı. Preview’dan Production DB’ye `DATABASE_URL` bağlamak açıkça yasaktır.

## Staging release contract

Vercel’de plan destekliyorsa `staging` custom environment; değilse ayrı `staging` branch + stable domain önerilir. `master` üzerinde mevcut release baseline’ın bulunması, bu raporda branch mapping’in otomatik olarak değiştirildiği anlamına gelmez.

Staging env’inde:

- `APP_ENV=staging`, `NODE_ENV=production` (platform runtime semantics için) seçimi uygulama deploy öncesi doğrulanmalı;
- staging Neon branch/project URL’si kullanılmalı;
- iyzico yalnız sandbox credential/plan/callback ile çalışmalı;
- `CORS_ORIGIN` yalnız staging frontend originini içermeli;
- JWT secret production’dan farklı olmalı;
- rate limiter global değildir; staging smoke’larında bu sınırlama not edilmeli;
- migration job deploy’dan önce bir kez çalışmalı ve `/ready` sonucu gözlenmeli.

Vercel env variable kapsamı ve branch-specific değerleri için: [Manage environment variables](https://vercel.com/docs/environment-variables/manage-across-environments).

## Production secret ve domain sözleşmesi

Production’da en az şu değerler yalnız server-side encrypted secret olarak tutulmalı:

- pooled `DATABASE_URL` ve migration direct URL;
- JWT secret;
- iyzico production key/secret/merchant/plan references yalnız ayrı billing go kararı sonrası;
- sosyal login audience/client ID’leri, gerekiyorsa server-side config.

Public/browser env’e DB URL, JWT secret, iyzico secret veya refresh token taşınmaz. Custom domain ve HTTPS kurulumu hesap adımıdır; bu validation’da yapılmadı. API ve SPA ayrı domain’lere bölünürse explicit CORS, credentials, cookie SameSite ve callback URL’leri birlikte güncellenmelidir. İlk Vercel denemesinde same-origin SPA + API daha az CORS riski taşır.

## Auth stratejisi

Mevcut server-side model DB-backed session/refresh rotation ve JWT access token kullanıyor; stateless Function + Neon için uygundur. Production hardening:

- access/refresh tokenların localStorage’da tutulması XSS durumunda risklidir;
- HttpOnly + Secure + uygun SameSite cookie modeli değerlendirilmelidir;
- cross-site frontend varsa CSRF ve `credentials` testi eklenmelidir;
- origin allowlist wildcard olmamalı;
- Preview/Staging/Production JWT secrets birbirinden farklı olmalı;
- logout/revoke ve refresh rotation DB transaction/advisory lock testleri korunmalı.

## Rate limit, observability ve recovery

Mevcut `Map` limiter her Function process’inde ayrı state’tir. Bu, tek warm instance’ta abuse protection sağlar ancak Vercel scale-out/cold-start durumunda global limit sağlamaz. Production seçeneği edge/managed limiter veya Redis-backed shared store’dur.

Pino redaction, `X-Request-ID`, security headers ve generic error response iyi başlangıçtır. Vercel dashboard logları, retention/alerts ve gerekiyorsa log drain hesapta yapılandırılmalı. Neon restore window/PITR/backup retention plan bazında doğrulanmalı: [Neon projects](https://neon.com/docs/manage/projects). Bu rapor gerçek production backup kanıtı oluşturmaz.

## Ortamlar arası yasaklar

- Preview/Staging → Production `DATABASE_URL` reuse yok.
- Production secret → Preview/Staging kopyalama yok.
- Production PII → Preview branch seed yok.
- `migrate deploy` Function startup/invocation içinde yok.
- Sandbox iyzico endpoint/credential’i Production billing diye adlandırma yok.
- Vercel account integration veya real domain mapping bu aşamada yapılmadı.

## Uygulama sırası

1. Vercel Preview + Neon isolated branch ile read-only/health/static smoke.
2. Pooled runtime + direct migration URL wiring ve migration job.
3. Staging custom env/domain, synthetic data, auth/DB/regression.
4. Distributed rate limit ve webhook raw-body/abort hardening.
5. Backup/restore evidence, observability alert, custom-domain/cookie validation.
6. Ayrı billing ve production go/no-go onayı.
