# OkuPratik — Akademik Dayanak, Canlı Müfredat ve Eğitim Kalitesi Denetimi

**Denetim tarihi:** 25 Ekim 2026

**Kaynak kodu başlangıç SHA'sı:** `937002387b81bfb2d49437d1201d5a4785eb11b3` (`master`)

**Genel durum:** `PARTIAL`
**Üretim durumu:** `UNVERIFIED`

## 1. Kısa sonuç

Bu çalışma kaynak kodu, müfredat katalogları, mevcut QA çıktıları, ölçme/analitik servisleri ve güncel resmî/akademik kaynakları kapsar. Üretim veritabanına bağlanılmadı; üretimde hangi öğrenme yolu grafiklerinin yayımlı veya öğrencilere erişilebilir olduğu bu denetimde doğrulanmadı. Önceki raporlar ve kaynak kodundaki yayın bayrakları canlı veri kanıtı yerine kullanılmadı.

Statik kaynakta A rotası için 220, B/C/D için 205'er istasyon tanımı bulunuyor. Bu sayılar oynanabilir veya yayımlanmış istasyon sayısı değildir. Kaynak QA'nın kendi “kaynak niteliği” sayımları A=210 ve B/C/D=190'ar gösterirken kategori sınıflandırmaları hedeflerle uyuşmuyor ve A rotasındaki 210 sayısı 200 hedefini aşıyor. Bu nedenle 800 gerçek ve kalite onaylı istasyon tamamlandı sonucu çıkarılamaz.

Üretim incelemesi için depoda bulunan `production-education-v2-p0-audit.yml` workflow'u yalnızca P0 grafiğini denetliyor ve `production-migration` ortamı erişimi gerektiriyor. Bu oturumda GitHub Actions dispatch/ortam sırrı erişimi bulunmadığından workflow çalıştırılmadı. Dolayısıyla üretimdeki öğrenci kapsamı, gerçek yayın grafiği, içerik sürümleri ve canlı geçişler `UNVERIFIED` kalır.

Denetimde doğrulanabilir bir analitik kusuru düzeltildi: yönetici analitiği farklı değerlendirme formlarının puanlarını başlangıç farkı gibi çıkarabiliyordu; çoklu tenant görünümünde ise farklı kayıtlardaki ilk puanları birbirinden çıkarıyordu. Bireysel fark artık yalnızca aynı assessment kimliğindeki, başlangıçtan sonra tamamlanmış ayrı bir sonuç varsa hesaplanıyor. Birleşik çoklu-tenant görünümünde tek bir karşılaştırma bağlamı olmadığından başlangıç puanı, son puan ve fark null bırakılıyor. Bu puan farkı yine de etki kanıtı veya nedensel gelişim ölçüsü değildir.

## 2. Kapsam ve kanıt sınırları

- Başlangıçta çalışma alanı `master` dalında, `937002387b81bfb2d49437d1201d5a4785eb11b3` commit'inde ve temizdi.
- `qa:learning-cycles` kaynak manifesti ve statik rota zincirini doğrular; üretim grafiğini açıkça `NOT_VERIFIED` olarak raporlar.
- `qa:question-bank` katalog kimliklerini, sürüm tekrarlarını ve seçenek konumu/uzunluğu gibi mekanik göstergeleri raporlar. Bu ölçümler soru anlamını, metin kanıtını veya cevap anahtarının doğruluğunu kanıtlamaz.
- `academic-reading-p0.ts` öğretim hedefi ve ders sözleşmesi tanımlar; kendi başına öğrenciye sunulmuş veya üretimde yayımlanmış içerik kanıtı değildir.
- `qa:curriculum-pack` ve `qa:curriculum-fixtures` TEST ortamı değişkeni olmadan kapalı kalır. Bu denetimde onları zorlamak veya üretim verisine yönlendirmek yerine çalıştırılmadı.
- Bütün 2.529 benzersiz çoktan seçmeli soruya bu turda tek tek insan semantik incelemesi yapılmadı. Tam kapsam sayıları statik katalog envanteridir; tarihsel editoryal raporlardaki inceleme sayıları bu turun incelemesi olarak sunulmamıştır.

## 3. Üretimdeki canlı kapsam

| İstenen kanıt                                                       | Sonuç        | Açıklama                                                                         |
| ------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Öğrencilerin bugün erişebildiği istasyon sayısı                     | `UNVERIFIED` | Salt okunur production audit çalıştırılamadı. Kaynak manifesti bu sayıyı vermez. |
| Yayımlanmış rota, birim ve istasyon grafiği                         | `UNVERIFIED` | Kaynak onayı (`publicationApproved`) canlı DB yayın durumuyla aynı şey değildir. |
| İçerik, şablon, soru ve değerlendirme sürümlerinin canlı bağlantısı | `UNVERIFIED` | Üretim kaydı sorgulanmadı.                                                       |
| Gerçek öğrenci ataması ve tamamlanma/geçiş davranışı                | `UNVERIFIED` | Üretim öğrenci hesabı veya ilerleme kaydı incelenmedi.                           |
| Hızlı okuma ve okuduğunu anlama kapsamının üretim oranı             | `UNVERIFIED` | Canlı LearningPath/step grafiği görülmedi.                                       |

Mevcut `production-education-v2-p0-audit.yml` yalnızca P0 grafiğini denetler; A/B/C/D döngülerinin tamamını kapsamaz. Bu kapsam boşluğu için `.github/workflows/production-learning-route-audit.yml` ve `scripts/audit-learning-routes-production.ts` eklendi. Yeni workflow yalnızca `master` üzerinde manuel başlatılır, mevcut `production-migration` GitHub Environment'ını ve onaylı üretim hedef fingerprint alanlarını kullanır. Betik ilk SQL ifadesi olarak `SET TRANSACTION READ ONLY` çalıştırır; kimlik ve parmak izi eşleşmeden rota sorgularına geçmez.

Yeni denetim kaynak katalogdaki P1 döngülerini üretimde görünen P1 yol/birim/adımlarla karşılaştırır; yol ve adım durumlarını, adım türlerini, Skill kategorilerini, içerik/şablon/soru/değerlendirme sürüm bağlantı kontrollerini, önkoşulları ve öğrenci yolu kayıtlarının yalnızca toplu durum sayılarını raporlamak üzere hazırlandı. Rapor öğrenci kimliği, cevap, soru metni veya cevap anahtarı içermez. RLS'yi atlayan rol doğrulanmadıkça genel durum `PARTIAL` kalır; öğrenci bazında erişim, yalnızca toplu atama sayılarından çıkarılmaz. Yeni workflow bu çalışma oturumunda başlatılamadı; dolayısıyla bu kod değişikliği canlı envanter kanıtı değildir ve yukarıdaki üretim değerleri `UNVERIFIED` kalır.

## 4. Statik rota envanteri

`learning-route-catalog.ts` içindeki `summarizeLearningRouteCoverage()` çıktısı, manifest adımlarını ve kaynak kodundaki yayın/kaynak beyanlarını sayar. `productionGraph` her rota için `NOT_VERIFIED` durumundadır.

| Rota | Tanımlanmış adım | Kaynak yayın bayrağı açık | Taslakta kaynak doğrulanmış beyanı | QA kaynak-nitelikli toplamı | QA kaynağı inceleme bekleyen | 200 hedefindeki sayısal açık* | Sınıflandırılmamış |
| ---- | ---------------: | ------------------------: | ---------------------------------: | --------------------------: | ---------------------------: | ----------------------------: | -----------------: |
| A    |              220 |                        80 |                                130 |                         210 |                           10 |                             0 |                 25 |
| B    |              205 |                         5 |                                185 |                         190 |                           15 |                            10 |                 10 |
| C    |              205 |                         5 |                                185 |                         190 |                           15 |                            10 |                 10 |
| D    |              205 |                         5 |                                185 |                         190 |                           15 |                            10 |                 10 |

\* Sayısal açık, QA'nın `max(0, 200 - sourceQualifiedStationCount)` alanıdır. A rotasının 210 sayısı, dört rotadaki toplamın 780 görünmesine rağmen A hedefini 10 aşar; bu nedenle rota başına açıkların toplamı 30, genel net sayı açığı ise 20'dir. Fazla tanımları hedef istasyonlara nasıl seçeceğini gösteren bir yayın/kalite kararı yoktur. Bu sayaçlar 200 istasyonun akademik veya canlı olarak hazır olduğunu kanıtlamaz.

### Kategori hedefi karşılaştırması

Her rotadaki plan hedefi: Hızlı okuma 60, okuduğunu anlama 80, ortak stratejiler 20, bütünleşik uygulama 25, çoklu beceri değerlendirmesi 15.

| Rota  | Hızlı okuma | Okuduğunu anlama | Ortak stratejiler | Bütünleşik uygulama | Çoklu beceri değerlendirmesi | Sınıflandırılmamış | Durum        |
| ----- | ----------: | ---------------: | ----------------: | ------------------: | ---------------------------: | -----------------: | ------------ |
| A     |          40 |               42 |                37 |                  38 |                           38 |                 25 | `INCOMPLETE` |
| B     |          40 |               42 |                37 |                  38 |                           38 |                 10 | `INCOMPLETE` |
| C     |          40 |               42 |                37 |                  38 |                           38 |                 10 | `INCOMPLETE` |
| D     |          39 |               40 |                38 |                  39 |                           39 |                 10 | `INCOMPLETE` |
| Hedef |          60 |               80 |                20 |                  25 |                           15 |                  0 | —            |

Bu sınıflandırma, hızlı okuma ve anlama kategorilerinde ciddi açık; diğer üç kategoride ise hedef üstü sayım gösteriyor. Her rota için sadece 195 adım kategoriye bağlanmış. İçerik kalitesi ve rota sayısı değerlendirilmeden bu açığı aynı beceriyi tekrarlayan istasyonlarla doldurmak uygun değildir.

## 5. Soru bankası ve içerik kalite bulguları

Güncel statik katalog çıktısı:

| Gösterge                              |  Sayı | Doğru yorum                                                               |
| ------------------------------------- | ----: | ------------------------------------------------------------------------- |
| Paket                                 |   190 | Katalog kaynak paketleri; üretim grafiği sayısı değil.                    |
| Paketlerdeki soru girişi              | 2.724 | Tekrarlanan kaynak/sürüm başvuruları dahildir.                            |
| Benzersiz soru kimliği                | 2.529 | Kaynak kimliği üzerinden tekilleştirilmiş.                                |
| Tekilleştirilmiş soru-sürüm girdisi   | 2.667 | Aynı kimliğin farklı sürümleri ayrı tutulur.                              |
| Açık sürüm kimliği olan sürüm girdisi | 2.640 | 27 girişte soru sürümü tanımı eksik.                                      |
| Birden fazla sürümü olan soru kimliği |    88 | Sürüm adayları ikinci benzersiz soru sayılmaz.                            |
| Tekrar eden paket başvurusu           |    57 | Aynı sürüm/kimlik tekrarları.                                             |
| Kaynakta mevcut soru girişi           |   144 | `SOURCE_CURRENT` kod kaynağı etiketi; üretimde yayımlı olma kanıtı değil. |
| Yayımlanmamış aday soru girişi        | 2.376 | Kaynak adayları; öğrenciye açık sayılmaz.                                 |
| Sürümlü revizyon adayı girişi         |   195 | Yayımlanmamış aday sürümler.                                              |
| Yalnız tasarım adayı girişi           |     9 | Yayımlanmış içerik değil.                                                 |

QA, `SOURCE_CURRENT` kayıtlarında 6 belirgin doğru cevap uzunluğu aykırılığı verdi:

- Cycle 2: `p1a-v2-evidence-practice-2`, `p1a-v2-structure-reinforcement-2`, `p1a-v2-transfer-practice-2`, `p1a-v2-assessment-4`.
- Cycle 3: `p1a-v3-evidence-reinforcement-2`, `p1a-v3-assessment-1`.

Bu altı kimlikte soru kökü, pasaj, seçenekler ve anahtar birlikte incelendi. Kök/anahtar ilişkisini değiştirmeyi gerektiren kesin bir anlam kusuru kanıtlanmadı; doğru seçeneğin uzunluk ipucu vermesi gerçek bir QA sorunudur. Depoda bunlara karşılık gelen Cycle 2 `question-balance-v3` (22 soru) ve Cycle 3 `question-balance-v4` (16 soru) sürüm adayları zaten bulunuyor. Mekanik QA bu adaylarda sıfır belirgin uzunluk aykırılığı bildiriyor. Adaylar `REVIEW_REQUIRED` ve yayınlanmamış durumdadır; bu denetim onları onaylamaz veya yayımlamaz.

Bu denetimde 2.529 kimliğin tümüne anlamsal doğruluk, tek doğru seçenek, açıklama, beceri uyumu ve Türkçe bakımından tam insan incelemesi yapılmamıştır. Mevcut QA kataloğu bunların hiçbirini otomatik olarak `VERIFIED` kabul etmez. Uzunluk, cevap harfi ve tekrar göstergeleri yalnızca inceleme sinyalidir.

### Kapsam dışı veya sadece tarihsel kayıtla bilinen soru türleri

- Bağımsız Antrenman soruları veritabanında tutulan yayımlanmış şablon/soru sürümlerinden gelir ve statik kaynak kataloğuna dahil değildir. `docs/QUESTION_BANK_QA_COVERAGE.md`, 17 Ekim 2026 tarihli salt-okunur Run #39034115550 için 45 yayımlanmış şablon sürümü ve 129 soru bağlantısı metadata envanteri kaydeder. Rapor soru metni/anahtarı içermediğinden semantik inceleme sayısı sıfırdır. Bu eski run bu denetimde yeniden çalıştırılmadı.
- Yerleştirme bankasının 27 çoktan seçmeli olmayan maddesi için önceki QA belgesinde türüne göre bir inceleme ve 1.0.3 düzeltme adayı kayıtlıdır. Bu maddeler bu turda yeniden denetlenmedi; canlı yayında oldukları varsayılmıyor.
- İlk gerçek içerik paketindeki 27 MC madde için soru başına sürüm kimliği tanımsızdır; QA kimlik uydurmaz.
- Statik katalog dosyası, güncel production Training bankasını veya tüm üretim LearningPath sürümlerini kapsamaz.

## 6. Öğretim modeli ve beceri uyumu

`academic-reading-p0.ts` kaynakta altı ders taslağı, hedefler ve aşama sözleşmeleri içerir. Program ve route katalogları FAST (`FAST_ATTENTION`, `FAST_RECOGNITION`, `FAST_CHUNKING`) ile RC (`RC_MAIN_IDEA`, `RC_DETAIL`, `RC_INFERENCE`) becerilerini ayırır. Bu, kaynak kodunda anlamlı bir başlangıç sınıflamasıdır; her becerinin her aktif üretim istasyonunda doğru ölçüldüğünü göstermez.

Kod tabanındaki öğretim modeli; öğretim/modelleme, rehberli küçük çalışma, bağımsız uygulama, geri bildirim, pekiştirme ve değerlendirme adımlarını tarif eder. `academic-reading-p0.ts` ayrıca transfer görevi/success indicator alanlarını tanımlar. Ancak kaynak tanımı öğrenci arayüzünde bütün aşamaların çalıştığı, değerlendirmede yeni ve görülmemiş metin kullanıldığı ya da öğrenciye ayrı transfer görevi sunulduğu anlamına gelmez. Bu uçtan uca koşullar production akışı görülmeden doğrulanamaz. Çoktan seçmeli madde ana fikir, açık ayrıntı ve bazı metne dayalı çıkarımları ölçebilir; serbest özet, gerekçeli kanıt açıklama, anlama izleme ve gerçek metne transferi tek başına kanıtlamaz.

`FAST_ATTENTION`, `FAST_RECOGNITION` ve `FAST_CHUNKING` ürün içi beceri etiketleridir. Kısa seçenekli görevlerdeki başarı; gerçek sessiz okuma hızı, göz hareketi, sesli okuma akıcılığı/prozodisi veya yeni metindeki beceri transferinin doğrudan ölçümü değildir.

## 7. Güncel MEB ve akademik kanıt matrisi

| Kaynak / yıl                                                                              | Desteklediği yaklaşım                                                                                                                                | OkuPratik bağlantısı                                                                            | Ürün etkisini kanıtlıyor mu?                                                                                                                                                                                                                                   | Sınırlar                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEB Ortaokul Türkçe Öğretim Programı, Türkiye Yüzyılı Maarif Modeli, 2024                 | 5–8. sınıf Türkçe program hedefleri ve beceri yapısı                                                                                                 | `RC_MAIN_IDEA`, `RC_DETAIL`, `RC_INFERENCE` gibi hedeflerin ortaokul programıyla eşleştirilmesi | Hayır; müfredat uyum kaynağıdır, OkuPratik müdahale çalışması değildir. [Resmî program PDF'si](https://tymm.meb.gov.tr/upload/program/2024programtur5678Onayli.pdf), [program portalı](https://tymm.meb.gov.tr/ogretim-programlari/ders/ortaokul-turkce-dersi) | Hedef kullanıcı 13–17 yaş olduğundan 5–7. sınıf programı tüm kullanıcı aralığını kapsamaz. 2026–27'de 8. sınıfta önceki program sürmektedir.                                                                                                                                                                                                  |
| MEB Türk Dili ve Edebiyatı program portalı, güncel erişim 2026                            | Hazırlık ve 9–12. sınıf programları                                                                                                                  | Lise düzeyindeki okuma/anlama hedeflerini ayrı sınıf düzeyinde hizalama                         | Hayır. [Resmî portal](https://tymm.meb.gov.tr/ogretim-programlari/ders/turk-dili-ve-edebiyati-dersi)                                                                                                                                                           | 2026–27 uygulaması hazırlık, 9, 10 ve 11. sınıflara genişlemiştir; 12. sınıfta önceki program uygulanmaktadır. Tek `G9_12` düzeyiyle bireysel program uyumu gösterilemez. [MEB/OGM uygulama bilgisi](https://ogm.meb.gov.tr/www/2026-2027-egitim-ogretim-yili-turkiye-yuzyili-maarif-modeli-taslak-cerceve-planlar-yayimlandi/icerik/2633/tr) |
| IES/WWC, _Providing Reading Interventions for Students in Grades 4–9_, 2022               | Çok heceli kelime çözümleme, amaçlı akıcılık etkinlikleri ve anlama stratejileri için güçlü; zorlayıcı metin çalışması için orta düzey kanıt önerisi | Akıcılık ve anlama görevlerinin birlikte, yapılandırılmış öğretim/geri bildirimle tasarlanması  | Hayır; rehberdeki müdahaleler OkuPratik değil. [WWC rehberi](https://ies.ed.gov/ncee/wwc/PracticeGuide/29)                                                                                                                                                     | 4–9. sınıf kapsamı, Türkçe ve tüm 13–17 yaş grubu ile birebir aynı değildir.                                                                                                                                                                                                                                                                  |
| Rayner, Schotter, Masson, Potter & Treiman, _So Much to Read, So Little Time_, 2016       | Hızlı okuma iddialarında hız-anlama dengesi; etkili tarama ile derin okuma ayrımı                                                                    | Hız iddialarını anlamayla birlikte ölçme, “çok hızlı okuma” vaadinden kaçınma                   | Hayır. [Hakemli derleme / DOI](https://doi.org/10.1177/1529100615623267)                                                                                                                                                                                       | Derleme ürün testi değildir; bireysel Türkçe öğrenme etkisi vermez.                                                                                                                                                                                                                                                                           |
| Steinle, Stevens & Vaughn, 2022, 6–12. sınıflarda akıcılık müdahaleleri sentezi           | 17 çalışmada tekrarlı okuma çoğunlukla akıcılığı geliştirdi; anlama sonuçları daha az tutarlı/az olumlu                                              | Akıcılık çalışmasını tek başına anlamanın geliştiği şeklinde sunmama; ikisini ayrı ölçme        | Hayır. [Hakemli araştırma sentezi / DOI](https://doi.org/10.1177/0022219421991249)                                                                                                                                                                             | İngilizce, zorlanan okuyucular ve 2006–2019 çalışmaları; genel Türkçe öğrenci kitlesine doğrudan genellenemez.                                                                                                                                                                                                                                |
| Agarwal, Nunes & Blunt, 2021, okul ve sınıflarda retrieval practice sistematik incelemesi | 50 deneyde retrieval practice genel öğrenmeye çoğunlukla yararlı; uygun uygulama ve geri bildirim önemli                                             | Alıştırma/pekiştirme ve gecikmeli hatırlama tasarımına genel dayanak                            | Hayır. [Hakemli sistematik inceleme / DOI](https://doi.org/10.1007/s10648-021-09595-9)                                                                                                                                                                         | Çalışmaların yalnızca küçük bölümü WEIRD dışı ülkelerde; bu kaynak OkuPratik tekrar aralığını veya etki büyüklüğünü doğrulamaz.                                                                                                                                                                                                               |
| _Reading fluency intervention dosage_, Journal of School Psychology, 2022                 | K–12 akıcılık müdahalelerine ilişkin sentez ve dozaj belirsizlikleri                                                                                 | Etkiyi müdahale protokolü/tekrar dozu ile ölçme gereği                                          | Hayır. [Makale / DOI](https://doi.org/10.1016/j.jsp.2022.03.008)                                                                                                                                                                                               | Heterojen çalışmalar; OkuPratik'in dozunu, Türkçe eşiğini veya ürün etkisini belirlemez.                                                                                                                                                                                                                                                      |

2026–27 için güncel MEB kapsamı önemlidir: ortaokulda yeni model 5, 6 ve 7. sınıflarda; 8. sınıfta önceki program sürmektedir. Ortaöğretimde hazırlık ile 9–11. sınıflarda yeni model uygulanırken 12. sınıfta önceki program devam etmektedir. Bu nedenle 13–17 yaş için tek bir güncel program etiketi kullanmak yeterli değildir. [MEB/OGM 2026–27 planı](https://ogm.meb.gov.tr/www/2026-2027-egitim-ogretim-yili-turkiye-yuzyili-maarif-modeli-taslak-cerceve-planlar-yayimlandi/icerik/2633/tr), [MEB temel eğitim kapsamı](https://menderes.meb.gov.tr/www/20262027-egitim-ve-ogretim-yili-turkiye-yuzyili-maarif-modeli-temel-egitim-taslak-cerceve-planlari-yayimlandi/icerik/1760/).

2019 MEB Türkçe programı mevcut akademik dokümanlarda tarihsel hizalama kaynağı olarak anılmaktadır; 2026–27'nin tamamı için güncel müfredat kanıtı gibi kullanılmamalıdır. Programlar düzenli yenilendiğinden içerik sürümlerinde hedeflenen sınıf ve program sürümü belirtilmelidir.

## 8. Öğrenci gelişimini gerçekten ölçme kapasitesi

### Mevcut veri modeli/kodun üretebildiği

- `AssessmentResult`: değerlendirme puanı (`score`), beceri alt puanlarını taşıyabilen `metrics` ve tamamlanma zamanı.
- `StudentBaseline`: yerleştirme değerlendirmesinden alınan değişmez başlangıç snapshot'ı ve kaynak sonuç ilişkisi.
- `Attempt`: doğru/yanlış, ham puan, yanıt zamanı ve soru etkileşim süreleri; bazı istemci telemetrisi sunucu tarafından aralık açısından doğrulanır.
- `ExerciseSession`: başlangıç/tamamlanma ve toplam oturum süresi; bu süre okuma pasajına özgü değildir.
- `StudentProgress`: deneme doğruluğu ve ortalama yanıt süresi alanları; `fluencyWcpm` sütunu mevcut olsa da uygulama kaynaklarında bu alanı hesaplayan/yazan bir projeksiyon bulunmadı. Bu nedenle şemadaki alanı çalışan WPM ölçümü saymıyoruz.
- `ContentVersion.wordCount`: metin sürümünün kelime sayısı; tek başına öğrenci okuma başlangıç/bitiş ölçümü oluşturmaz.
- Rota adımı durumu ve değerlendirme geçmişi, tamamlanma ve kullanım sinyalleri sağlar.

### Eksik ölçümler ve yorum sınırı

- Pasajın öğrenci tarafından gerçekten okunmaya başlandığı ve bittiği kontrollü bir zaman aralığı yoktur. Soru görüntülenme/cevap süresi okuma süresi değildir; bu verilerden WPM üretilemez.
- `fluencyWcpm` alanı için repository içinde hesaplama/yazma yolu bulunmadı. Üretim DB okunmadığından alanda dışarıdan yazılmış tarihsel değer bulunup bulunmadığı bilinmiyor.
- Doğruluk ve beceri alt puanları, öğrenci performansına ilişkin sinyal verir; yeni ve görülmemiş pasajda transferi veya gecikmeli kalıcılığı tek başına göstermez.
- Başlangıç/sonuç farkı nedensel ürün etkisi değildir. Paralel form eşdeğerliği, güvenilirlik, yaş ve Türkçe normları, kontrol grubu ve uygun örneklem olmadan “öğrencinin gelişmesini OkuPratik sağladı” denemez.
- Admin analitik kodundaki karşılaştırma, farklı assessment kimliklerini karşılaştırabiliyor ve birleşik tenant görünümünde farklı satırlardaki puanları eşleştirebiliyordu. Bu turda bireysel karşılaştırma aynı assessment kimliğindeki daha sonraki ayrı sonuçla sınırlandı; birleşik görünümde bağlamı belirsiz skor/fark kapatıldı. Aynı kimlik tek başına ölçme eşdeğerliği veya nedensellik kanıtı değildir.

### Ölçülebilir ürün hedefi için asgari gelecek tasarım

1. Aynı hedef becerileri ölçen, içerik ve zorluk bakımından eşdeğerliği incelenmiş başlangıç/son paralel formlar.
2. Hedeflenen okuma görevinde passage exposure/read start ve read complete olayları; metin sürümüne bağlı word count, güvenilir saat doğrulaması, sekme/arka plan ve kesinti kuralları.
3. Okuma hızı raporu için doğruluk/anlama koruma koşulu; hız artarken anlama düşüyorsa bunu başarı saymama.
4. Daha önce görülmemiş pasaj transferi ve planlı gecikmeli tekrar ölçümü.
5. Türkçe 13–17 yaş grubu için erişilebilirlik, cihaz, metin türü ve sınıf/okuma seviyesi ayrıştırılmış pilot; eşikler norm veya pilot olmadan uydurulmamalı.

## 9. Güvenli pazarlama dili

**Mevcut kanıtla söylenebilecekler:** “OkuPratik, ana fikir, metin ayrıntısı, çıkarım ve okuma stratejileri üzerinde yapılandırılmış alıştırmalar sunar”; “uygulama, tamamlanan oturum ve cevap doğruluğu gibi mevcut kayıtları gösterir.” Bunlar ürün işlevi iddialarıdır; kullanıcının öğrenme sonucunu garanti etmez.

**Ürün etkililiği kanıtı olmadan söylenmemesi gerekenler:** “Okuma hızını belirli oranda artırır”, “daha hızlı okurken anlamayı korur”, “akademik başarıyı yükseltir”, “kalıcı öğrenmeyi/transferi kanıtlanmış biçimde sağlar”, “13–17 yaşın tamamında MEB programına tam uyumludur.” Bu denetimde kontrollü etki çalışması veya geçerli Türkçe WPM ölçümü bulunmadı.

## 10. Değişiklikler ve doğrulama

- `src/modules/analytics/assessment-comparison.ts` eklendi: yalnızca aynı assessment kimliğinde, baseline'dan sonra tamamlanan farklı bir sonucu karşılaştırılabilir aday sayar.
- `src/modules/analytics/service.ts` güncellendi: kişi bazında farklı değerlendirme tür/kimliklerinin puan farkı gibi çıkarılması önlendi; çoklu-tenant birleştirilmiş görünümde keyfî baseline/latest puan çifti gösterilmez.
- `test/analytics-assessment-comparison.test.ts` eklendi: aynı assessment, farklı assessment, eski/eş zamanlı sonuç, baseline kaydı ve eksik skor senaryolarını kapsar.
- `.github/workflows/production-learning-route-audit.yml`, `scripts/audit-learning-routes-production.ts` ve `src/curriculum/production-learning-route-audit.ts` eklendi: tüm P1 rota grafiklerini onaylı hedef ve salt-okunur transaction ile denetleyen korumalı iş akışı.
- `test/production-learning-route-audit.test.ts` eklendi: workflow korumaları, read-only transaction sırası, kaynak grafik eşleşmesi, yayın kapısı ve eksik/kırık grafik raporlaması.
- Bu rapor yeni audit mekanizmasının canlıda çalıştırıldığını iddia etmez; GitHub Actions dispatch ve `production-migration` Environment erişimi bu oturumda kullanılamadı.
- Bu görevde içerik sürümü, soru, müfredat, yayın durumu, öğrenci ataması veya ilerleme kaydı değiştirilmedi.
- Üretim veritabanına bağlanılmadı; migration, seed, APPLY veya yayın işlemi yapılmadı.
- Yerel doğrulama: karşılaştırma testi 4/4 geçti; `typecheck`, ESLint, Prettier, build ve `git diff --check` başarılı. Kaynak müfredat/soru envanteri QA çıktıları bu belgenin envanter tablolarına karşılık gelir; semantik incelemenin tamamı oldukları iddia edilmez.

Bu belge tek başına CI veya canlı Production dağıtımı iddiası taşımaz. Güncel commit'in CI ve deployment sonucu teslim kaydında ayrıca doğrulanmalıdır.

## 11. Sonuç ve sıradaki en önemli iş

**Durum: `PARTIAL`.** Statik kod/katalog ve mevcut telemetry tasarımı incelendi; canlı istasyon/öğrenci kapsamı doğrulanmadı ve tam soru bankası semantik incelemesi yapılmadı. Yeni MEB uygulama kademeleri nedeniyle 13–17 yaş hedefi sınıf/program bazında hizalanmalıdır. Kaynak QA kategori hedefleri de dört rotada karşılanmıyor.

**Sıradaki en önemli iş:** `production-learning-route-audit.yml` workflow'unu `master` üzerinden `LEARNING_ROUTE_AUDIT` onayıyla, mevcut Environment onayı ve hedef fingerprint kapıları altında bir kez çalıştırmak; artefaktı inceleyip RLS görünürlüğü eksikse rolün kapsamını yetkili DB yöneticisiyle doğrulamak. Workflow henüz çalışmadığından canlı A/B/C/D sayıları, üretim-kaynak farkları ve erişilebilir istasyonlar `UNVERIFIED` kalır.
