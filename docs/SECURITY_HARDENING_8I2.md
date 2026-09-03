# OKU+ — 8I-2 Security & Reliability Hardening

**Audit tarihi:** 2026-09-03  
**Kapsam:** Local uygulama ve yalnız `oku_plus_test` üzerinde production güvenlik/reliability hazırlığı.  
**Production erişimi, write/DDL/migration, gerçek kullanıcı ve gerçek ödeme:** YOK.

## Uygulanan kontroller

| Alan                  | Uygulama / kanıt                                                                                                                  | Durum                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| HTTP kaynak sınırları | `BODY_LIMIT_BYTES` (1 MB), connection/request/keep-alive timeout’ları                                                             | PASS                                     |
| Security headers      | `nosniff`, `DENY`, Referrer-Policy, Permissions-Policy, CSP; production’da HSTS                                                   | PASS                                     |
| CSP                   | `unsafe-eval` ve source wildcard yok; mevcut SPA legacy inline handler/style nedeniyle `unsafe-inline` geçici uyumluluk istisnası | PASS WITH GAP                            |
| CORS                  | Boş değer cross-origin’i kapatır; yalnız açık `http(s)` origin listesi kabul edilir; `*` reddedilir                               | PASS                                     |
| Rate limit            | Auth, billing, iyzico webhook, pilot ve diğer mutating uçlar için process-local fixed window                                      | PASS WITH DEPLOYMENT ACTION              |
| Readiness             | `/health` liveness; `/health/db` DB probe; `/ready` DB + migration state probe                                                    | PASS (TEST)                              |
| Graceful shutdown     | SIGTERM/SIGINT → Fastify close → Prisma disconnect                                                                                | PASS (kod)                               |
| Hata minimizasyonu    | Generic 500/4xx; body-too-large 413; token/secret detayları response’a girmez                                                     | PASS                                     |
| Logging               | Pino structured log + Fastify `reqId`; auth/token/password/secret/payment alanları redacted                                       | PASS WITH RETENTION GAP                  |
| Storage               | Dosya upload/object storage akışı yok; yalnız metadata URL tutuluyor                                                              | NOT APPLICABLE; URL/size validation PASS |

## Dependency audit

2026-09-03 koşusunda `npm audit --omit=dev --audit-level=high` ile başlangıçta 5 advisory
(4 high, 1 moderate) görüldü.

- Fastify `5.12.0` ve fast-uri `4.1.2`/`3.1.5` için güvenli patch/minor güncellemeleri uygulandı.
  Güncel değerler: Fastify `5.12.1`, fast-uri `4.1.4` ve `3.1.7`. Bu advisories artık raporda yok.
- Prisma/deepmerge-ts zincirinde 3 HIGH advisory kaldı (`GHSA-ggr8-5vv4-36mx` dahil Prisma config
  stack recursion etkisi). `npm audit fix --force` çözümü Prisma’yı downgrade/uyumsuz sürüme taşıyor;
  major/RC yükseltmesi de bu görevde güvenli değildir. Kör force fix uygulanmadı.
- Bu advisory’lerin request handler değil Prisma CLI/config dependency ağacında yoğunlaşması
  exploitability’yi düşürür; yine de audit temiz değildir. Prisma CLI release/migration job’ından
  runtime image’a alınmamalı, lockfile korunmalı ve ayrı testli Prisma major upgrade işi açılmalıdır.
  Bu nedenle production security gate’i audit tamamen çözülene kadar **NO-GO** kalır.

Başlangıç audit çıktısındaki package/severity/fix özeti:

| Package / advisory                                                                                                   | Severity | Affected surface                             | Exploitability / relevance                                                                                                             | Fix / karar                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| deepmerge-ts `<8.0.0`, `GHSA-ggr8-5vv4-36mx`                                                                         | HIGH     | `@prisma/config` → `prisma` dependency chain | Recursive object graph stack exhaustion; request path dışındaki CLI/config zincirinde, runtime relevance düşük ama audit etkisi gerçek | `npm audit fix --force` Prisma `6.12.0` breaking downgrade önerdi; uygulanmadı, isolate/upgrade ayrı iş |
| fast-uri `4.1.2`/`3.1.5`: `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp` | HIGH     | Fastify URL/schema parsing dependency        | Host/URL normalization and malformed IPv6/percent-encoding confusion; URL validation kullanan request yüzeyinde anlamlı                | `fast-uri 4.1.4` ve `3.1.7` uygulandı; audit’den çıktı                                                  |
| Fastify `5.12.0`: `GHSA-w2qp-rph6-63g4`, `GHSA-3m5p-2c4r-xxw2`                                                       | MODERATE | Fastify validation / trusted proxy behavior  | Schema validation bypass ve yanlış trust-proxy yapılandırmasında forwarded header spoofing; deployment config’e bağlı relevance        | Fastify `5.12.1` uygulandı; audit’den çıktı                                                             |

İlk raporda aynı Prisma/deepmerge zinciri 3 HIGH vulnerability olarak sayıldı. Güncel audit çıktısı
artık yalnız bu unresolved chain’i ve 3 HIGH aggregate sayısını gösteriyor; Fastify/fast-uri advisories
temizlendi. Upstream fix çıkana kadar Prisma CLI release/migration image’dan ayrılmalı, lockfile pin’li
kalmalı ve dependency monitoring sürmelidir.

## Auth / session / CSRF

- Password hash: Node `scrypt`, random salt ve timing-safe karşılaştırma; olmayan kullanıcı için dummy
  hash ile timing farkı azaltılıyor.
- Login hata mesajı kullanıcı var/yok ayrımını açmıyor.
- Access token kısa TTL, refresh token DB session kaydıyla doğrulanıyor; rotation sırasında mevcut
  session revoke ediliyor. Replay/family revoke, logout ve logout-all mevcut uygulama/test kontratında.
- Browser bugün bearer access/refresh token’ı `localStorage`’da tutuyor; refresh JSON body ile geliyor.
  HttpOnly/Secure/SameSite cookie migration bu görevde yapılmadı çünkü web + iOS + Android bearer
  sözleşmesini değiştirmek ayrı ürün/mimari karardır. Bu, XSS etkisini büyüten **açık production riskidir**.
- Cookie session kullanılmadığı için klasik cookie-CSRF saldırı yüzeyi yok; ileride cookie’ye geçişte
  SameSite, CSRF token/double-submit, origin kontrolü ve refresh rotation birlikte zorunlu olmalı.

## Rate limiting / abuse

Varsayılan pencere 60 saniyedir. Auth `60`, billing `60`, webhook retry toleransı `120`, pilot `60`,
diğer mutating uçlar `120` istektir. Aşım `429`, generic `RATE_LIMITED`, `Retry-After` ve limit/reset
header’ları üretir. Webhook retry’leri için limit özellikle daha yüksek tutulmuştur; gerçek retry/idempotency
koruması signature + event ID + DB idempotency katmanında kalır.

Bu limiter process-local’dır; tek instance için baseline koruma sağlar. Production birden fazla instance,
NAT arkasında kullanıcılar veya yüksek trafik çalıştıracaksa edge gateway/WAF veya Redis-backed shared
limiter zorunludur. `request.ip`, güvenilmeyen forwarded header’ı otomatik kabul edilmeden kullanılır;
trusted proxy ayarı deployment tarafından açıkça doğrulanmalıdır.

## CORS / headers

`CORS_ORIGIN` boşken cross-origin CORS kapalıdır. Değer, virgülle ayrılmış açık `http(s)` origin’lerden
oluşmalıdır; wildcard, path, credential içeren URL ve `*` reddedilir. `credentials: true` yalnız bu
allowlist ile kullanılır.

CSP: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'` ve
`script-src 'self'` temel kısıtları vardır. Mevcut SPA’da inline style ve legacy inline event handler
olduğu için `unsafe-inline` geçici olarak tutuldu; `unsafe-eval` ve `*` yoktur. Inline handler’lar external
event listener’a taşındığında bu istisna kaldırılmalıdır. HSTS yalnız production’da, HTTPS termination
kanıtlandıktan sonra gönderilir.

## Input / payload validation

- Fastify global body limit ile JSON/form gövdeleri sınırlandırılmıştır.
- Auth email/password/idToken/refreshToken, pilot feedback/bug/event, billing checkout/cancel/idempotency
  alanlarında üst sınırlar vardır.
- Media metadata URL’si yalnız HTTP(S), `sizeBytes` en fazla 50 MB olacak şekilde doğrulanır; upload
  storage olmadığı için bu değer gerçek dosya kabulü anlamına gelmez.
- Unknown fields strict schema ile reddedilir; malformed JSON ve oversized body güvenli 4xx döner.
- Pagination/query listelerinde üst page size sınırları korunur. UUID/tenant/student authorization
  kontrolleri mevcut route/service testleriyle ayrıca doğrulanır.

## Error handling / PII / logging

Unknown server errors client’a `INTERNAL_ERROR` ve generic mesaj olarak gider; validation details yalnız
validation hatalarında verilir. 413 ve diğer Fastify 4xx’ler 500’e dönüştürülmez. Not-found response
artık method/path/query ayrıntısını client’a döndürmez.

Pino redaction: `DATABASE_URL`, password/passwordHash, access/refresh/id token, authorization/cookie,
secret/secretKey/apiKey/merchantKey. iyzico webhook raw payload’ı loglanmaz; hash ve minimize edilmiş
kimlik/state alanları kullanılır. Kart numarası, CVV, payment secret, JWT ve raw provider payload loglanması
yasaktır.

Telemetry, feedback/bug report, billing audit, webhook metadata ve auth session retention süreleri ile
silme/export owner’ı repository’de karar olarak tanımlı değil: **PENDING / production launch blocker**.
Minimum politika kararı; data class, retention days, legal basis, access roles, deletion job ve audit
kanıtını ayrı bir release gate olarak kaydetmelidir.

## iyzico webhook

Mevcut sandbox-only adapter korunmuştur; gereksiz yeniden yazım yapılmadı. Signature-v3 doğrulama,
event ID, payload hash, stale/time-window, replay/idempotency, conflict/terminal state ve transaction
korumaları mevcut test kontratındadır. Production activation için gerçek credential/merchant/plan,
HTTPS callback, secret rotation ve provider sözleşmesi yoktur; gerçek provider çağrısı yapılmamıştır.

## Readiness / database / shutdown

- `/health`: process liveness; DB’ye bağlı başarı iddiası yok.
- `/health/db`: `SELECT 1`; DB down ise 503.
- `/ready`: DB probe + `_prisma_migrations` içinde tamamlanmamış/failed migration kontrolü; hazırsa 200,
  değilse 503. Secret/config ayrıntısı sızdırılmaz.
- Prisma client connection URL’ine `connect_timeout=10`, `pool_timeout=10`, `socket_timeout=30`; global
  transaction defaults `maxWait=10s`, `timeout=30s` uygulanır. HTTP tarafında request/connection/keep-alive
  timeout’ları env’den sonlu değerlerle yönetilir.
- SIGTERM/SIGINT yeni bağlantıları durdurur, Fastify aktif istekleri kapatır ve shared Prisma pool’u
  disconnect eder. Başlatma hatası process exit code 1 ile görünür.

## Backup / restore

[DATABASE_BACKUP_RESTORE_8I2.md](./DATABASE_BACKUP_RESTORE_8I2.md) prosedürü oluşturuldu. Gerçek
production backup/restore çalıştırılmadı; RPO/RTO, retention, encryption, access owner ve restore
kanıtları **PENDING/UNKNOWN** olarak işaretlendi. Kanıt olmadan production promotion yapılmaz.

## Security test coverage

Automated coverage includes headers, CSP forbidden tokens, HSTS production condition, explicit CORS,
wildcard CORS rejection, auth rate limit, oversized body 413, readiness, generic not-found/error
contract, existing auth unauthorized/authorization, tenant/student crossover, session replay/refresh
replay/brute force/rate limit, malformed input and iyzico signature/replay/idempotency tests. Full test and browser regression
results are recorded in `STAGE_8I2_FINAL_REPORT.md` after the final gate run.

## Open production risks

1. Prisma/deepmerge-ts HIGH audit chain unresolved.
2. Deployment target, TLS termination, secret manager/rotation, shared rate limiter, metrics/alerts,
   log retention and on-call ownership unknown.
3. Bearer token localStorage architecture and CSP `unsafe-inline` remain migration gaps.
4. Backup/restore rehearsal and RPO/RTO not verified.
5. 8G-8 production DB/deployment blocker, 8G-9B production catalog blocker and iyzico activation
   dependency remain open.

**Recommendation:** local/test hardening is implemented and testable; production release remains
**NO-GO** until the listed blockers are explicitly closed or risk-accepted by the named owner.
