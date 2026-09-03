# OKU+ — AŞAMA 8H-5 FINAL REPORT

STATUS:
BLOCKED

PROVIDER:
iyzico

ENVIRONMENT:
SANDBOX

CUSTOMER:
Provider'da bağımsız customer-create endpoint'i olmadığı doğrulandı. iyzico
subscription initialize sırasında email ile subscriber/customer reference
oluşturur; local `BillingCustomer` ilk checkout'ta, provider reference callback
ve doğrulanmış sonuçla tamamlanır.

CHECKOUT:
Sandbox-only `POST /v2/subscription/checkoutform/initialize` adapter'ı,
server-side plan reference, personal owner guard, idempotency ve token/
checkoutFormContent response'u uygulandı. Gerçek sandbox credential yokluğu
nedeniyle provider checkout başlatma E2E'si çalıştırılmadı.

SUBSCRIPTION:
iyzico status mapping (`PENDING`, `ACTIVE`, `UPGRADED`, `UNPAID`, `CANCELED`,
`EXPIRED`, unknown fail-safe), detail ve cancel adapter'ları uygulandı.

WEBHOOK:
`POST /billing/webhooks/iyzico`, V3 subscription parser, event inbox,
canonical payload hash, transaction, duplicate no-op, conflict ve stale event
guard uygulandı.

SIGNATURE:
Resmi `X-IYZ-SIGNATURE-V3` subscription alan sırası ve HMAC-SHA256/hex
doğrulaması uygulandı. Eski signature header'ları fallback değildir.

IDEMPOTENCY:
Checkout local `(provider, user, tenant, idempotencyKey)` unique; webhook
`(provider, eventId)` unique; cancellation state guard; refund idempotency
snapshot alanları mevcut.

CANCELLATION:
Sandbox subscription cancel endpoint adapter'ı ve personal owner authorization
uygulandı. Dönem sonu iptal provider API'sinde belgelenmediği için desteklenmez.

REFUND:
Resmi `/v2/payment/refund` adapter'ı mevcut. Subscription webhook payloadında
payment ID bulunmadığı için payment ID doğrulanmadan refund yapılmıyor. Gerçek
sandbox refund çağrısı credential yokluğu nedeniyle çalıştırılmadı.

ENTITLEMENT:
Yalnız verified, owner-matched `subscription.order.success` event'i
`PLAN_PREMIUM` personal grant oluşturur. Failure/PAST_DUE/CANCELED/EXPIRED
grant'i kaldırır; callback veya client payload'ı entitlement kaynağı değildir.

PERSONAL SCOPE:
Authenticated aktif STUDENT + INDIVIDUAL tenant owner check; organization ve
platform hesapları ödeme sahibi olamaz.

ORGANIZATION:
OUT OF SCOPE

SECURITY:
Env-only secrets; production base URL reject; raw card/CVV/full provider
payload storage yok; V3 signature, timestamp/replay, event uniqueness,
conflict/stale guards, RLS ve redacted logs uygulandı.

TESTS:
8H-5 adapter/security suite **10/10 PASS**. Tam `npm test -- --reporter=dot`
**34 test dosyası / 614 test PASS**. `npm run lint`,
`npm run format:check`, `npm run typecheck`, `npm run build`, `npx prisma
validate` ve `npx prisma migrate status` PASS; migration durumu TEST'te
güncel.

BROWSER:
`scripts/browser-8f-final-qa-test.ts` **PASS** (10 viewport, accessibility,
network recovery, offline boundary). `scripts/browser-closed-pilot-operations-test.ts`
**PASS** (signup/onboarding, personal tenant, Free/Premium boundary, client
entitlement tampering, exercise/completion, XP/streak/progress/review,
feedback/bug idempotency, logout/login). UI sandbox catalog kapalıyken checkout
düğmesini disable eder. Gerçek provider checkout/success/failure/cancel/refund
browser E2E'si credential yokluğu nedeniyle **BLOCKED**.

MIGRATIONS:
8H-5 billing migration'ları TEST `oku_plus_test` veritabanına uygulandı;
Prisma schema validate/generate ve migration status geçti (13 migration,
schema up to date). Production migration/write yapılmadı.

PRODUCTION WRITE:
NO

PRODUCTION PAYMENT:
NO

SANDBOX CREDENTIAL:
NOT AVAILABLE

8G-8:
OPEN

8G-9B:
OPEN

REMAINING BLOCKERS:

- Doğrulanmış iyzico sandbox API key, secret key ve merchant ID yok.
- Merchant panelinde sandbox subscription plan reference code'ları yok.
- HTTPS sandbox callback/webhook URL'si ve X-IYZ-SIGNATURE-V3 hesap aktivasyonu
  doğrulanmadı.
- TRY fiyat, trial, recurring/cancel/refund, tax/e-document ve minor/payer
  business/legal kararları 8H-3'ten açık.
- 8G-8 production DB/deployment ve 8G-9B production catalog blocker'ları açık.

QA notu: `qa:curriculum-pack` **PASS** (`TEST_READ_ONLY`),
`qa:curriculum-fixtures` **PASS** (`TEST_FIXTURE_READ_ONLY`),
`qa:curriculum-catalog` **BLOCKED**; errors `0`, fixture catalog ve eksik
Level→Skill / Content→Level relation blocker'ları 8G-9B'den devralındı.

FINAL RECOMMENDATION:

Kod ve TEST güvenlik/contract katmanı hazırdır; sandbox credential, plan ve
webhook account aktivasyonu sağlanmadan 8H-5 PASS denmemelidir. Değerler
secret manager'a verildikten sonra yalnız TEST hedefinde checkout → callback →
verified webhook → Premium → cancel → verified state ve desteklenen refund
senaryoları çalıştırılmalı; production'a geçiş yapılmamalıdır.
