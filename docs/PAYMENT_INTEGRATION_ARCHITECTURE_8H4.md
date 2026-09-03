# OKU+ — 8H-4 Payment Integration Architecture

## Mimari kararı

Primary provider adayı: **iyzico**.

Secondary provider adayı: **PayTR**.

Stripe teknik olarak kapsamlı olsa da güncel resmi supported-country listesinde
Türkiye merchant hesabı bulunmadığı için Türkiye-first launch için seçilmedi.
Provider seçimi, merchant onboarding ve iş/hukuk onayı tamamlanmadan hiçbir
provider production'a bağlanmaz.

Bu belge provider-independent core domain sözleşmesini kesinleştirir. iyzico
veya PayTR ayrıntıları adapter katmanında kalır; `EntitlementService`, öğrenci
UI'ı, personal/organization context ve mobil istemciler provider ID veya SDK
bilmez.

## 8H-3 contract ile uyumlu kavramsal abstraction

Bu interface yalnızca tasarım sözleşmesidir; bu aşamada TypeScript dosyası,
SDK veya dependency eklenmemiştir.

```ts
interface PaymentProvider {
  readonly providerCode: string;

  createCustomer(input: {
    ownerUserId: string;
    personalTenantId: string;
    idempotencyKey: string;
  }): Promise<{
    providerCustomerId: string;
  }>;

  createCheckout(input: {
    ownerUserId: string;
    personalTenantId: string;
    providerCustomerId: string;
    internalPriceId: string;
    billingPeriod: "MONTHLY" | "YEARLY";
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{
    providerCheckoutId: string;
    redirectUrl: string;
    expiresAt: string | null;
  }>;

  getCheckout(input: { providerCheckoutId: string }): Promise<{
    providerCheckoutId: string;
    status: "OPEN" | "COMPLETED" | "EXPIRED" | "CANCELED";
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
  }>;

  getSubscription(input: { providerSubscriptionId: string }): Promise<{
    providerSubscriptionId: string;
    providerCustomerId: string;
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    cancelAt: string | null;
  }>;

  cancelSubscription(input: {
    providerSubscriptionId: string;
    cancelAtPeriodEnd: boolean;
    idempotencyKey: string;
  }): Promise<{
    providerSubscriptionId: string;
    status: "ACTIVE" | "CANCELED";
    effectiveAt: string;
  }>;

  refund(input: {
    providerPaymentId: string;
    amountMinor: number | null;
    currency: string;
    idempotencyKey: string;
  }): Promise<{
    providerRefundId: string;
    providerPaymentId: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    amountMinor: number;
    currency: string;
  }>;

  verifyWebhook(input: {
    rawBody: Uint8Array;
    headers: Record<string, string | undefined>;
    receivedAt: string;
  }): Promise<{
    providerEventId: string;
    signatureVerified: true;
    occurredAt: string;
    rawPayload: unknown;
  }>;

  parseWebhook(input: {
    verified: {
      providerEventId: string;
      occurredAt: string;
      rawPayload: unknown;
    };
  }): {
    eventType: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerPaymentId: string | null;
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "UNKNOWN";
    effectiveAt: string | null;
    payloadVersion: string | null;
  };

  getPaymentStatus(input: { providerPaymentId: string }): Promise<{
    providerPaymentId: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "UNKNOWN";
    amountMinor: number | null;
    currency: string | null;
  }>;
}
```

`verifyWebhook` authenticity ve replay ön kontrolünü yapar; `parseWebhook`
provider payload'ını normalize eder. Parse edilmiş veri bile tek başına
entitlement değildir; internal tenant/owner eşleşmesi ve state transition
policy'si gerekir. `getCheckout`, `refund` ve `getPaymentStatus` 8H-3'teki
provider-neutral `PaymentProvider` sözleşmesini genişletir; mevcut 8H-3
dokümanıyla geriye dönük uyumludur.

## Katman sınırları

```text
Web / iOS / Android
        ↓
OKU+ Billing API + authorization
        ↓
Billing application service
        ↓
PaymentProvider port
        ↓
iyzico adapter  veya  PayTR adapter
        ↓
Provider API / hosted checkout
```

Core domain yalnız normalize edilmiş `BillingState`, `PaymentStatus`,
`Subscription` ve `EntitlementDecision` tiplerini görür. Provider-specific
status, signature header, merchant reference, token, SDK response veya card
alanı core domain'e sızmaz.

## Checkout mimarisi

```text
Student
  → Premium CTA
  → authenticated Billing API
  → personal owner + individual tenant authorization
  → active Price snapshot validation
  → internal pending checkout kaydı
  → PaymentProvider.createCustomer (idempotent)
  → PaymentProvider.createCheckout (idempotent)
  → hosted provider checkout
  → provider payment
  → success/cancel redirect yalnız UI bilgisi
  → verified webhook
  → billing state update
  → entitlement calculation
  → PLAN_PREMIUM server-side access
```

Kurallar:

1. Client fiyat tutarı, plan, user/tenant owner veya Premium entitlement
   göndererek kararı değiştiremez. Client yalnız internal price ID ve izinli
   billing period isteyebilir; server aktif katalog snapshot'ından tutarı
   çözer.
2. Checkout redirect sonrası client “başarılı” dese bile erişim açılmaz.
   UI, `getCheckout` veya entitlements snapshot'ını server'dan yeniden okur.
3. İlk ödeme sonucu webhook/reconciliation ile doğrulanmadan `ACTIVE` kabul
   edilmez.
4. Kişisel subscription yalnız `PERSONAL` scope ve aktif individual tenant'a
   bağlanır. Organization admin'i başka bir kullanıcının personal
   subscription'ını yönetemez.
5. Web, iOS ve Android aynı billing/entitlement backend'ini kullanır.
   `channel: WEB | IOS | ANDROID` gözlem ve provider routing metadata'sıdır;
   erişim kararının kaynağı değildir.

## Webhook mimarisi

### Güvenilir sıra

```text
Provider
  → raw request capture
  → signature verification
  → timestamp/replay check
  → providerEventId uniqueness
  → WebhookEvent inbox
  → atomic billing state transition
  → entitlement resolver
  → feature enforcement
```

Webhook endpoint'i hızlı biçimde doğrulama sonucunu alıp event'i inbox'a
koymalıdır. Ağır reconciliation veya entitlement hesaplaması transaction ve
queue/worker sınırı içinde yapılabilir. Provider'ın kullanıcı redirect'i,
mobile return URL'si veya ödeme ekranı sonucu trusted source değildir.

### Kesin webhook gereksinimleri

- Provider signature/secret doğrulanır; iyzico için resmi dokümanda
  `X-IYZ-SIGNATURE-V3`, PayTR için callback `hash` doğrulaması gösterilmiştir.
- Raw body parse edilmeden önce imza kontrol edilir.
- Timestamp tolerance ve provider event ID replay koruması uygulanır.
- `WebhookEvent(provider, providerEventId)` unique olmalıdır.
- Event inbox kaydı, ilgili billing state değişikliği ve audit sonucu aynı
  internal transaction boundary içinde tutarlı hale getirilir.
- Aynı event tekrarlandığında sonuç **NO DUPLICATE EFFECT** olmalıdır: ikinci
  payment, refund, subscription update veya entitlement grant üretilmez.
- HTTP retry, worker retry ve provider retry güvenlidir; işlenmiş event için
  önceki sonuç korunur.
- Event order provider tarafından garanti edilmiyorsa event zamanı/provider
  version/sequence karşılaştırılır ve eksik veri için provider read/reconcile
  yapılır.
- Geçersiz imza, bilinmeyen provider ID, tenant mismatch veya parse hatası
  erişim açmadan quarantine/manual review durumuna alınır.

### Eski event güvenliği

Örnek: `ACTIVE → CANCELED` işlendi ve daha sonra eski `ACTIVE` webhook geldi.
Eski event'in `occurredAt`/provider version değeri mevcut state'ten eskiyse
transition uygulanmaz; subscription yeniden Premium açmaz. Cancellation geri
alınmışsa bu, eski event'in replay'i değil, provider'dan gelen yeni ve
doğrulanmış bir version/event olmalıdır. Belirsiz order erişim açmadan
reconciliation'a gider.

## Billing data model — migration değil

Bu bölüm minimum kavramsal modeldir; 8H-4'te Prisma schema veya migration
uygulanmayacaktır.

| Entity            | Minimum alanlar                                                                                                                                                                      | Sınır                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `BillingCustomer` | internal ID, `userId`, individual `tenantId`, `scope=PERSONAL`, provider code/ID, status, created/updated timestamps, provider metadata reference                                    | Organization customer yok; owner authorization zorunlu                 |
| `Subscription`    | internal ID, customer ID, plan/price ID, billing state, provider subscription ID, period/trial/effective/cancel timestamps, version/last event reference, created/updated timestamps | Billing state entitlement planı değildir                               |
| `Payment`         | internal ID, subscription/customer ID, provider payment/order ID, status, amount minor unit, currency, occurred/created/updated timestamps, provider metadata reference              | Raw card number/CVV yok                                                |
| `WebhookEvent`    | internal ID, provider code, unique provider event ID, event type, verified flag, occurred/received/processed timestamps, payload/audit reference, processing status/error            | Raw payload erişimi sınırlı ve secret/card içermeyecek şekilde korunur |
| `Invoice`         | internal ID, customer/subscription/payment ID, provider invoice ID, status, subtotal/total/tax snapshots, currency, issue/due/paid timestamps, document/e-document reference         | Tax/e-document/legal entity kararı ayrı iş akışı                       |

Tutarlar provider contract'e gönderilirken minor unit/decimal kuralıyla ve
currency snapshot'ıyla korunmalıdır. Provider metadata yalnız gerekli opaque
referansları taşır; kart verisi veya secret taşımaz.

## State ve entitlement sınırı

Billing state'leri: `FREE`, `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELED`,
`EXPIRED`. Mevcut entitlement planları yalnız `PLAN_FREE` ve `PLAN_PREMIUM`'dır.

- `ACTIVE` → doğrulanmış kişisel Premium policy → `PLAN_PREMIUM` adayı.
- `TRIAL` → trial business policy + eligibility + server verification →
  `PLAN_PREMIUM` adayı; trial seçimi hâlâ `PENDING_BUSINESS_DECISION`.
- `PAST_DUE` → grace/erişim kararı kesinleşene kadar belirsiz; client erişim
  açamaz.
- `CANCELED` → hemen veya dönem sonu expiry kararı iş kuralıdır.
- `EXPIRED` veya etkin Premium kaynağı olmayan state → `PLAN_FREE`.

Resolver provider event'ini değil, normalize edilmiş ve authorization'dan geçmiş
internal billing kaydını kullanır. Provider state doğrudan UI'a aktarılmaz.

## Güvenlik kuralları

- Card number saklama yok.
- CVV saklama yok.
- Raw payment form veya card payload OKU+ database/log içine yazılmaz.
- Payment secret ve webhook secret yalnız server secret/env yönetiminde tutulur;
  repository, browser bundle ve client response'a girmez.
- Checkout/cancel/refund işlemleri authenticated, personal owner ve tenant
  scope kontrollü server endpoint'lerdir.
- Provider response client trust source değildir.
- Webhook signature, timestamp/replay ve event uniqueness zorunludur.
- Audit minimum olarak actor/source, internal entity, provider event/reference,
  previous/new status, amount/currency snapshot ve timestamp tutar.
- Loglarda token, secret, card, CVV, full provider payload veya kişisel ödeme
  verisi maskelenir/redact edilir.

## Mobile readiness

Önerilen ortak backend yüzeyi:

| API amacı                    | Web                         | iOS                                                   | Android                                               |
| ---------------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Catalog/Price snapshot       | Aynı                        | Aynı                                                  | Aynı                                                  |
| Checkout başlatma            | Hosted web checkout         | Backend-controlled flow veya seçilmiş channel adapter | Backend-controlled flow veya seçilmiş channel adapter |
| Checkout durumu              | Aynı                        | Aynı                                                  | Aynı                                                  |
| Subscription/cancel görünümü | Aynı                        | Aynı                                                  | Aynı                                                  |
| Entitlement                  | `GET /account/entitlements` | Aynı                                                  | Aynı                                                  |

Native uygulama doğrudan iyzico/PayTR SDK'sına bağımlı olmaz. App Store veya
Google Play zorunluluğu doğarsa ilgili store receipt doğrulaması da aynı
internal `PaymentProvider`/billing adapter boundary'sine normalize edilir;
kişisel owner, event idempotency ve entitlement resolver değişmez.

## Personal / organization isolation

8H-4 yalnız **PERSONAL PREMIUM** içindir. Her checkout, customer ve
subscription şu bağları birlikte doğrular:

```text
authenticated user
  + active individual tenant
  + PERSONAL scope
  + internal price ownership
  + provider customer/subscription ownership
```

Organization billing, seat/license, school payer ve organization Premium
**OUT OF SCOPE**. Context switch sonrası personal subscription başka tenant'a
taşınamaz. Bir organization admin'i başka bir personal owner adına
cancel/refund/checkout komutu veremez.

## Minor kullanıcı güvenliği

Oku+ kullanıcı kitlesi minor içerebilir. Payment ownership, parent payer,
parental consent, recurring billing authorization, refund/cancellation
communication ve yaşa bağlı uygunluk `BUSINESS/LEGAL REVIEW REQUIRED`'dır.
Kod ve provider seçimi bu noktaları varsayarak otomatik ödeme veya onay üretmez.

## Sandbox ve test stratejisi

### Provider bağlantısı açılmadan

- Gerçek provider production hesabı kullanılmaz.
- Secret/credential repository'ye yazılmaz.
- Local TEST uygulamasında fake/no-op adapter veya fixture ile core domain
  state transition test edilir; gerçek checkout açılmaz.

### Provider seçildikten sonra sandbox planı

**iyzico:** Resmi sandbox base URL'si, ayrı sandbox credential'ları ve test
kartları kullanılmalı; sandbox subscription plan/checkout, başarılı/başarısız
recurring payment, refund, cancel ve signature fixture'ları hazırlanmalıdır.

**PayTR secondary:** `test_mode`, resmi test kartları ve Postman/test araçları
ile ilk ödeme, callback hash, registered-card recurring, retry/failure ve
refund senaryoları test edilmelidir.

### Ortak webhook fixture matrisi

- geçerli signature + yeni event → bir kez state update;
- aynı event ID + aynı payload → NO DUPLICATE EFFECT;
- geçersiz signature veya eski timestamp → reject/quarantine;
- `ACTIVE → CANCELED` sonrası eski `ACTIVE` → Premium yeniden açılmaz;
- aynı state event'i iki worker'da yarışırsa tek sonuç;
- provider event'i tenant/customer ile eşleşmezse erişim açılmaz;
- payment pending/success/failure/refund ve subscription trial/active/past_due/
  canceled/expired normalization;
- provider timeout/5xx sonrası safe retry ve reconciliation;
- iOS/Android/Web channel'ları aynı internal entitlement sonucunu üretir.

Bu testler sandbox credentials'ı source control'e koymadan, secret injection ve
redacted logs ile yürütülmelidir.

## Uygulama ve rollout kapısı

İleride kodlamaya geçmeden önce şu onaylar gerekir:

1. iyzico merchant/account eligibility ve imzalı provider sözleşmesi;
2. pricing/currency/trial/cancel/refund/grace iş kararları;
3. accounting/legal, invoice/e-document, tax ve minor-user kararları;
4. provider sandbox contract ve webhook fixture seti;
5. internal billing schema + migration review;
6. TEST-only end-to-end pass;
7. production secret, webhook URL, deployment ve rollback onayı.

8G-8 production DB/deployment ve 8G-9B production catalog blocker'ları açıkken
checkout veya billing migration promotion yapılmayacaktır.

## 8H-4 kapsam kararı

Bu aşamada provider comparison, öneri ve integration architecture dokümante
edildi. Production DB bağlantısı, production write, gerçek ödeme, canlı
checkout, canlı webhook activation, provider SDK/dependency veya migration
eklenmedi.
