# OKU+ — 8H-2 Billing / Entitlement Boundary

## Amaç

Billing ve ürün erişimi ayrı sorumluluklardır. 8H-2 yalnızca entitlement
deneyimini ve ödeme öncesi bilgi yüzeyini kurar; billing sistemi
uygulamaz.

## Sorumluluk ayrımı

### Billing alanı — bu aşamada yok

Billing ileride müşteri, ödeme yöntemi, fatura, provider transaction,
provider doğrulaması ve webhook konularını kapsar. 8H-2'de aşağıdakiler yoktur:

- Stripe, iyzico veya PayTR entegrasyonu
- Kart bilgisi, checkout veya satın alma endpoint'i
- Provider transaction tablosu veya webhook kabulü
- Fiyat, kampanya ya da indirim hesabı

### Entitlement alanı — mevcut ve aktif

Entitlement plan, scope, feature policy, günlük kullanım, reset zamanı ve
uygulamaya erişim kararını kapsar. Mevcut plan kodları `PLAN_FREE` ve
`PLAN_PREMIUM`; mevcut scope'lar `PERSONAL` ve `ORGANIZATION`'dır.

`/account/entitlements` mobil istemciye uygun bir snapshot döndürür. Günlük
limit tüketimi merkezi service üzerinden atomik ve idempotent biçimde
uygulanır. Sunucu, istemcinin gönderdiği plan veya Premium iddiasını dikkate
almaz.

## Gelecekteki doğrulama akışı

```text
Provider transaction
        ↓
Verified billing record
        ↓
Entitlement update
        ↓
Server-side feature access
        ↓
Web / mobile UI
```

Provider hiçbir zaman doğrudan UI yetkisi vermez. Uygulama erişimi yalnızca
sunucu tarafında doğrulanmış entitlement grant'i ile belirlenir. Web ve mobile
aynı merkezi entitlement sözleşmesini kullanmalıdır.

## Trial ve yaşam döngüsü sınırı

Trial alanları bu migration'da eklenmemiştir. Gelecekte ihtiyaç doğrulanırsa
`trialStartedAt`, `trialEndsAt` ve status türetimi billing'den bağımsız olarak
entitlement kararına beslenir. `TRIAL`, `EXPIRED` ve `CANCELED` durumları
şimdilik pasiftir; mevcut uygulama yalnızca Free/Premium planlarını
değerlendirir. Süresi dolmuş grant aktif kabul edilmez ve Free varsayılanına
döner.

## Scope güvenliği

Kişisel Premium yalnızca ilgili kullanıcının `PERSONAL` tenant scope'unda
geçerlidir. Organization Premium uygulanmamıştır. Context switch sırasında
tenant, membership, scope ve grant birlikte yeniden çözülür; bir scope'un
entitlement'ı diğer scope'a taşınmaz.

## 8H-2 ürün sonucu

Premium CTA ve paywall yalnızca bilgilendiricidir. Kullanıcıyı ödeme sayfasına
götürmez, ödeme olayı üretmez ve kendi başına erişim açmaz. Bu sınır, gerçek
billing entegrasyonu eklenmeden önce korunmalıdır.
