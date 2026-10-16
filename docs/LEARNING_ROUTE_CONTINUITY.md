# Öğrenme rotalarının devamlılığı

Öğrencinin ilk P1 rotasını mevcut ölçüm sözleşmesi seçer. İlk atama yalnızca
`learning-route-catalog.ts` içindeki birinci döngülere yapılır. Daha sonraki
döngüler aynı aile ve kapsam içindeki açık `nextPathCode` bağlantısını izler;
yeniden seviye ölçümü veya farklı bir aile seçimi yapmaz.

Her kaynak kaydı sürümü, üniteleri, değişken uzunluktaki istasyon dizisini,
ön koşulları ve sabit içerik/şablon/değerlendirme sürümlerini taşır. Kaynak
yayın izni ve gerçek PUBLISHED veritabanı grafiği birlikte gereklidir. Veritabanı
kayıtlarının yayımlanmış olması kaynak yayın izninin yerine geçmez.

## Gerçek içerik kapsamı

| Rota            | Hazırlanmış döngüler        | P1 istasyonları                    | Yayın kararı                                                                                        |
| --------------- | --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| A / G8_12       | İlk döngü, Cycle 2, Cycle 3 | 9 + 9 + 7                          | Üç kaynak sürümünün de ürün sahibi yayın kararı kayıtlı; veritabanı grafiği ayrıca PUBLISHED olmalı |
| B, C, D / G8_12 | Her ailede mevcut ilk döngü | Kaynak manifestteki gerçek uzunluk | Mevcut ölçüm ve yayın kuralları korunur                                                             |

P0'ın 22 istasyonu korunur. A rotasında kaynakta toplam 47 gerçek istasyon
vardır; bunların son yedisi Cycle 3 adayıdır. Yüzlerce yayımlanmış içerik mevcut
değildir. 250 istasyonlu sentetik regresyon testi yazılım kapasitesini kontrol
eder; 250 hazırlanmış eğitim içeriğinin kanıtı değildir. Boş istasyon veya aynı
metinden üretilmiş dolgu döngüler eklenmemiştir.

## Çalışma ve erişim

- Tamamlanmış döngüler haritada kalır ve kaynak sırasıyla gösterilir. Kaynak
  sırası metin olarak `CYCLE_10`/`CYCLE_2` karşılaştırmasıyla belirlenmez.
- Geçerli COMPLETED rota kaydı, eski adım bağlantıları eksikse salt okunur
  tarihsel tamamlanma kanıtıdır. Oturum sayısı, puan veya değerlendirme sonucu
  üretilmez; veritabanı tamamlanmaları yeniden yazılmaz.
- İlerleme kanıtları tüm atanmış döngüler için toplu okunur. Öğrenci ve tenant
  filtreleri her kanıt sorgusunda bulunur. Belirsiz eski içerik/şablon
  eşleşmeleri tamamlanma kanıtı sayılmaz.
- P1-A'nın ikinci ve sonraki devam döngülerinde kayıtlı değerlendirme sonucu
  istasyonun tamamlanma kanıtıdır; puan, yeterlik analizi için saklanır ve
  tek başına sonraki döngüye geçişi engellemez. İlk döngü ile diğer ölçme ve
  değerlendirme akışlarının kendi puanlama kuralları değişmez.
- Sonraki yayımlanmış grafik haritada kilitli önizleme olabilir. Bu önizleme
  öğrenci ataması değildir ve sunucu erişimi vermez. Kaynak yayın izni olmayan
  gerçek aday yalnızca yayın bekleyen bölüm bilgisiyle gösterilir.
- Tamamlama ve yenileme sonrası kurtarma aynı geçiş servisini kullanır.
  PAUSED, REASSIGNED ve REVIEW_REQUIRED atamalar etkinleştirilmez. Eski bir
  istek yeni rotayı geri alamaz. Öğrenciye ait rota değişiklikleri transaction
  kilidiyle sıraya alınır; tekil atama anahtarı korunur.
- İçerik, geçerli alıştırma config'i veya değerlendirmesi eksik istasyon
  aktifleşmez. Tamamlanmış istasyonun geçmiş durumu korunur.

## Yeni gerçek döngü ekleme

1. Mevcut program ve manifest sözleşmesinde özgün metinleri, cevap anahtarlarını,
   açıklamaları ve kazanım eşleştirmelerini hazırlayın. Öğretim, uygulama ve
   ölçme kapsamını kaynak doğrulayıcılarıyla kontrol edin.
2. Rota kataloğuna değişmez sürüm ve kaynak kimlikleriyle ekleyin; önceki
   döngünün `nextPathCode` değerini bağlayın. Yeni bir istasyon sayısı sabiti
   veya öğrenci başına seed gerekmez.
3. `npm run qa:learning-cycles` kaynak kapsamını ve yayın izinlerini raporlar.
   Bu rapor production içeriğini `NOT_VERIFIED` olarak tutar.
4. İlgili sürümün açık ürün sahibi yayın kararını kaynakta kaydedin. Mevcut
   korumalı provision sürecinde hedef fingerprint'i, salt okunur plan, çakışma
   kontrolü ve doğrulanmış yedek/geri dönüş kanıtıyla yalnızca yeni grafiği
   uygulayın. Öğrenci ilerlemesi veya toplu atama yazmayın.
5. Onaylı test hesabıyla gerçek geçiş ayrıca doğrulanır. İzole PostgreSQL testi
   production öğrenci akışının kanıtı değildir.

Cycle 3 kaynak sürümü ürün sahibi tarafından açıkça yayımlanmıştır. Bu kaynak
kararı production grafiğini oluşturmaz veya yayımlamaz: uygun öğrencilerin
atanabilmesi için hem kaynak izni hem de eksiksiz PUBLISHED veritabanı grafiği
gerekir. Yedi istasyonlu grafik production'da zaten uygulanmıştır; önceki Cycle
2 rotasını tamamlayan öğrenci normal devam servisiyle 41. istasyona atanabilir.
Yeni akademik eşik, sınıf/yaş eşlemesi veya uzman onayı şartı eklenmez. Daha uzun
rota için yeni, gerçek ve sürümlenmiş içerik paketleri hazırlanmalıdır.
