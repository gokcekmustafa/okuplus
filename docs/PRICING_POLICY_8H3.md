# OKU+ — 8H-3 Pricing ve Trial Politikası

## Belgenin amacı

Bu belge, OKU+ Free/Premium ürününün ticari karar sınırlarını ve ilerideki
ödeme akışının ürün sözleşmesini tanımlar. 8H-3 bir specification aşamasıdır:
gerçek fiyat, trial, ödeme sağlayıcısı, checkout, migration veya production
billing işlemi içermez.

Karar verilmemiş alanlar bilerek `PRICE_TO_BE_DECIDED` veya
`PENDING_BUSINESS_DECISION` olarak bırakılmıştır. Bu işaretler ürün arayüzünde
gösterilecek değerler değildir.

## Mevcut ürün temeli

| Alan                | Free                                            | Premium                                                |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Plan kodu           | `PLAN_FREE`                                     | `PLAN_PREMIUM`                                         |
| Kapsam              | Kişisel kullanım ve mevcut organization context | Yalnızca kişisel kullanım                              |
| Alıştırma başlatma  | Günde 3                                         | Sınırsız                                               |
| Alıştırma sorusu    | Günde 20                                        | Sınırsız                                               |
| Ödeme               | Yok                                             | 8H-2'de kapalı; satış akışı yok                        |
| Entitlement kaynağı | Varsayılan Free veya server grant               | TEST/manual entitlement grant; gerçek satın alma değil |

Free limitleri mevcut server-side entitlement policy'nin parçasıdır. Premium'un
8H-2'de doğrulanmış aktif faydaları yalnızca sınırsız alıştırma ve sınırsız
sorudur. `ADS_FREE`, `ADVANCED_PROGRESS`, `ADVANCED_REVIEW` ve
`PREMIUM_CONTENT` gelecekteki kodlardır; aktif fayda veya fiyatlandırma vaadi
değildir.

## Pricing kataloğu

| Ürün    | Faturalama dönemi | Fiyat                 | Para birimi                 | Vergi gösterimi             | Karar durumu       |
| ------- | ----------------- | --------------------- | --------------------------- | --------------------------- | ------------------ |
| Free    | Süresiz           | ÜCRETSİZ              | `PENDING_BUSINESS_DECISION` | `PENDING_BUSINESS_DECISION` | Ürün temeli mevcut |
| Premium | Aylık             | `PRICE_TO_BE_DECIDED` | `PENDING_BUSINESS_DECISION` | `PENDING_BUSINESS_DECISION` | İş kararı bekliyor |
| Premium | Yıllık            | `PRICE_TO_BE_DECIDED` | `PENDING_BUSINESS_DECISION` | `PENDING_BUSINESS_DECISION` | İş kararı bekliyor |

Aylık/yıllık fiyat ilişkisi, yıllık indirim veya tasarruf mesajı, fiyatın vergi
dahil gösterilip gösterilmeyeceği, fiyat değişikliğinde mevcut abonelerin
korunması ve bölgesel fiyatlandırma `PENDING_BUSINESS_DECISION`'dır. Yüzde,
para birimi, kampanya veya indirim uydurulmayacaktır.

Karar kesinleştiğinde her satışa sunulan fiyat immutable bir `Price` kimliği ve
geçerlilik dönemiyle kataloglanmalıdır. İstemci fiyatı hesaplamamalı veya
hard-code etmemelidir; yalnızca server'ın yayınladığı aktif katalog snapshot'ını
göstermelidir. Fiyat kararı verilmeden satın alma CTA'sı checkout başlatmamalı
ve sahte fiyat göstermemelidir.

## Trial politikası

Trial seçimi henüz yapılmamıştır. Aşağıdaki seçenekler değerlendirme kümesidir:

| Seçenek                  | Ürün etkisi                                                    | Karar                       |
| ------------------------ | -------------------------------------------------------------- | --------------------------- |
| Trial yok                | Kullanıcı Free'den doğrudan ücretli Premium'a geçer            | `PENDING_BUSINESS_DECISION` |
| 7 gün                    | Kısa deneme, dönüşüm ve iptal iletişimi gerekir                | `PENDING_BUSINESS_DECISION` |
| 14 gün                   | Daha uzun deneme, daha uzun Premium maliyeti/iletişimi gerekir | `PENDING_BUSINESS_DECISION` |
| Diğer süre veya kampanya | Segment, uygunluk ve istisna kuralları gerekir                 | `PENDING_BUSINESS_DECISION` |

Bu nedenle 8H-3 sonunda trial aktif değildir; trial gün sayısı, otomatik dönüşüm,
ödeme yöntemi zorunluluğu ve aynı kullanıcının tekrar trial uygunluğu
tanımlanmamıştır. Uygulama mevcut haliyle trial varmış gibi davranmamalıdır.

Trial kararı alınırsa minimum ürün sözleşmesi şunları içermelidir:

- `NOT_STARTED`: kullanıcı için trial hiç başlatılmamış.
- `ACTIVE`: server tarafından başlatılmış, bitiş zamanı bilinen trial.
- `EXPIRED`: trial süresi bitmiş ve dönüşüm gerçekleşmemiş.
- `CONVERTED`: trial sonrasında doğrulanmış Premium aboneliği başlamış.
- `CANCELED`: trial veya ilişkili dönüşüm kullanıcı/iş kuralı nedeniyle iptal edilmiş.

Bu durumlar billing lifecycle durumlarından ayrı tutulmalıdır. Özellikle
`TRIAL` billing state'i kendi başına mevcut entitlement kodu değildir.

## Gelecek Premium arayüzü için alanlar

Ödeme kararı sonrasında bilgi ekranı veya checkout öncesi plan kartı server'dan
şu alanları alabilir:

- plan adı ve plan kimliği;
- aylık/yıllık fiyat ve para birimi;
- vergi dahil/dahil değil gösterim bilgisi;
- trial varsa süre, uygunluk ve bitiş tarihi;
- ilk ve sonraki yenileme tarihi;
- faturalama dönemi;
- iptal ve dönem sonu erişim açıklaması;
- fatura/ödeme geçmişi bağlantısı.

8H-2 bilgi ekranındaki `paymentAvailable: false` sınırı korunur. Bu aşamada
fiyat, kart, checkout, yenileme veya ödeme sonucu UI'ı eklenmez.

## Kapsam ve ticari sınırlar

8H-3'ün hedefi kişisel Premium subscription sözleşmesidir. Organization
billing, okul lisansı, seat/koltuk hesabı, kurum yöneticisi tarafından ödeme,
kurumun kullanıcı adına entitlement vermesi ve kurum fatura akışı kapsam
dışıdır. Organization scope mevcut uygulamada Free politikasında kalır.

Öğrenci kullanıcıların bir bölümü minor olabilir. Minor subscription,
ebeveyn/veli onayı, ödeme sahibi, iade hakkı ve recurring billing yetkisi
`BUSINESS/LEGAL REVIEW REQUIRED` olarak işaretlenmiştir; bu belge hukuki
sonuç veya yaşa göre otomatik izin üretmez.

Vergi, KDV/VAT, fatura/e-belge, satış ülkesi, hukuki kişi, mesafeli satış,
iptal/iade metni ve muhasebe kayıtları bu pricing kararından ayrı bir
`ACCOUNTING/LEGAL REVIEW REQUIRED` iş akışıdır. Herhangi bir oran veya hukuki
zorunluluk bu belgede varsayılmamıştır.

## 8H-3 uygulama kararı

Bu belge yalnızca ürün ve iş sözleşmesidir. Pricing/trial değerleri kesinleşmeden
kod, database modeli, ödeme sağlayıcısı, webhook veya production billing write
eklenmeyecektir.
