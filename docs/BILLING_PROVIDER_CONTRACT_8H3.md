# OKU+ — 8H-3 Billing Provider Contract

## Sözleşmenin sınırı

Bu belge provider-neutral bir tasarım sözleşmesidir. Herhangi bir sağlayıcı
seçilmemiş, SDK/dependency eklenmemiş, gerçek checkout veya webhook route'u
uygulanmamıştır. Aşağıdaki arayüz yalnızca dokümantasyondaki kavramsal
contract'tır; repository source code değildir.

Provider seçimi `PENDING_BUSINESS_DECISION`'dır. Web checkout, App Store/Google
Play billing, yerel ödeme yöntemi veya başka bir kanal seçilirse bu contract'ın
server-side doğrulama ve idempotency ilkeleri korunmalı, kanal ayrıntıları
adapter içinde kalmalıdır.

## Kavramsal PaymentProvider arayüzü

```ts
interface PaymentProvider {
  createCustomer(input: { tenantId: string; userId: string; idempotencyKey: string }): Promise<{
    providerCustomerId: string;
    provider: string;
  }>;

  createCheckout(input: {
    tenantId: string;
    userId: string;
    providerCustomerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{
    checkoutId: string;
    redirectUrl: string;
    expiresAt: string | null;
  }>;

  cancelSubscription(input: {
    providerSubscriptionId: string;
    cancelAtPeriodEnd: boolean;
    idempotencyKey: string;
  }): Promise<{
    providerSubscriptionId: string;
    status: "CANCELED" | "ACTIVE";
    effectiveAt: string;
  }>;

  getSubscription(input: { providerSubscriptionId: string }): Promise<{
    providerSubscriptionId: string;
    customerId: string;
    priceId: string;
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
  }>;

  verifyWebhook(input: { rawBody: Uint8Array; signature: string; receivedAt: string }): Promise<{
    providerEventId: string;
    eventType: string;
    occurredAt: string;
    payload: unknown;
  }>;
}
```

Alanlar provider'ın ham response'unu doğrudan dışarı sızdırmamalıdır. Opaque
provider kimlikleri normalize edilmiş billing kaydına yazılır; uygulama plan,
price ve lifecycle durumlarını kendi sözleşmesiyle kullanır.

## Operasyon kontratları

### `createCustomer`

Server, kişisel subscription sahibi kullanıcı ve aktif individual tenant
bağlamıyla çağırır. Aynı `tenantId`/`userId` için idempotent customer kaydı
olmalıdır. Provider customer kimliği OKU+ kullanıcı kimliği yerine geçmez.

### `createCheckout`

Server, yayınlanmış aktif `Price` kaydı ve yetkili kişisel kullanıcıyla çağırır.
Fiyat tutarı istemciden kabul edilmez. Başarılı response yalnızca provider'ın
checkout referansını ve güvenli yönlendirme bilgisini döndürür; checkout sonucu
veya client redirect'i entitlement değildir. Aynı idempotency anahtarı yeniden
gönderildiğinde ikinci checkout/subscription oluşturmamalıdır.

### `cancelSubscription`

Yetkili kişisel kullanıcı isteği, mevcut provider subscription referansı ve
iptal politikasıyla çağırılır. `cancelAtPeriodEnd` kararı ürün politikasından
gelir; istemci bu kararı serbestçe değiştiremez. Retry aynı sonucu üretmelidir.

### `getSubscription`

Reconciliation veya kullanıcıya ait billing görünümü için provider durumunu
okur. Response, webhook akışının yerine geçmez; önemli state değişiklikleri
verified event veya açık reconciliation kuralıyla işlenir.

### `verifyWebhook`

Raw body değiştirilmeden provider imzası, secret, timestamp ve provider event
kimliği doğrulanır. Sadece doğrulama başarılıysa normalize edilmiş event inbox'a
alınabilir. Geçersiz imza, bozuk payload, bilinmeyen subscription veya tenant
eşleşmezliği erişim açmayan bir hata olarak kaydedilir.

## Güvenilir veri akışı

```text
Provider
  → verifyWebhook
  → WebhookEvent inbox (unique providerEventId)
  → Billing Subscription/Payment/Invoice update
  → entitlement calculation
  → PLAN_PREMIUM veya PLAN_FREE
  → feature enforcement
```

Client hiçbir billing state'i set edemez. Başarı URL'si, mobil receipt veya
UI'daki “ödeme tamamlandı” mesajı yalnızca kullanıcı akış bilgisidir; server
doğrulaması olmadan Premium grant üretmez.

## Kavramsal veri modeli

Bu bölüm migration değildir. Alanlar ilerideki tasarım için minimum ayrımları
belirtir.

| Entity         | Sahiplik ve ana bağ                      | Minimum alan grubu                                                                                                                         |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Customer`     | Kişisel `userId` + individual `tenantId` | internal id, provider, provider customer ref, created/updated timestamps                                                                   |
| `Subscription` | Customer + kişisel owner                 | internal id, plan/price refs, billing state, period/trial/effective timestamps, provider subscription ref                                  |
| `Plan`         | Ürün kataloğu                            | stable code, display name, active flag, capability policy, version timestamps                                                              |
| `Price`        | Plan'ın immutable ticari sürümü          | stable price id, billing period, amount/currency karar alanları, tax display policy, validity timestamps                                   |
| `Payment`      | Subscription ve provider event           | internal id, amount/currency snapshot, status, provider payment ref, occurred/created timestamps                                           |
| `Invoice`      | Customer + subscription/payment          | internal id, status, provider invoice ref, totals/tax fields, issue/due/paid timestamps, document metadata                                 |
| `WebhookEvent` | Provider ve event inbox                  | unique provider event id, event type, verified status, raw/normalized audit ref, received/occurred/processed timestamps, processing result |

Organization billing bu modelin parçası değildir. Bir organization tenant'a
kişisel customer veya kişisel Premium grant'i bağlanamaz.

## Idempotency ve ordering

Her checkout, customer creation, cancellation ve subscription update işlemi
idempotency anahtarına sahip olmalıdır. Webhook inbox provider event id'yi
unique tutmalı; retry aynı event'i yeniden işleyip ikinci ödeme, ikinci grant,
ikinci iptal veya ikinci audit sonucu üretememelidir.

Tekrarlı ve sırası bozulmuş event'lerde:

- aynı provider event id tekrarında önceki normalize edilmiş sonuç döndürülür;
- subscription version/occurredAt daha eskiyse mevcut daha yeni state korunur;
- eşit zamanlı farklı event'ler transaction/lock veya eşdeğer atomic işlemle
  sıralanır;
- doğrulanamayan veya tenant'la eşleşmeyen event erişim açmadan quarantine/
  manual review yoluna gider.

## Güvenlik ve uyum

- Webhook imzası ve secret doğrulaması server-side yapılır.
- Timestamp tolerance ve provider event replay koruması zorunludur.
- Billing endpoint'leri authenticated ve owner/tenant scope kontrollü olur.
- Provider secret, kart verisi, CVV ve gizli token repository'ye yazılmaz.
- State değişiklikleri actor, source, provider event ve zaman bilgisiyle audit edilir.
- Vergi/KDV/VAT, fatura/e-belge, hukuki kişi, satış ülkesi ve muhasebe
  mutabakatı `ACCOUNTING/LEGAL REVIEW REQUIRED` kapsamındadır.
- Minor kullanıcı için veli/ebeveyn onayı, ödeme sahibi, recurring billing ve
  iade/iptal akışı `BUSINESS/LEGAL REVIEW REQUIRED` kapsamındadır.

## 8H-3 uygulama kararı

`PaymentProvider` bu aşamada yalnızca kavramsal kontrattır. TypeScript
interface'i, provider SDK'sı, env secret'ı, billing tablosu, API route'u,
webhook endpoint'i veya gerçek ödeme işlemi eklenmemiştir.
