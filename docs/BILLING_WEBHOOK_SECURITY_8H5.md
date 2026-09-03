# OKU+ — 8H-5 Billing Webhook Security

## Güven sınırı

`POST /billing/webhooks/iyzico` public provider ingress'tir; browser redirect'i,
success URL'si, mobile payload'ı veya `premium=true` iddiası trusted source
değildir. Access kararı yalnız server'da doğrulanmış provider event'i ve local
personal billing record'u ile verilir.

iyzico'nun güncel webhook sözleşmesi `X-IYZ-SIGNATURE-V3` header'ıdır; eski
`X-Iyz-Signature` ve `X-Iyz-Signature-V2` kullanılmaz. Subscription event'leri
`subscription.order.success` ve `subscription.order.failure` değerlerini,
`orderReferenceCode`, `customerReferenceCode`, `subscriptionReferenceCode`,
`iyziReferenceCode` ve `iyziEventTime` alanlarını taşır. Kaynak:
[iyzico Webhook](https://docs.iyzico.com/en/advanced/webhook).

## Signature V3 doğrulaması

Subscription V3 için resmi alan sırası şöyledir:

```text
secretKey
+ merchantId
+ eventType
+ subscriptionReferenceCode
+ orderReferenceCode
+ customerReferenceCode
```

Bu mesaj `secretKey` ile HMAC-SHA256 yapılır ve hex olarak header ile constant-
time karşılaştırılır. `merchantId` server env'den gelir; payload içindeki
değer varsa yalnız audit metadata'sıdır ve merchant secret yerine geçmez.

İmza doğrulama sırası:

1. Bounded JSON body parse edilir; malformed body reddedilir.
2. V3 header zorunlu olarak okunur; eski header'lar fallback değildir.
3. Zorunlu event ID/referansları ve `iyziEventTime` doğrulanır.
4. İmza hesaplanır ve timing-safe compare yapılır.
5. Event zamanı default 24 saatlik pencere ve 5 dakikalık gelecek toleransı
   içinde değilse replay/zaman dışı kabul edilir.
6. `(providerCode, providerEventId)` unique inbox kaydıyla tekrar kontrol edilir.

Request authentication için ayrı olarak resmi iyzico HMACSHA256 Auth kullanılır:
`randomKey + uri.path + request.body` HMAC-SHA256, sonra
`base64("apiKey:...&randomKey:...&signature:...")` ve `IYZWSv2` prefix.
Kaynak: [iyzico HMACSHA256 Auth](https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth).

## Replay / idempotency / ordering

- Aynı event ID ve aynı canonical payload hash: `duplicate=true`, no-op.
- Aynı event ID ve farklı hash: `CONFLICT`, state/payment/entitlement effect yok.
- Geçerli imza fakat bilinmeyen event: `IGNORED`, audit var, access effect yok.
- Bilinmeyen provider customer/subscription: `REJECTED`, access effect yok.
- Subscription `lastEventAt` daha yeni/eşitse gelen event stale sayılır;
  `ACTIVE` sonradan eski bir event ile tekrar açılamaz.
- Checkout, cancellation ve refund istekleri server idempotency key ile bounded
  local record'a bağlanır; provider conversation ID aynı denemeleri korele eder.
- Billing state update, payment upsert, webhook inbox ve entitlement update
  tek database transaction sınırındadır.

## Tenant / owner isolation

Checkout ve cancellation yalnız authenticated aktif `STUDENT` üyeliği bulunan
`INDIVIDUAL` tenant owner'ı için çalışır. Organization context billing'e giremez.
Provider reference database'de başka user/tenant kaydıyla eşleşmiyorsa event
erişim açmaz. RLS migration'ı billing tablolarını tenant context'e bağlar;
provider ingress için transaction-local `app.webhook_ingest=iyzico` guard'ı
kullanılır.

## Data minimization and logging

Saklanmayanlar:

- card number, CVV, expiry;
- iyzico API/secret key, webhook secret;
- full raw provider payload;
- provider checkout content telemetry alanı.

Audit'te provider event ID, event type, opaque customer/subscription/order
reference, payload hash, status ve zamanlar tutulur. Telemetry yalnız bounded
event type ve internal student tenant id kullanır; provider secret/token/card
verisi taşımaz. Fastify authorization/token redaction korunur.

## Failure policy

İmza eksik/geçersiz, malformed, stale veya tenant/reference mismatch event
Premium açmaz. Reject audit yazılabiliyorsa `BillingWebhookEvent.REJECTED`
olarak tutulur; audit yazma hatası dışarıya storage detayı sızdırmaz. Provider
retry'leri için yalnız doğrulanmış ve işlem görmemiş event'ler 2xx ile kabul
edilir; duplicate event'ler de güvenli no-op'tur.

Refund işlemi ancak local payment status `SUCCEEDED` ve provider payment ID
varsa başlar. iyzico resmi refund yanıtı başarı olarak doğrulanmadan payment
`REFUNDED` yapılmaz ve entitlement keyfi biçimde kaldırılmaz. Kaynak:
[iyzico Refund & Cancel](https://docs.iyzico.com/en/advanced/refund-and-cancel).

## Test cases

`test/iyzico-billing.test.ts` şu güvenlik sözleşmelerini kapsar:

- IYZWSv2 authorization ve sandbox base URL guard;
- V3 geçerli/missing/forged signature;
- stale replay;
- duplicate no-op ve event payload conflict;
- verified success → one Premium grant;
- canceled/stale ACTIVE → Premium reopen yok;
- client `premium` payload rejection;
- organization checkout rejection;
- invalid signature audit;
- repeated cancellation/refund idempotency keylerinin güvenli NOOP davranışı.

Gerçek sandbox credential/account/webhook feature mevcut olmadığından provider
E2E ve gerçek refund/cancel çağrısı bu aşamada bilinçli olarak çalıştırılmadı.
