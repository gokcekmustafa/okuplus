# OKU+ — 8H-2 Premium Feature Map

## Kapsam

Bu belge 8H-2 kapsamındaki Premium deneyiminin ürün sözleşmesidir. Kaynak
entitlement kararı `GET /account/entitlements` endpoint'idir. İstemci planı,
`premium=true` veya benzeri bir payload alanını erişim kararı olarak kullanmaz.

## Aktif ve doğrulanmış Premium yetenekleri

| Yetenek                                         | Free     | Premium  | Durum |
| ----------------------------------------------- | -------- | -------- | ----- |
| Alıştırma başlatma (`PRACTICE`)                 | Günde 3  | Sınırsız | Aktif |
| Alıştırma sorusu gönderme (`PRACTICE_QUESTION`) | Günde 20 | Sınırsız | Aktif |

Premium erişimi mevcut TEST entitlement grant'i ile doğrulanabilir. Ödeme,
satın alma veya gerçek müşteri aboneliği bu aşamanın parçası değildir.

## Etkin olmayan gelecek yetenekleri

Aşağıdaki kodlar ürün planında gelecekteki alanları işaretler; 8H-2'de
erişim vermez, CTA'da aktif fayda olarak gösterilmez ve entitlement policy'ye
eklenmemiştir:

- `ADS_FREE` — reklamsız kullanım
- `ADVANCED_PROGRESS` — gelişmiş ilerleme
- `ADVANCED_REVIEW` — gelişmiş tekrar
- `PREMIUM_CONTENT` — Premium içerik kataloğu

Bu alanlar için fiyat, kampanya, indirim, ödeme yöntemi veya teslim tarihi
taahhüt edilmez.

## UX durumları

Öğrenci arayüzü aşağıdaki deterministik durumları kullanır:

- `FREE_ACTIVE`: Ücretsiz plan ve günlük hak mevcut.
- `FREE_LIMIT_WARNING`: Sınırlı özelliklerden birinde son hak.
- `FREE_LIMIT_REACHED`: Alıştırma veya soru hakkı tükendi; paywall bilgi diyaloğu açılır.
- `PREMIUM_ACTIVE`: Kişisel Premium entitlement aktif; iki sınırlı kullanım sınırsızdır.

Plan ve kullanım bilgisi kişisel/kurum bağlamı değiştiğinde yeniden yüklenir.
Kuruluş Premium'u bu aşamada uygulanmamıştır; kişisel ve kuruluş scope'ları
birbirine karıştırılmaz.

## CTA ve ödeme sınırı

`OPEN_PREMIUM_INFO` yalnızca bilgilendirme ekranını açan iç aksiyondur.
Alıştırma limiti, soru limiti ve hesap/plan kartındaki CTA aynı bilgi ekranına
gider. Ödeme bağlantısı kapalıdır; Stripe, iyzico, PayTR, kart, checkout ve
webhook bulunmaz.

## Trial durumu

Trial için bu aşamada veri alanı veya migration eklenmemiştir. Gelecekte
gerekirse `trialStartedAt`, `trialEndsAt` ve türetilmiş trial status alanları
ayrı bir ürün ve billing kararıyla ele alınacaktır. Mevcut plan durumları
yalnızca `PLAN_FREE` ve `PLAN_PREMIUM`'dır.
