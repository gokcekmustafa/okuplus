# OKU+ — 8H-3 Billing Lifecycle ve Entitlement Kararları

## Amaç ve mevcut durum

Billing, aboneliğin ticari/ödeme durumunu; entitlement ise uygulamadaki
özelliğe erişim kararını taşır. Bunlar aynı alan veya aynı boolean değildir.
8H-2'de yalnızca `PLAN_FREE` ve `PLAN_PREMIUM` entitlement planları aktiftir.
Gerçek subscription, payment, invoice veya webhook sistemi henüz yoktur.

Mevcut erişim zinciri:

```text
Doğrulanmış server kaynağı → entitlement snapshot → server-side feature access → UI
```

İstemci `plan`, `premium`, fiyat veya billing state göndererek erişim açamaz.
Provider da doğrudan UI'a entitlement vermez.

## Billing durumları

8H-3 için kavramsal billing state kümesi şöyledir:

| Billing state | Anlamı                                            | Entitlement ilişkisi                                                                                |
| ------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `FREE`        | Aktif ücretli abonelik yok                        | Varsayılan `PLAN_FREE`                                                                              |
| `TRIAL`       | Karar verilmiş bir trial dönemi aktif             | Trial ürün kararı ve server doğrulaması olmadan Premium açmaz; politika `PENDING_BUSINESS_DECISION` |
| `ACTIVE`      | Ücretli abonelik doğrulanmış ve aktif             | Politika izin verirse `PLAN_PREMIUM`; provider kaydı tek başına yeterli değildir                    |
| `PAST_DUE`    | Yenileme/ödeme tahsilatı başarısız veya beklemede | Grace süresinde Premium korunacak mı, hemen Free'ye mi dönecek: `PENDING_BUSINESS_DECISION`         |
| `CANCELED`    | İptal talebi veya iptal olayı kaydedilmiş         | Dönem sonuna kadar erişim mi, hemen sona erme mi: `PENDING_BUSINESS_DECISION`                       |
| `EXPIRED`     | Abonelik/trial erişim dönemi sona ermiş           | Etkin başka grant yoksa `PLAN_FREE`                                                                 |

`TRIAL`, `PAST_DUE`, `CANCELED` ve `EXPIRED` mevcut Prisma entitlement planı
değildir; billing alanının yaşam döngüsü durumlarıdır. Mevcut uygulama bunları
okuyup işleyen bir billing resolver çalıştırmaz.

## Önerilen durum geçişleri

```text
FREE ──(trial başlatma kararı)──> TRIAL
FREE ──(doğrulanmış satın alma)─> ACTIVE
TRIAL ──(başarılı dönüşüm)──────> ACTIVE
TRIAL ──(süre biter)────────────> EXPIRED
ACTIVE ──(tahsilat sorunu)─────> PAST_DUE
ACTIVE ──(iptal talebi)─────────> CANCELED
PAST_DUE ──(başarılı tahsilat)─> ACTIVE
PAST_DUE ──(grace sonu)────────> EXPIRED
CANCELED ──(erişim sonu)───────> EXPIRED
```

Geçişler yalnızca doğrulanmış provider olayı, server-side komut veya zaman
tabanlı resolver ile yapılmalıdır. İstemcinin “ödeme başarılı”, “trial aktif”
veya “iptal edildi” iddiası state transition kaynağı olamaz.

## Entitlement eşleme sözleşmesi

Billing state ile entitlement arasındaki eşleme tek merkezde ve denetlenebilir
bir policy olmalıdır:

1. `FREE` veya etkin Premium policy üretmeyen `EXPIRED` için varsayılan
   `PLAN_FREE` hesaplanır.
2. `ACTIVE`, provider ve abonelik kimliği doğrulandıktan sonra kişisel scope'ta
   `PLAN_PREMIUM` grant'i üretebilir.
3. `TRIAL` ancak trial kararı, uygunluk, bitiş zamanı ve server policy'si
   kesinleştiğinde kişisel Premium grant'i üretebilir.
4. `PAST_DUE` için grace ve erişim politikası karar verilene kadar otomatik
   entitlement davranışı tanımlanmış sayılmaz.
5. `CANCELED` için iptal anı ile erişimin biteceği an ayrıdır; dönem sonu
   erişimi kararı verilmeden grant expiry uygulanmaz.
6. Aynı kişide birden fazla kaynak varsa öncelik, çakışma ve grant expiry
   kuralları ayrıca tasarlanmalıdır; client birleştirme yapamaz.

Kişisel Premium, aktif kullanıcının `PERSONAL` scope'una aittir. Organization
scope'a taşınamaz. Organization billing ve kurum lisansı bu aşamada kapsam
dışıdır.

## Operasyon politikaları — karar bekleyen alanlar

### Renewal

Yenileme provider tarafından tahsil edilir ve doğrulanmış olayla subscription
durumuna işlenir. Yenileme tarihi, başarısız tekrar denemeleri, fiyat değişikliği
ve yenileme bildirimi `PENDING_BUSINESS_DECISION`'dır.

### Charge failure ve grace period

Charge failure `PAST_DUE` durumuna geçiş adayıdır. Kaç gün grace verileceği,
bu sırada Premium erişimin korunacağı, bildirim sıklığı ve sonlandırma kuralı
`PENDING_BUSINESS_DECISION`'dır. Grace kuralı belirlenmeden istemciye kalıcı
Premium gösterimi veya ani erişim kesme uygulanmaz.

### Cancellation

İptal komutu server üzerinden provider'a iletilir ve idempotent olmalıdır.
“Dönem sonunda iptal” ile “hemen iptal” seçeneklerinden hangisinin sunulacağı,
entitlement expiry zamanı ve geri dönüş/restore davranışı
`PENDING_BUSINESS_DECISION`'dır.

### Refund

İade, provider ve muhasebe kaydıyla ilişkilendirilmiş ayrı bir olaydır. Tam/kısmi
iade, entitlement'ın hemen sona ermesi, dönem sonuna kadar korunması, trial
dönüşümü ve kullanıcı iletişimi `PENDING_BUSINESS_DECISION`'dır.

### Trial conversion

Trial'ın ücretli aboneliğe otomatik veya kullanıcı onayıyla dönüşeceği,
ödeme yönteminin önceden gerekip gerekmediği ve dönüşüm başarısızlığının
sonucu belirlenmemiştir. Trial kararı alınmadan conversion uygulanmaz.

## Webhook ve güven sınırı

Gelecekteki akışın güvenilir sırası:

```text
Provider webhook
  → signature/secret/timestamp doğrulaması
  → unique provider event + payload kaydı
  → idempotent billing state update
  → entitlement resolver
  → server-side feature enforcement
```

Webhook tekrarları aynı etkiyi ikinci kez oluşturmamalıdır. Geç gelen veya
sırası bozulmuş olaylarda provider event zamanı, subscription version/sequence
ve mevcut state karşılaştırılır; belirsiz olaylar erişim açmadan incelemeye
alınır. Provider'dan gelen `ACTIVE` bilgisi doğrulama ve yetkili kişisel scope
eşlemesi tamamlanmadan entitlement değildir.

## Veri ve audit ilkeleri

İleride billing kaydı şu ayrımları korumalıdır: müşteri kimliği, plan ve price
kimliği, subscription kimliği/durumu, provider referansları, ödeme ve fatura
durumu, event idempotency anahtarı, etkili başlangıç/bitiş zamanları, oluşturma
ve güncelleme zamanları, iptal/iade nedenleri ve audit actor/source bilgisi.

Kart numarası veya CVV gibi ham ödeme verileri OKU+ uygulama veritabanına
alınmamalıdır. Provider secret'ları yalnızca server secret yönetiminde tutulur.

## 8H-3 uygulama kararı

Bu lifecycle specification'tır; state enum'u, billing tablosu, endpoint,
queue, webhook route veya entitlement migration'ı eklenmemiştir. Pricing,
trial, grace, cancellation ve refund kararları onaylanmadan gerçek ödeme
akışı açılamaz.
