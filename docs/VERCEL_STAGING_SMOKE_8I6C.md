# Oku+ — Vercel Hosted Staging Smoke Plan and Evidence (8I-6C)

**Tarih:** 2026-09-03  
**STATUS:** **BLOCKED — hosted URL yok**  
**Scope:** Gerçek Vercel/Neon staging POC smoke checklist’i ve mevcut static-code/local evidence ayrımı.

## Hosted evidence özeti

| Smoke alanı                      | Hosted sonuç       | Açıklama                                                       |
| -------------------------------- | ------------------ | -------------------------------------------------------------- |
| Vercel URL                       | **NOT AVAILABLE**  | Hesap/project/deploy oluşturulmadı.                            |
| HTTPS/TLS                        | **NOT RUN**        | Vercel domain yok.                                             |
| `/health`                        | **NOT RUN HOSTED** | Local compiled smoke 200.                                      |
| `/health/db`                     | **NOT RUN HOSTED** | Local compiled smoke 200.                                      |
| `/ready`                         | **NOT RUN HOSTED** | Local compiled smoke 200, `ready: true`.                       |
| Auth signup/login/refresh/logout | **NOT RUN HOSTED** | Local Vitest coverage PASS.                                    |
| Student learning flow            | **NOT RUN HOSTED** | Local Vitest/browser evidence baseline mevcut; hosted URL yok. |
| Tenant isolation                 | **NOT RUN HOSTED** | Local tenant/RLS tests baseline PASS; remote DB yok.           |
| Billing UI/account               | **NOT RUN HOSTED** | Local code/test baseline; real payment yok.                    |
| iyzico sandbox                   | **NOT RUN**        | Authorized sandbox credential yok.                             |
| CORS/CSP/security headers        | **NOT RUN HOSTED** | Static code contract inspected; real Vercel origin yok.        |
| Vercel logs                      | **NOT RUN**        | Dashboard/log stream yok.                                      |
| Mobile web                       | **NOT RUN**        | Hosted HTTPS URL yok; native mobile kapsam dışı.               |

## Local gates

Local PostgreSQL test instance’ı yalnız `D:\oku-plus\.tmp\postgres-8b` altında başlatıldı, migrations uygulandı ve kapatıldı. Remote/shared/production database kullanılmadı.

- `npm test -- --reporter=dot`: **37/37 files, 636/636 tests PASS**
- `npm run lint`: **PASS**
- `npm run format:check`: **PASS**
- `npm run typecheck`: **PASS**
- `npm run build`: **PASS**
- `npx prisma validate`: **PASS**
- `npx prisma migrate status`: **PASS — 14 migrations, schema up to date**
- compiled local `/`, `/health`, `/health/db`, `/ready`: **200 / 200 / 200 / 200**

Local PASS, hosted PASS anlamına gelmez.

## Hosted smoke sırası

Gerçek staging URL elde edilirse şu sırayla yürütülmeli:

```text
GET /health
GET /health/db
GET /ready
GET /
GET /styles.css
GET /app.js
```

Ardından synthetic test hesabıyla:

```text
signup → login → refresh → logout
onboarding → personal context → learning path
exercise → question → answer → completion
XP → streak → progress → review
billing account → subscription read → billing UI
```

Tenant testinde Personal A, Personal B ve Organization kayıtları kullanılmalı. A’nın token/context’i ile B veya Organization verisi okunamamalı; cross-tenant erişim **imkânsız** olmalı. Production user, production token veya production data kullanılmamalı.

## Static, CORS, CSP ve log checks

Oku+ `public/index.html`, `public/styles.css`, `public/app.js` dosyalarını Fastify static plugin’iyle same-origin sunuyor. Browser history router kullanılmadığı için Next.js rewrite gerekmiyor. Hosted smoke’ta `/` asset’leri ve API path’lerinin HTML fallback’e düşmediği doğrulanmalı.

Mevcut code contract:

- CORS wildcard değil, explicit allowlist;
- `credentials: true`;
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy mevcut;
- production HSTS mevcut;
- Pino redaction password/token/secret/DB URL alanlarını hedefliyor.

Hosted log’larda request ID, startup/error ve health kayıtları bulunmalı; password, JWT/access/refresh token, DB URL, payment secret, card/CVV ve gereksiz PII bulunmamalı.

## Known high-risk findings

### Rate limit

`src/plugins/security.ts` içindeki `Map` **process-local**. Vercel multi-instance/Fluid Compute concurrency ortamında global distributed limiter değildir. Hosted POC’ta bu durum **HIGH RISK** olarak kaydedilmeli; bu görev gereksiz Redis entegrasyonu yapmamalı. Production için edge/managed limiter veya shared store ayrı iş kalemidir.

### Auth cookie

Mevcut browser client bearer access/refresh tokenları localStorage’da tutuyor; `Secure`, `HttpOnly`, `SameSite` cookie kanıtı yok. Bu nedenle hosted POC’ta cookie acceptance **NOT PASS / HIGH RISK**; production’a taşınmamalı. Cookie migration ayrı auth hardening işidir ve CORS/CSRF ile birlikte tasarlanmalıdır.

### Webhook

Billing route parsed body’yi `JSON.stringify()` ile byte dizisine çeviriyor. Signature sağlayıcının orijinal bytes’ını gerektiriyorsa bu yeniden serileştirme risktir. Service tarafında signature, replay age, idempotency ve transaction mantığı mevcut olsa da hosted webhook acceptance için:

- raw body capture,
- signature verification,
- provider timeout/AbortController,
- duplicate/conflict/out-of-order event,
- safe status/retry davranışı

kanıtlanmalı. Gerçek iyzico credential yoksa mock request yalnız route/infrastructure davranışı için kullanılabilir; ödeme success kanıtı sayılmaz. Bu POC’ta mock hosted webhook da çalıştırılamadı.

## Performance observation

Production benchmark yapılmamalı. Hosted POC olduğunda yalnız gözlemsel olarak cold request, warm request, startup latency ve DB query latency kaydedilmeli. Neon region Vercel region’a yakın seçilmeli; pooled URL connection exhaustion riskini azaltır. Sürekli stream veya background work max duration dışına taşırılmamalı: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations).

## Rollback and backup evidence

Vercel previous deployment rollback özelliği hesap erişimi yokluğu nedeniyle gözlemlenmedi; önceki deployment rollback planı yazılı olarak bilinmeli. Database migration rollback otomatik varsayılmamalı.

Neon restore window/backup/PITR yeteneği plan ve proje ayarına bağlıdır; staging resource yokken kanıt üretilemez: [Neon projects](https://neon.com/docs/manage/projects). Production backup/restore testi bu kapsamda yapılmadı.

## Smoke decision

**Hosted smoke: BLOCKED / NOT RUN.** Local quality PASS olsa da gerçek Vercel HTTPS URL, Neon staging DB, logs, browser ve mobile-web evidence yoktur. Account access sağlanmadan 8I-6C PASS denemez.
