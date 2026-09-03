# Oku+ — Vercel Hosted Staging Deployment (8I-6C)

**Tarih:** 2026-09-03  
**STATUS:** **BLOCKED — Vercel/Neon hesap erişimi doğrulanamadı**  
**Scope:** staging/POC only. Production deployment, production database, production payment, production catalog, production domain veya production secret kullanılmadı.

## Sonuç

GitHub release kaynağı güncellendi ve normal fast-forward push ile remote’a gönderildi:

- repository: `https://github.com/gokcekmustafa/okuplus`
- branch: `master`
- local/remote SHA: `6590e7d7b78cc9fb0392d20b24dfaa25cec2816f`
- push: `2f7d598..6590e7d master -> master`
- force push: **NO**
- tracked secret scan: **PASS** — `.env.example` dışında hassas filename adayı yok; tracked source içinde private key/full credential pattern bulunmadı.

Vercel/Neon hosted POC başlatılamadı. Windows browser automation helper iki kez altyapı hatası verdi; Vercel CLI ve GitHub CLI kurulu değil; environment içinde Vercel/Neon credential adı bulunmadı. Hesap veya token tahmin edilmedi.

## Hesap ve kaynak kanıtı

| Kabul şartı                   | Sonuç                     | Kanıt                                                |
| ----------------------------- | ------------------------- | ---------------------------------------------------- |
| Vercel account verified       | **BLOCKED**               | Authorized browser/CLI session yok.                  |
| Vercel project exists         | **NOT CREATED**           | `okuplus-staging` / `okuplus` oluşturulmadı.         |
| Correct GitHub repo connected | **NOT VERIFIED**          | Vercel UI/API erişimi yok; GitHub remote repo doğru. |
| Neon account/project          | **BLOCKED / NOT CREATED** | Neon account/API access yok.                         |
| Separate staging DB           | **NOT CREATED**           | No remote DB resource or URL exists locally.         |
| Vercel URL/HTTPS              | **NOT AVAILABLE**         | Hosted deployment başlamadı.                         |
| Production resource           | **NO**                    | Oluşturulmadı ve erişilmedi.                         |

## Yetkili POC sözleşmesi

Hesap erişimi sağlandığında yalnız şu kaynaklar kullanılmalı:

```text
GitHub repository: gokcekmustafa/okuplus
Branch: master
Vercel project: okuplus-staging (veya naming çakışmıyorsa okuplus)
Runtime: Node.js, mevcut Fastify detector
Entrypoint: src/server.ts
Build: npm ci && npm run build
Start: npm start
Environment: Preview veya custom staging
Database: separate Neon staging project/branch
```

Next.js dönüşümü ve `src/server.ts` değişikliği gerekmez. Vercel’in resmi Fastify desteği Fastify backend’i zero-config Function olarak çalıştırır ve `src/server.ts` girişini tanır: [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify). Node Function duration, bundle, payload ve memory limitleri uygulanmaya devam eder: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations).

## Environment güvenliği

Vercel’e yalnız staging/Preview scope’unda, secret manager üzerinden girilmesi gereken değerler:

```text
DATABASE_URL=<Neon pooled staging URL>
DIRECT_DATABASE_URL=<Neon direct migration URL>
JWT_SECRET=<unique staging secret>
CORS_ORIGIN=<exact staging HTTPS origin>
APP_ENV=staging
NODE_ENV=production
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
IYZICO_API_KEY=<optional authorized sandbox value>
IYZICO_SECRET_KEY=<optional authorized sandbox value>
IYZICO_MERCHANT_ID=<optional authorized sandbox value>
IYZICO_SUBSCRIPTION_PLAN_MONTHLY=<optional sandbox plan>
IYZICO_SUBSCRIPTION_PLAN_YEARLY=<optional sandbox plan>
IYZICO_CHECKOUT_CALLBACK_URL=<exact staging HTTPS callback>
```

Gerçek iyzico credential yoksa değerler **unset/NOT RUN** bırakılmalı. Placeholder değerler ödeme testi geçmişi sayılmaz. Production environment variable scope’u oluşturulmadı.

Vercel env kapsamı ve branch-specific değerler için [Manage environment variables](https://vercel.com/docs/environment-variables/manage-across-environments) kullanılmalı. Production secret Preview/Staging’e kopyalanmamalı.

## Kontrollü deploy sırası

1. Account owner Vercel login ve GitHub repository authorization’ı kendi UI’sında tamamlar.
2. Yalnız `gokcekmustafa/okuplus`, `master` bağlanır; başka repo görülürse STOP.
3. Staging/Preview project oluşturulur; Production project/environment oluşturulmaz.
4. Neon staging project/branch oluşturulur; local `127.0.0.1:5432/oku_plus_test` kullanılmaz.
5. Pooled runtime URL ve direct migration URL secret manager’a girilir.
6. `prisma migrate status` read-only çalıştırılır; migration yalnız ayrı controlled job ile uygulanır.
7. `npm run db:fingerprint` explicit `DB_FINGERPRINT_ENVIRONMENT=STAGING` ile çalıştırılır.
8. Deploy tamamlanır; `/health`, `/health/db`, `/ready`, HTTPS ve log redaction doğrulanır.
9. Synthetic auth, learning, tenant isolation, billing UI, CORS/CSP ve mobile-web smoke çalıştırılır.
10. Evidence URL/SHA/deploy ID/fingerprint ile staging dokümanlarına yazılır.

Function startup veya her invocation içinde `prisma migrate deploy` çalıştırılmamalı. Preview DB production data/PII içermemeli. Neon branching ve Vercel Preview entegrasyonu için [Neon branching](https://neon.com/docs/guides/branching-intro) ve [Neon–Vercel integration](https://neon.com/blog/neon-vercel-native-integration) referans alınmalı.

## Safety record

- Vercel project/deployment: **NO**
- Vercel URL/domain: **NO**
- Neon project/branch/database: **NO**
- remote DB migration/write: **NO**
- production DB/secret/domain: **NO**
- real payment/catalog: **NO**
- `render.yaml`: preserved
- local PostgreSQL: yalnız local test/smoke için kullanıldı ve durduruldu

Bu nedenle 8I-6C sonucu hosted kabul kriterleri açısından **BLOCKED**, production kararı **NO-GO**’dur.
