# OKU+ — 8H-6 Billing & Subscription Lifecycle QA Final Report

## STATUS

**BLOCKED**

Kod seviyesindeki 8H-6 lifecycle sözleşmesi, fail-safe entitlement sınırı,
audit alanları ve provider-contract unit testleri hazırlandı. Stage PASS
denememesinin iki bağımsız nedeni vardır: mevcut çalışma ortamında TEST
PostgreSQL `127.0.0.1:5432` dinlemiyor; ayrıca 8G-8 production DB/deployment ve
8G-9B production curriculum catalog blocker'ları açıktır.

## STATE MACHINE

`docs/SUBSCRIPTION_STATE_MACHINE_8H6.md` oluşturuldu. `FREE` derived
entitlement state'tir; `PENDING`, `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELED`,
`EXPIRED` ve fail-safe `UNKNOWN` mevcut enum/mapping durumlarıdır. Eski
`CANCELED`/`EXPIRED` subscription hiçbir eski success webhook ile açılmaz;
reaktivasyon yeni `PENDING` subscription satırıdır.

## ENTITLEMENT MAPPING

- `ACTIVE` → verified personal `PLAN_PREMIUM`;
- `EXPIRED` → `PLAN_FREE` / no-grant;
- `PENDING`, `TRIAL`, `PAST_DUE`, `CANCELED`, `UNKNOWN` → ticari karar
  `PENDING`, teknik enforcement no-grant;
- grace period ve cancellation sonrası dönem sonu erişimi kodlanmadı.

Refund, subscription cancellation değildir ve refund başarıyla işlendiğinde
entitlement artık keyfi olarak kapatılmaz. Partial refund mevcut payment modelinde
temsil edilmediği için reddedilir.

## RENEWAL

Verified success renewal subscription'ı `ACTIVE` tutar ve
`providerOrderReference` unique payment upsert'iyle duplicate payment üretmez.
Failure `PAST_DUE`, retry success tekrar `ACTIVE`, retry failure `PAST_DUE`
olarak sözleşmelendi. Gerçek iyzico retry/provider E2E credential yokluğu
nedeniyle çalıştırılmadı.

## CANCELLATION

Mevcut adapter yalnız immediate cancellation kabul eder; `cancelAtPeriodEnd`
provider contract'ta mevcut olmadığı için reddedilir. Local cancellation sonrası
`CANCELED`, current grant no-grant, `SUBSCRIPTION_CANCELED` telemetry ve Türkçe
UI durumu birlikte korunur. Period-end erişim kuralı `PENDING`'dir.

## REFUND

Refund finansal `BillingPayment` state transition'ıdır. Verified payment ID,
successful provider response, owner/tenant scope ve idempotency gerekir. Refund
subscription lifecycle'ını otomatik değiştirmez; refund sonrası entitlement
etkisi business decision'a bırakılmıştır.

## FAILED PAYMENT

First failure ve recurring failure `PAST_DUE` yapar; Premium grant fail-safe
olarak açık kalmaz. Retry success `ACTIVE` ile grant'ı geri açabilir; old
terminal subscription success event'i stale/terminal guard ile açamaz. Grace
period için gerçek süre veya otomatik timer yoktur.

## WEBHOOK ORDERING

`iyziEventTime` ile `lastEventAt` karşılaştırılır; eşit/eski event `IGNORED` ve
no-op'tur. `CANCELED` veya `EXPIRED` sonrası eski `ACTIVE` event Premium'u
reopen edemez. Provider monotonic version sunmadığı için `lastProviderVersion`
bugün ordering kaynağı değildir.

## WEBHOOK IDEMPOTENCY

`(providerCode, providerEventId)` unique inbox:

- aynı ID + aynı canonical hash → duplicate no-op;
- aynı ID + farklı hash → `CONFLICT`, state/payment/entitlement effect yok;
- duplicate order → payment unique upsert;
- duplicate subscription → yeni subscription satırı yok.

## REACTIVATION

Canceled subscription tekrar Active yapılmaz. New checkout new subscription ve
new entitlement source kullanır; old subscription/event linkage korunur.

## PERSONAL SCOPE

Checkout/cancel/refund service owner guard'ı aktif `STUDENT` üyeliği, aktif
`INDIVIDUAL` tenant ve actor user/tenant eşleşmesini ister. Organization billing
403 ve context switching ile personal grant organization'a taşınmaz.

## SECURITY

Client `premium`, amount, currency, provider/user/tenant/subscription ID alanları
checkout schema'sında kabul edilmez. Cancellation subscription ID almaz; refund
payment ID owner/tenant scope ile aranır. Webhook yalnız V3 signature + timestamp
window + provider reference match sonrası effect üretir. Provider secret, card,
CVV ve raw payload tutulmaz.

Resmi V3 imza sırası düzeltildi ve bağımsız test vektörü eklendi:
`secretKey + merchantId + eventType + subscriptionReferenceCode +
orderReferenceCode + customerReferenceCode`.

## AUDIT

`BillingWebhookEvent` mevcut inbox/audit altyapısı yeterli olacak şekilde
genişletildi: `previousState`, `newState`, provider/internal event/reference'ları,
`occurredAt`, `receivedAt`, `processedAt`, payload hash ve owner scope tutulur.
Local cancellation da `subscription.cancel.confirmed` audit event'i üretir.
Raw ödeme verisi tutulmaz. Migration:
`prisma/migrations/20260903140000_add_billing_state_audit/migration.sql`.

## BUSINESS DECISIONS

`docs/BILLING_BUSINESS_DECISIONS_8H6.md` oluşturuldu. Plan/scope/security/
data-minimization kararları `DECIDED`; price, currency, trial, grace, refund,
cancellation-after-access, renewal ve reactivation `PENDING`; minor/consent
`LEGAL REVIEW`; VAT/invoice/settlement `ACCOUNTING REVIEW`; plan reference,
webhook activation, retry/cancel/refund API ayrıntıları `PROVIDER DEPENDENCY`.

## TESTS

Kod değişikliği sonrası çalıştırılması gereken/çalıştırılan kapılar:

| Kontrol                               | Sonuç                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `test/billing-lifecycle.unit.test.ts` | **9/9 PASS**; DB gerektirmiyor                                            |
| `npm run format:check`                | **PASS**                                                                  |
| `npm run lint`                        | **PASS**                                                                  |
| `npm run typecheck`                   | **PASS**                                                                  |
| `npm run build`                       | **PASS**                                                                  |
| `npx prisma validate`                 | **PASS**                                                                  |
| `npx prisma migrate status`           | BLOCKED: local TEST PostgreSQL `127.0.0.1:5432` erişilebilir değil        |
| `npm test` / DB integration           | BLOCKED: aynı TEST DB bağlantı koşulu; koşu ilerleme üretmeden durduruldu |
| browser regression / closed-pilot     | NOT RUN: local TEST DB ve güvenilir browser fixture koşulu yok            |
| pack QA / fixture QA                  | NOT RUN: TEST hedefi doğrulanamadı                                        |
| catalog QA                            | BLOCKED: 8G-9B blocker; ayrıca TEST DB erişimi yok                        |

8H-5 raporunda bildirilen `614/614` mevcut test sonucu carry-forward bilgidir;
bu çalışma ortamında yeniden üretilemedi ve yeni 8H-6 değişiklikleriyle birlikte
PASS olarak sunulmamıştır.

## BROWSER

UI, belirlenen status mesajlarını ekrana yalnız server `/billing/subscription`
yanıtından sonra yazar: `Premium aktif`, `Ödeme bekleniyor`, `Ödeme başarısız`,
`Abonelik iptal edildi`, `Premium sona erdi`. Trial/grace/unknown için sahte
ticari vaat gösterilmez. Gerçek provider checkout, success/failure, cancel veya
refund browser E2E'si credential/provider activation yokluğu nedeniyle çalışmadı.

## PRODUCTION WRITE

**NO**

## REAL PAYMENT

**NO**

## SANDBOX E2E

**NOT RUN — credentials, merchant/plan references and provider webhook activation unavailable**

## 8G-8

**OPEN** — production DB/deployment blocker.

## 8G-9B

**OPEN** — production curriculum catalog blocker.

## REMAINING BLOCKERS

- TEST PostgreSQL `127.0.0.1:5432` erişilebilir değil; migration/integration/
  browser/fixture QA yeniden üretilemedi.
- Doğrulanmış iyzico sandbox API key, secret, merchant ID, monthly/yearly plan
  reference, HTTPS callback ve V3 webhook activation eksik.
- Price, currency, trial, grace, refund entitlement, cancellation access,
  renewal, minor/payment-owner ve VAT/invoice kararları açık.
- 8G-8 ve 8G-9B blocker'ları açık.

## FINAL RECOMMENDATION

8H-6 şu anda **BLOCKED** tutulmalı. Önce yalnız `oku_plus_test` hedefinde
PostgreSQL/migration erişimi sağlanıp unit + integration + browser/fixture
regression yeniden çalıştırılmalı; sonra sandbox credential/plan/webhook
aktivasyonu ile checkout → callback → verified webhook → Premium → cancel ve
desteklenen full refund akışı doğrulanmalıdır. İş/legal/accounting kararları
onaylanmadan grace, period-end access veya refund entitlement davranışı ürün
kararı gibi kodlanmamalıdır. Production write ve gerçek payment yapılmamalıdır.
