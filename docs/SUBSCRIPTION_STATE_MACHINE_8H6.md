# OKU+ — 8H-6 Subscription State Machine ve Entitlement Sözleşmesi

## Kapsam ve kaynaklar

Bu belge, 8H-5'te eklenen mevcut billing davranışını denetler. Yeni bir
Prisma billing state'i icat etmez. Kaynak kodu:

- `prisma/schema.prisma`: `BillingSubscriptionStatus`, `BillingPaymentStatus`,
  `BillingWebhookStatus` ve billing modelleri;
- `src/modules/billing/service.ts`: checkout, callback, webhook, cancellation
  ve refund sınırı;
- `src/modules/billing/providers/iyzico/adapter.ts`: provider status ve API
  sözleşmesi;
- `src/modules/entitlements/service.ts`: `PLAN_FREE` / `PLAN_PREMIUM` erişim
  politikası;
- `public/app.js`: mevcut Premium ve sandbox lifecycle UI.

`FREE`, billing tablosunda saklanan bir subscription state'i değildir; aktif
kişisel Premium grant bulunmadığında entitlement resolver'ın türettiği plandır.
`UNKNOWN`, mevcut fail-safe enum değeridir ve erişim açmaz.

## State envanteri

| State      | Persisted?     | Uygulamada mevcut kullanım                                                                                                     | Entitlement enforcement                          |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `FREE`     | Hayır; derived | Aktif kişisel grant yoksa `PLAN_FREE`                                                                                          | Free policy                                      |
| `PENDING`  | Evet           | Checkout transaction local subscription'ı başlatır; provider status map'i de kullanır                                          | Premium yok                                      |
| `TRIAL`    | Evet           | Enum ve provider mapping var; checkout `subscriptionInitialStatus=ACTIVE` gönderdiği için ürün tarafından başlatılan trial yok | `PENDING`, Premium yok                           |
| `ACTIVE`   | Evet           | Yalnız doğrulanmış `subscription.order.success` veya provider checkout status ile görülür                                      | `PLAN_PREMIUM` grant                             |
| `PAST_DUE` | Evet           | `subscription.order.failure` veya provider `UNPAID` mapping'i                                                                  | Şu an fail-safe no-grant; grace kararı `PENDING` |
| `CANCELED` | Evet           | Provider-confirmed immediate cancellation sonrası local state                                                                  | Şu an no-grant; erişim süresi kararı `PENDING`   |
| `EXPIRED`  | Evet           | Provider detail/checkout status mapping'i var; otomatik expiry scheduler/webhook akışı yok                                     | `PLAN_FREE` / no-grant                           |
| `UNKNOWN`  | Evet           | Tanınmayan provider state veya başarısız checkout fallback'i                                                                   | Premium yok                                      |

`TRIAL`, `EXPIRED` ve bazı provider status'ları enum/mapping seviyesinde
mevcuttur; bunların tamamı için çalışan bir provider E2E veya scheduler
olduğu iddia edilmez.

## Transition tablosu

Her satır `CURRENT STATE → EVENT → NEXT STATE → ENTITLEMENT EFFECT` sözleşmesidir.

| Current                           | Event                               | Next                                  | Entitlement effect                                                      |
| --------------------------------- | ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `FREE`                            | server checkout oluşturur           | `PENDING`                             | Grant yok                                                               |
| `PENDING`                         | verified first/renewal success      | `ACTIVE`                              | Personal `PLAN_PREMIUM` grant oluştur/güncelle                          |
| `PENDING`                         | first payment failure               | `PAST_DUE`                            | Grant yok; grace süresi uygulanmaz                                      |
| `TRIAL`                           | verified charge success             | `ACTIVE`                              | Business trial kararı verilmeden Premium açılmaz; success sonrası grant |
| `ACTIVE`                          | renewal success                     | `ACTIVE`                              | Premium korunur; yeni payment/order satırı upsert edilir                |
| `ACTIVE`                          | recurring payment failure           | `PAST_DUE`                            | Current fail-safe no-grant; grace policy `PENDING`                      |
| `PAST_DUE`                        | retry success                       | `ACTIVE`                              | Verified success sonrası Premium grant geri açılır                      |
| `PAST_DUE`                        | retry failure                       | `PAST_DUE`                            | Premium yok; süre/uyarı politikası `PENDING`                            |
| `PENDING` / `ACTIVE` / `PAST_DUE` | provider-confirmed immediate cancel | `CANCELED`                            | Current implementation grant'ı kapatır                                  |
| `ACTIVE` / `PAST_DUE`             | expiry observed                     | `EXPIRED`                             | `PLAN_FREE`; no-grant                                                   |
| `CANCELED`                        | old success/retry webhook           | `CANCELED`                            | Eski grant yeniden açılamaz                                             |
| `EXPIRED`                         | old success/retry webhook           | `EXPIRED`                             | Eski grant yeniden açılamaz                                             |
| terminal old subscription         | new Premium checkout                | old state değişmez; new row `PENDING` | Eski subscription grant'ı açılmaz                                       |
| herhangi                          | unknown provider state              | `UNKNOWN`                             | Premium açılmaz; manuel/reconciliation incelemesi                       |

Webhook ordering guard, subscription üzerindeki `lastEventAt` ile provider
`iyziEventTime` değerini karşılaştırır. Gelen event zamanı mevcut zamana eşit
veya eskiyse event audit'e `IGNORED` yazılır ve billing/payment/entitlement
etkisi oluşturulmaz. Provider'ın bu event sözleşmesinde monotonic sequence veya
version alanı yoktur; `lastProviderVersion` alanı gelecekte provider böyle bir
alan sağlarsa kullanılabilecek ayrılmış alandır, bugün ordering kaynağı değildir.

## Entitlement kararı ile teknik enforcement ayrımı

Ticari politika kesinleşmediğinde `PENDING` ifadesi gerçek bir ürün planı veya
grace süresi değildir. Şu anki güvenlik enforcement'ı yalnızca doğrulanmış
`ACTIVE` için Premium grant eder. `PAST_DUE`, `TRIAL`, `CANCELED` ve `UNKNOWN`
durumlarında otomatik grace timer, otomatik dönem-sonu koruması veya varsayılan
refund sonucu kodlanmaz.

Bu nedenle:

- `ACTIVE → PREMIUM` nettir;
- `EXPIRED → FREE` nettir;
- `PAST_DUE → FREE` görünen mevcut no-grant sonucu teknik fail-safe'tir, ticari
  grace policy değildir;
- `CANCELED` sonrası Premium'un hangi ana kadar korunacağı `PENDING`'dir;
  mevcut immediate cancel adapter'ı grant'ı kapatır;
- `TRIAL` için gün sayısı, otomatik dönüşüm ve entitlement sonucu karara
  bağlanmadıkça UI'da sahte deneme avantajı gösterilmez.

## Renewal ve payment ayrımı

iyzico subscription webhook'unda her ödeme denemesi `orderReferenceCode`,
`iyziReferenceCode` ve subscription/customer reference taşır. Aynı order
reference için `BillingPayment` unique upsert kullanılır; aynı event ID için
webhook inbox no-op olur. Başarılı renewal subscription'ı `ACTIVE` tutar,
başarısız renewal `PAST_DUE` yapar. Retry, provider'ın failed order reference
ile yürüttüğü yeni/tekrar denemedir; provider E2E olmadan gerçek retry zamanı
ve sayısı varsayılmaz.

Payment state finansal kayıttır: `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED`,
`UNKNOWN`. Subscription state değildir. `REFUNDED` payment, tek başına
subscription cancellation anlamına gelmez; entitlement etkisi business kararı
verilene kadar otomatik kapatılmaz. Mevcut model partial refund state'i
taşımadığı için partial refund serviste reddedilir; tam refund için doğrulanmış
provider payment ID ve başarılı provider yanıtı gerekir.

## Cancellation ve reactivation

Mevcut adapter yalnız immediate cancel çağrısını destekler. `cancelAtPeriodEnd`
`true` verilirse açıkça reddeder; resmi iyzico subscription transaction
contract'ında dönem sonu seçeneği bu adapter'ın kullandığı cancel endpoint'i
için belgelenmediği için scheduled cancellation uygulanmış gibi gösterilmez.

Cancellation sonrası billing state, entitlement, UI ve minimum telemetry aynı
işlemin sınırında tutulur: local state `CANCELED`, current grant no-grant, UI
`Abonelik iptal edildi`, telemetry `SUBSCRIPTION_CANCELED`. İptal sonrası
erişimin dönem sonuna kadar korunması kararı ayrıca `PENDING`'dir.

Canceled kullanıcı yeniden satın alırsa eski subscription satırı yeniden
`ACTIVE` yapılmaz. Yeni checkout yeni `BillingSubscription` satırı ve yeni
`IYZICO_SUBSCRIPTION:<id>` entitlement source'u kullanır; provider reference
unique kısıtları ve eski event timestamp guard'ı eski kaydın tekrar açılmasını
engeller.

## Audit ve güvenlik kanıtı

`BillingWebhookEvent` inbox/audit satırı şu alanları taşır: provider veya
internal event ID, provider reference'ları, canonical payload hash,
`occurredAt`, `receivedAt`, `processedAt`, `previousState`, `newState`, status
ve owner scope. Local immediate cancellation da
`subscription.cancel.confirmed` internal event'iyle aynı audit sınırına girer.
Raw provider payload, kart/CVV, API key veya secret saklanmaz. `8H-6` migration'ı
`previousState`/`newState` alanlarını ve subscription zamanı index'ini ekler.

İmza doğrulaması resmi Subscription V3 alan sırasını kullanır:
`secretKey + merchantId + eventType + subscriptionReferenceCode +
orderReferenceCode + customerReferenceCode`, HMAC-SHA256/HEX ve constant-time
karşılaştırma. Eski signature header'ları fallback değildir.

Webhook doğrulaması öncesi event hiçbir entitlement açamaz. Aynı event ID +
aynı hash duplicate no-op'tur; aynı ID + farklı hash conflict'tir. Provider
customer/subscription reference owner ile eşleşmezse event rejected olur.

## UI sözleşmesi

Belirlenmiş lifecycle state'leri için Premium bilgi ekranı Türkçe etiketleri:

- `PENDING` → **Ödeme bekleniyor**
- `PAST_DUE` → **Ödeme başarısız**
- `CANCELED` → **Abonelik iptal edildi**
- `EXPIRED` → **Premium sona erdi**
- `ACTIVE` → **Premium aktif**

`TRIAL` ve `UNKNOWN` için satın alınmış hak veya grace vaadi gösterilmez;
belirsiz durumda doğrulama beklemede mesajı kullanılır. Entitlement kartı
server `PLAN_PREMIUM` snapshot'ını tek erişim kaynağı olarak kullanır.

## Provider karşılaştırması

Resmi iyzico dokümanı subscription webhook'larını success/failure event'leri
ve recurring payment notification'ları olarak tanımlar. Aynı doküman V3
header'ını ve yukarıdaki Subscription imza sırasını zorunlu doğrulama kaynağı
olarak gösterir. Subscription cancel endpoint'i vardır; ancak bu adapter'ın
contract'ında dönem sonu parametresi yoktur. Refund ise finansal payment
işlemidir; iyzico dokümanındaki `/v2/payment/refund` `paymentId` ve `price`
ister. Subscription notification payload'ı payment ID taşımadığından refund
yalnız local doğrulanmış payment ID ile başlatılabilir.

Kaynaklar: [iyzico Webhook](https://docs.iyzico.com/en/advanced/webhook),
[Subscription Transactions](https://docs.iyzico.com/en/products/subscription/subscription-implementation/subscription-transactions),
[Refund & Cancel](https://docs.iyzico.com/en/advanced/refund-and-cancel).
