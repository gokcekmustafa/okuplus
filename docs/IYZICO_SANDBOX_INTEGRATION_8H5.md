# OKU+ — 8H-5 iyzico Subscription Sandbox Integration

## Kapsam ve karar

Bu aşama yalnız **iyzico SANDBOX** içindir. Uygulama production base URL'sini
ve production credential'ını kabul etmez. Sandbox credential bulunmadığı için
gerçek sandbox E2E checkout bu teslimatta **BLOCKED** bırakılmıştır; credential
uydurulmamış, provider'a ağ çağrısı yapılmamıştır.

Resmi iyzico subscription akışı product → pricing plan → subscription →
webhook adımlarından oluşur. Subscription yalnızca kredi kartı ile çalışır.
Plan reference code'u iyzico merchant panel/API'sinde oluşturulup server env'e
verilir; fiyat uygulama client'ından alınmaz.

Kaynaklar: [iyzico Subscription Implementation](https://docs.iyzico.com/en/products/subscription/subscription-implementation),
[Initialize Subscription](https://docs.iyzico.com/en/getting-started/preliminaries/api-reference-beta/subscription/subscription/initialize-subscription),
[Subscription Transactions](https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions),
[Sandbox](https://docs.iyzico.com/en/getting-started/preliminaries/sandbox).

## Environment

Değerlerin tamamı server environment/secret manager'dan gelir; repo, browser
bundle, response veya log içine gerçek değer yazılmaz.

```text
IYZICO_API_KEY=
IYZICO_SECRET_KEY=
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
IYZICO_MERCHANT_ID=
IYZICO_SUBSCRIPTION_PLAN_MONTHLY=
IYZICO_SUBSCRIPTION_PLAN_YEARLY=
IYZICO_CHECKOUT_CALLBACK_URL=https://<verified-test-host>/billing/iyzico/checkout/callback
IYZICO_WEBHOOK_MAX_AGE_SECONDS=86400
```

`IYZICO_BASE_URL` yalnızca `https://sandbox-api.iyzipay.com` olabilir. Plan
reference code, merchant ID ve erişilebilir HTTPS callback URL yoksa catalog
checkoutEnabled olmaz ve checkout başlatılmaz. Tutar/currency business kararları
8H-3'te açık olduğu için fiyat UI'da uydurulmaz; iyzico planı merchant panelinde
TRY olarak doğrulanmalıdır.

Sandbox hesabı ve ayrı API/secret çiftleri [resmi sandbox kurulumundan](https://docs.iyzico.com/en/getting-started/preliminaries/sandbox),
test kartları [resmi test kartları sayfasından](https://docs.iyzico.com/en/add-ons/test-cards)
alınır. Bu teslimatta bu değerler mevcut değildir.

## Checkout akışı

```text
Premium CTA
  → authenticated POST /billing/checkout
  → personal + INDIVIDUAL + STUDENT owner check
  → server plan reference ve idempotency kontrolü
  → local BillingCustomer / BillingCheckout / BillingSubscription(PENDING)
  → iyzico POST /v2/subscription/checkoutform/initialize
  → token + checkoutFormContent
  → provider checkout
  → callback token → GET /v2/subscription/checkoutform/{token}
  → verified subscription webhook
  → normalized billing state
  → personal PLAN_PREMIUM entitlement
```

iyzico'nun resmi subscription Checkout Form initialize endpoint'i
`/v2/subscription/checkoutform/initialize`'dır. Response `token`,
`checkoutFormContent` ve token geçerlilik süresini taşır. `callbackUrl`,
`pricingPlanReferenceCode`, `subscriptionInitialStatus` ve customer bilgisi
gönderilir. Hosted form kullanıldığı için OKU+ raw card number/CVV almaz.

`createCustomer` adapter portunda bilinçli olarak no-op'tur: resmi subscription
belgelerinde bağımsız customer-create endpoint'i yoktur; subscriber reference
subscription initialize sonucunda email'e göre materialize edilir. Bu reference
callback veya verified provider verisiyle local `BillingCustomer` satırına
yazılır. [Subscriber Transactions](https://docs.iyzico.com/en/getting-started/preliminaries/api-reference-beta/subscription/subscriber-transactions)
bu email tabanlı davranışı ve GET/UPDATE subscriber yüzeyini belgeler.

## Endpoint sözleşmesi

- `GET /billing/catalog`: provider/environment ve plan yapılandırma durumunu
  döndürür; secret veya plan reference code döndürmez.
- `POST /billing/checkout`: body yalnız `billingPeriod`; idempotency için
  `Idempotency-Key` header veya bounded body key kullanılabilir. Client amount,
  currency, user/tenant, provider ID veya `premium` gönderemez.
- `GET /billing/checkouts/:checkoutId`: provider checkout sonucunu okur;
  redirect sonucu tek başına entitlement değildir.
- `GET /billing/subscription`: kişisel kullanıcının normalize edilmiş state'ini
  döndürür.
- `POST /billing/subscription/cancel`: server owner check sonrası iyzico
  `/v2/subscription/subscriptions/{subscriptionReferenceCode}/cancel` çağrısını
  yapar. iyzico subscription cancel endpoint'i dönem sonu seçeneği sunmadığı
  için bu adapter `cancelAtPeriodEnd=true` kabul etmez.
- `POST /billing/iyzico/checkout/callback`: provider token callback'ini alır,
  checkout result query'sini yapar, Premium açmaz.
- `POST /billing/webhooks/iyzico`: yalnız doğrulanmış subscription webhook
  state transition'ı uygular.

## State mapping

| iyzico değeri/event          | OKU+ billing state | Entitlement etkisi                                     |
| ---------------------------- | ------------------ | ------------------------------------------------------ |
| `PENDING`                    | `PENDING`          | Premium yok                                            |
| `ACTIVE` / `UPGRADED`        | `ACTIVE`           | verified success event sonrası personal Premium        |
| `UNPAID`                     | `PAST_DUE`         | Premium grant kaldırılır; retry/reconciliation gerekir |
| `CANCELED`                   | `CANCELED`         | provider confirmation sonrası grant kaldırılır         |
| `EXPIRED`                    | `EXPIRED`          | grant kaldırılır                                       |
| bilinmeyen                   | `UNKNOWN`          | fail-safe; erişim açılmaz                              |
| `subscription.order.success` | `ACTIVE`           | verified + owner/provider match sonrası grant          |
| `subscription.order.failure` | `PAST_DUE`         | grant açılmaz/kaldırılır                               |
| bilinmeyen event             | `UNKNOWN`          | audit `IGNORED`, state değişmez                        |

`ACTIVE → CANCELED` sonrasında `occurredAt` daha eski event state'i açamaz.
Provider event ID ve payload fingerprint aynı değilse conflict audit kaydı
oluşur; aynı event/payload ikinci kez işlenmez.

## Persistence

8H-5 migration'ı minimum normalize edilmiş yapıyı ekler:

- `BillingCustomer`: personal user/tenant, provider code/reference;
- `BillingCheckout`: bounded idempotency, token, plan-period ve checkout state;
- `BillingSubscription`: provider reference, normalized state, period/timeline;
- `BillingPayment`: order reference, optional payment/refund reference,
  amount/currency snapshot;
- `BillingWebhookEvent`: verified flag, event ID, event type, occurrence,
  payload hash, owner scope ve processing status.

Raw card number, CVV, secret veya full raw provider payload tutulmaz. Webhook
payloadı yalnız canonical hash ve gerekli opaque reference alanlarıyla audit
edilir.

## Cancellation / refund

Subscription cancellation sandbox provider API'si üzerinden yapılır ve local
state owner scope içinde güncellenir. Stale success event'i last event zamanı
guard'ıyla Premium'u tekrar açamaz.

Refund adapter'ı resmi `/v2/payment/refund` endpoint'ini kullanır. iyzico
refund işlemi `paymentId` + `price` üzerinden full/partial olabilir ve resmi
dokümana göre 365 gün içinde yapılabilir. Subscription webhook payloadı
`paymentId` değil `orderReferenceCode` taşıdığından, doğrulanmış payment ID
olmayan kayıt refund için `REVIEW REQUIRED` olarak kalır; keyfi refund veya
keyfi entitlement kaldırma yapılmaz. [Refund & Cancel](https://docs.iyzico.com/en/advanced/refund-and-cancel)

## Mobile readiness

Web, iOS ve Android aynı OKU+ billing endpoint'lerini kullanır. Provider SDK,
API key, secret, webhook signature veya callback mantığı mobile bundle'a
taşınmaz. Native checkout/provider-store kararı sonraki aşamanın kapsamıdır.

## Troubleshooting

1. Catalog `checkoutEnabled=false`: credential, merchant ID, iki plan reference
   ve HTTPS callback env'lerini secret değerlerini yazdırmadan kontrol edin.
2. `IYZWSv2` auth hatası: sandbox credential ile sandbox base URL eşleşmesini
   kontrol edin; resmi [HMACSHA256 Auth](https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth)
   formülü `randomKey + uri.path + request.body` HMAC-SHA256 ve Base64
   authorization kullanır.
3. Webhook gelmiyor: merchant panelinde HTTPS Subscription Notifications URL
   ve X-IYZ-SIGNATURE-V3 özelliğinin etkinleştirildiğini kontrol edin. iyzico
   resmi webhook dokümanı bu özelliğin hesapta aktive edilmesi gerektiğini
   belirtir.
4. Premium açılmıyor: callback sonucu tek başına yeterli değildir; provider
   customer/subscription reference mapping'i ve geçerli V3 signature gerekir.
