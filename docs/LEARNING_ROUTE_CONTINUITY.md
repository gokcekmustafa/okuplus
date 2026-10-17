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

| Rota      | Hazırlanmış toplam | Kaynakta yayın onaylı (üretim ayrı) | Kaynak kanıtlı taslak | Kaynak nitelikli toplam | Kaynak incelemesi gereken | 200 kaynaklı hedefe kalan | Tüm taslaklar dahil kalan | Son aday döngü |
| --------- | -----------------: | ----------------------------------: | --------------------: | ----------------------: | ------------------------: | ------------------------: | ------------------------: | -------------- |
| A / G8_12 |                180 |                                  25 |                   145 |                     170 |                        10 |                        30 |                        20 | Cycle 4–34     |
| B / G8_12 |                165 |                                   5 |                   145 |                     150 |                        15 |                        50 |                        35 | Cycle 3–33     |
| C / G8_12 |                165 |                                   5 |                   145 |                     150 |                        15 |                        50 |                        35 | Cycle 3–33     |
| D / G8_12 |                165 |                                   5 |                   145 |                     150 |                        15 |                        50 |                        35 | Cycle 3–33     |

P0'ın 22 istasyonu korunur ve A/B/C/D sayaçlarına dahil değildir. 18 Ekim 2026
QA çıktısına göre 675 istasyon hazırlanmış olarak kataloglanmıştır; bunlardan
620'si (rota başına kaynakta yayın onaylı istasyonlar ve açık kaynak kanıtı taşıyan
taslaklar birlikte) kaynak nitelikli sayılır. 55 taslak istasyon için kaynak
incelemesi/kanıtı eksiktir. Bu nedenle 800 kaynak nitelikli istasyon hedefine
180 istasyon kalır; tüm yazılmış taslakları sayan salt authored açığı 125'tir.
İki sayı birbirinin yerine kullanılmamalıdır.
Bu sayımlar kaynak manifesti/katalog kapsamıdır, üretimde yayımlanmış grafik
sayısı değildir. A Cycle 4–34 ve B/C/D Cycle 3–33 zincirleri `DRAFT_NOT_RELEASED`
ve yayına kapalıdır; production grafiği ya da öğrenci ataması oluşturulmamıştır.
B/C/D Cycle 2
paketlerindeki metinler özgün kurmacadır ve dış
olgusal iddia içermez. Öğrenme hedefleri MEB program çerçevesiyle, Türkçe yazım
kontrolü TDK'nın 2026 Yazım Kılavuzu'yla ilişkilendirilmiştir. Bu kaynak
referansları insan editör incelemesinin yerine geçmez. Bu adaylar yayımlanmış
veya otomatik atamaya açılmış değildir; mevcut korumalı B/C/D seed'i yalnızca
yayın kararı verilmiş ilk döngüleri işler. Boş istasyon veya aynı metinden
üretilmiş dolgu döngüler eklenmemiştir.

### 800 istasyon hedefinin sınıflandırması

Her rotanın planlanan hedefi: hızlı okuma 60, okuduğunu anlama 80, ortak
stratejiler 20, bütünleşik uygulama 25 ve çoklu beceri değerlendirmesi 15
istasyondur. Kaynak katalog kategorilerinde A/B/C/D başına 150, toplam 600
taslak istasyon sınıflandırılmıştır; bu toplam kaynak doğrulaması bekleyen bazı
taslakları da içerir ve kaynak nitelikli istasyon sayısı değildir. 55 inceleme
bekleyen istasyonun 40'ı genişleme kaynağında `REVIEW_REQUIRED` olarak kayıtlı,
kalan 15'i B/C/D'nin eski Cycle 2 grafiklerinde kaynak kanıtı olmayan istasyonlardır;
hiçbiri kaynak nitelikli toplama eklenmez. `unclassifiedStationCount` kategori
etiketi olmayan eski Cycle 2 istasyonlarıyla birlikte kategori alanı taşımayan
yayın onaylı grafikleri de gösterir; kategori hedeflerine kalan miktar
tamamlanmış gibi hesaplanmaz.
Yeni adayların kaynak metinleri, üçer sorusu, cevap anahtarları, açıklamaları,
beceri etiketleri, kaynak notları ve manifest sürüm bağlantıları
`education-v2-p1-800-draft-cycles.ts` içindedir. Bu kaynak paketi henüz
production seed/provision girdisi değildir ve otomatik atama izni vermez.
18 Ekim 2026'da eklenen Group 9–26, TÜBİTAK Bilim Genç'ten toplam 360 ayrı
kaynak sayfası kullanarak her rotaya toplam 90'ar istasyon ekledi. Group 23'ün 20
istasyonu 60 yeni soruyla A28/B27/C27/D27 taslaklarına, Group 24'ün 20
istasyonu 60 yeni soruyla A29/B28/C28/D28 taslaklarına eklendi; kaynak
bağlantılarının önceki gruplardan ayrışması, soru sürümleri, doğru cevap
konumları ve mekanik seçenek uzunluğu ölçümleri kontrol edildi. Belirgin
uzunluk aykırılığı kalmadı; bu otomatik kontroller semantik doğruluk veya
pedagojik uygunluk onayı değildir. Bu nedenle editoryal inceleme gereklidir.
Anlamsal editoryal onay yine ayrıca gereklidir.

Group 25, 20 ayrı TÜBİTAK Bilim Genç sayfasını ve 60 yeni soru sürümünü
A30/B29/C29/D29 taslaklarına ekledi. Group 26, 20 ayrı TÜBİTAK Bilim Genç
sayfası ve 60 soru sürümü ekleyerek A31/B30/C30/D30 adaylarını tamamladı.
Group 27 ise NASA, NOAA, USGS ve Smithsonian kaynaklarından 20 yeni sayfa ve 60
soru sürümüyle A32/B31/C31/D31 taslaklarını ekledi. Kaynak URL'leri önceki
taslaklarla çakışmayacak şekilde kontrol edildi; her adayda üç soru, cevap
anahtarı, açıklama, beceri etiketi ve kaynak bağlantısı bulunur. Bu kontroller
editoryal doğruluğu veya yayıma hazır olmayı kanıtlamaz. Kaynak doğrulaması
yayına veya öğrenci atamasına izin vermez.

Group 28, NASA, NOAA, USGS, Smithsonian ve NPS sayfalarından 20 yeni kaynak ve 60
soru sürümüyle A33/B32/C32/D32 taslaklarını ekledi. Kaynak sayfaları önceki
gruplarla eşleştirilerek tekrar kontrol edildi; tüm adaylar hâlâ taslak ve
yayımlanmamış durumdadır. Otomatik uzunluk/konum ve manifest kontrolleri içerik
doğruluğunun veya pedagojik uygunluğun editoryal onayı değildir.

Group 29, NASA, NOAA, USGS ve Smithsonian kaynaklarından 20 yeni, önceki
gruplarla çakışmayan kaynak sayfası ve 60 soru sürümü ekleyerek A34/B33/C33/D33
taslaklarını Group 28'e bağlar. Bu adaylar yayımlanmamış kalır; kaynak ve
otomatik kalite kontrolleri uzman editoryal incelemesinin yerine geçmez.

## Soru bankası kalite denetimi

`npm run qa:question-bank`, P0/P1-A/P1-B/C/D rota programlarının, bağımsız
ilk gerçek içerik paketinin ve canonical placement bankasının çoktan seçmeli
soru kaynaklarını, ayrıca yayımlanmamış sürüm adaylarını tarar. Raporun
`currentSourceQuestionCount`, yayımlanmamış
adayları ve revizyon adaylarını ayrı sayması önemlidir; revizyon adayları
mevcut soruların kopya/yeniden yazılmış sürümlerini içerdiğinden toplamları
benzersiz soru sayısı değildir. Üretim grafiği hakkında sonuç üretmez. Doğru
cevabın tek başına en uzun veya en kısa olduğu durumlar,
belirgin uzunluk aykırılıkları, A/B/C/D konum dağılımı, aynı içerik ve beceride
yüksek sözcüksel benzerlik gösteren soru çiftleri ve doğrulanmış editoryal
inceleme durumu raporlanır.

Uzunluk aykırılığı, doğru seçeneğin yanlış seçeneklerden en az 8 normalize
karakter daha uzun veya kısa ve yanlış seçeneklerin medyanına göre en az 1,2
kat farklı olmasıdır. Paket için doğru konum oranının %45'i, doğru seçeneğin
tek başına en uzun/kısa olma oranının %50'yi aşması inceleme sinyali üretir
(en az 8 soruluk paketlerde). Aynı içerik ve beceride Jaccard sözcük benzerliği
%80 ve üstü olan soru kökleri yalnızca tekrar adayıdır; bu ölçüm semantik
tekrarı kanıtlamaz. Eşiklerin hiçbiri doğru cevabın anlamını doğrulamaz veya
öğrenme ölçütü değildir. Yeni B/C/D paketlerinde kalite sinyalleri ve
`editorialReviewStatus=VERIFIED` tamamlanmadan yayın onayı doğrulamadan geçmez.

Cycle 3'ün 43. istasyonundaki yağmur bahçesi alıştırması için doğru cevabı
ayrı su bölümlerini karıştırmayan üç soruluk v4 template/soru sürüm adayı
hazırlandı: açık bilgiyi bulma, neden-sonuç ilişkisi ve iki ayrıntıdan sınırlı
çıkarım. Yayımlanmış v3 soru anahtarları ve öğrenci geçmişi değiştirilmedi;
v4 adayı yayımlanmamış ve editoryal inceleme bekliyor. Ayrıca A Cycle 2'deki
dört, Cycle 3'teki iki uzunluk aykırılığı için tam paket düzeyinde yeni
template/question version adayları oluşturuldu; eski sürüm ve cevap anahtarları
korundu. Bu revizyon adayları mevcut kaynakta görülen altı aykırılığın yerine
geçmiş veya production'a bağlanmış değildir. P0, A ilk döngüsü ve B/C/D ilk
döngülerindeki A/B konum yığılmaları için cevap kimliklerini ve seçenek
metinlerini değiştirmeyen, dengeli sıraya sahip ayrı soru/template sürüm
adayları üretildi. Bu adaylar da yalnızca seçenek konumunu düzeltir; uzunluk
örüntüsü veya semantik kalite onayı sayılmaz. Placement bankasının mevcut
DESIGN_ONLY v1.0.1 sürümü değişmedi; dört MC uzunluk aykırılığı ve tamamı B
konumunda olan dokuz MC madde için ayrı v1.0.2 tasarım adayı hazırlandı. Bu
adayda doğru konumlar A/B/C/D = 3/2/2/2, belirgin uzunluk aykırılığı sıfırdır;
`publicationApproved=false`, `productionAssignmentEnabled=false` ve
`editorialReviewStatus=REVIEW_REQUIRED` olarak kalır. Stable question ID'leri
ve `correctOptionIds` korunur.

Son kaynak denetiminde 144 mevcut rota kaynağı sorusu, 36 yayımlanmamış B/C/D
Cycle 2 sorusu, 9 placement DESIGN_ONLY sorusu ve 129 sürümlü revizyon adayı
soru girdisi taranır. Revizyon paketleri mevcut soruları tekrar içerdiğinden
129 benzersiz yeni soru değildir. Mevcut A Cycle 2/3 kaynaklarında altı
belirgin uzunluk aykırılığı; placement v1.0.1 tasarım kaynağında dört
aykırılık bulunur. Aday sürümler bu mekanik aykırılıkları kaldırır, fakat eski
rota ve placement sürümleri değişmez. İlk P0/A/B/C/D kaynaklarında doğru
cevap konumları dengesizdir; dengeli konum adayları hazırlanmış olsa da
`editorialReviewStatus=REVIEW_REQUIRED` olduklarından yayımlanamaz. Hiçbir
otomatik metrik içerik doğruluğunun editoryal incelemesini ikame etmez.

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
