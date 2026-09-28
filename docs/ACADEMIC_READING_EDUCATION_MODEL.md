# Oku+ Akademik Kanıta Dayalı Eğitim ve Öğretim Modeli

**Tarih:** 2026-09-27
**Kapsam:** Hızlı Okuma Eğitimi ve Okuduğunu Anlama Eğitimi
**Hedef kullanıcı:** Yaklaşık 13–17 yaş; ürünün grade ve yaş kapsamı ayrıca doğrulanmalıdır.
**Durum:** Tasarım ve fark analizi dokümanı. Bu doküman uygulama kodunu, veritabanını veya canlı yayını değiştirmez.

## 1. Yönetici özeti

Oku+’nın temel modeli korunmuştur:

```text
Öğrenci
  → Seviye Belirleme
  → Öğrenme Yolu
      ├─ Hızlı Okuma: Öğretim → Küçük Çalışma → Uygulama
      └─ Okuduğunu Anlama: Öğretim → Küçük Çalışma → Uygulama
  → Ortak Pekiştirme
  → Değerlendirme
  → Başarı Ölçümü
  → Sonraki Öğrenme Adımı
```

Mevcut kodun güçlü tarafı, üç hızlı okuma becerisi için güvenli bir egzersiz sözleşmesi, yayınlanmış içerik/soru grafiği kontrolü, sunucu taraflı puanlama ve öğrenci ilerleme sinyallerinin bulunmasıdır.

Mevcut modelin temel sınırı ise bunun henüz eksiksiz bir öğretim programı olmamasıdır. Hızlı okuma alanında doğrudan doğrulanmış somut dersler, bağımsız okuma akıcılığı ölçümü, gecikmeli kalıcılık ölçümü ve yeni metne aktarım ölçümü eksiktir. Mevcut çoktan seçmeli egzersizler beceriye ilişkin bazı kanıtlar sağlar; tek başına gerçek okuma hızı veya akıcılığı kanıtlamaz.

Akademik olarak güvenli ürün konumu şudur:

> Oku+ “çok hızlı okuma” vaadi değil; doğruluğu, akıcılığı, anlamayı ve uygun metinde verimli okumayı birlikte geliştiren bir öğrenme sistemi olmalıdır.

Rayner ve arkadaşlarının kapsamlı incelemesi, çok yüksek hız ile yüksek anlama düzeyinin birlikte garanti edildiği hızlı okuma iddialarının bilimsel bulgularla uyuşmadığını; hız artışının anlama maliyeti olabileceğini bildirir. Aynı çalışma, makul gelişimin pratik, kelimeye aşinalık ve farklı metinlerle çalışma üzerinden ele alınmasını önerir. [Rayner, Schotter, Masson, Potter & Treiman, 2016](https://www.psychologicalscience.org/publications/speed_reading.html)

Bu nedenle mevcut üç FAST becerisi korunabilir; ancak bunlar doğrudan “göz hareketini eğitme” veya “kelime/dakika artırma” becerileri olarak etiketlenmemelidir.

## 2. Araştırma yöntemi ve sınırlar

Araştırmada şu sıra izlendi:

1. Repository içindeki mevcut beceri, egzersiz, içerik, ders, ilerleme ve adaptive sözleşmeleri incelendi.
2. Resmî kurumsal kaynaklar, sistematik derlemeler, meta-analizler ve hakemli araştırma özetleri tarandı.
3. Kanıt; doğrudan araştırma sonucu, kurumsal müfredat beklentisi ve ürün tasarım kararı olarak ayrıldı.
4. İngilizce ve farklı yaş gruplarındaki bulgular Türkçe 13–17 yaş grubuna otomatik olarak genellenmedi.

### Repository kapsamı

Bu inceleme mevcut `D:\oku-plus` çalışma alanındaki kaynaklara dayalıdır. Çalışma alanı `staging` dalında kirli durumdadır. Bu nedenle repository’deki içerik veya test kanıtı canlı production/staging veritabanında yayınlanmış kayıt bulunduğu anlamına gelmez. Canlı veritabanı sorgusu yapılmamıştır.

### Kanıt sınıfları

- **Güçlü araştırma desteği:** Resmî kanıt sentezinde güçlü kanıt veya birden fazla uyumlu araştırma/derleme.
- **Orta düzey araştırma desteği:** Meta-analiz/araştırma sentezi var, fakat yaş, dil, müdahale veya ölçüm koşulları sınırlı.
- **Sınırlı/karışık:** Sonuçlar bağlama bağlı, örneklem sınırlı veya genelleme belirsiz.
- **Yeterli kanıt yok:** Oku+ için belirli eşik, algoritma veya iddia çıkarılamıyor.

## 3. Akademik kaynak ve kanıt tablosu

| Kaynak                                                                            | Tür ve kapsam                                                 | Bulguyu desteklediği alan                                                     | Oku+ için kanıt yorumu                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WWC, _Providing Reading Interventions for Students in Grades 4–9_, 2022           | IES/What Works Clearinghouse uygulama rehberi; 4–9. sınıflar  | Amaçlı akıcılık çalışması, anlama stratejileri, zorlayıcı metinle anlam kurma | Akıcılık ve anlama akışını birlikte kurmak için güçlü kurumsal dayanak. 13–17 yaşın tamamına doğrudan eşitlenmemeli. [WWC rehberi](https://ies.ed.gov/ncee/wwc/practiceguide/29)                                             |
| Rayner ve ark., 2016, _Psychological Science in the Public Interest_              | Hakemli geniş derleme                                         | Hız-anlama dengesi; göz hareketleri; hızlı okuma iddialarının sınırları       | Hızlı okuma ürün vaadini sınırlamak için güçlü dayanak. [APS özeti](https://www.psychologicalscience.org/publications/speed_reading.html)                                                                                    |
| Therrien, 2004, _Fluency and Comprehension Gains as a Result of Repeated Reading_ | Meta-analiz                                                   | Tekrarlı okumanın akıcılık ve anlama üzerindeki etkisi                        | Tekrarlı okuma için orta düzey dayanak; yaş ve metin aktarımı ayrıca ölçülmelidir. [DOI](https://doi.org/10.1177/07419325040250040801)                                                                                       |
| Steinle, Stevens & Vaughn, 2022                                                   | 6–12. sınıflarda zorlanan okuyucular için araştırma sentezi   | Tekrarlı okumada akıcılık gelişimi; anlama etkileri daha sınırlı              | FAST çalışmasını tek başına yeterli saymama gerekçesi. [SAGE](https://journals.sagepub.com/doi/10.1177/0022219421991249)                                                                                                     |
| Bashir & Hook, 2009                                                               | Hakemli derleme                                               | Akıcılığın kelime tanıma ile anlama arasındaki bağlantı olması                | FAST_RECOGNITION, doğruluk ve anlama ile birlikte modellenmeli. [PubMed](https://pubmed.ncbi.nlm.nih.gov/18952813/)                                                                                                          |
| Agarwal, Nunes & Blunt, 2021                                                      | Okul/sınıf uygulamalarını içeren sistematik derleme; 50 deney | Geri bildirimli retrieval practice ve gecikmeli öğrenme                       | Pekiştirme ve gecikmeli tekrar için orta düzey dayanak; çalışmaların yalnızca %6’sı non-WEIRD ülkelerde yapıldığı için Türkçeye doğrudan genellenmemeli. [Springer](https://doi.org/10.1007/s10648-021-09595-9)              |
| Carpenter, Pan & Butler, 2022                                                     | Nature Reviews Psychology derlemesi                           | Spacing ve retrieval practice                                                 | Kalıcılık tasarımı için güçlü genel öğrenme bilimi dayanağı; okuma alanına özgü eşik sağlamaz. [Nature Reviews Psychology](https://www.nature.com/articles/s44159-022-00089-1.pdf)                                           |
| MEB Türkçe Dersi Öğretim Programı, 2019                                           | Türkiye resmî öğretim programı                                | Ana fikir, ayrıntı, soru-cevap, çıkarım, özetleme ve metin yapısı kazanımları | Türkçe müfredat hizalaması için kurumsal kaynak; müdahale etkililiği kanıtı değildir. [MEB programı](https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20%C3%96%C4%9Fretim%20Program%C4%B1%202019.pdf) |
| Bilge & Kalenderoğlu, 2022, _Education and Science_                               | Türkiye’de 5. sınıf, 94 öğrenci, korelasyonel çalışma         | Akıcılık, doğruluk, hız, okuduğunu anlama ve kelime hazinesi ilişkileri       | Türkçe bağlamı için sınırlı/ilişkisel destek; 13–17 yaş ve nedensel etki olarak genellenemez. [DOI](https://doi.org/10.15390/EB.2022.9609)                                                                                   |
| Ceylan & Yıldırım, 2026                                                           | Türkiye’de 3. sınıf, 225 öğrenci, korelasyonel çalışma        | Kelime tanıma, akıcılık, kelime hazinesi ve anlama ilişkileri                 | Türkçe ölçüm yaklaşımı için sınırlı yardımcı kanıt; hedef yaşa doğrudan genellenemez. [Ana Dili Eğitimi Dergisi](https://doi.org/10.16916/aded.1835049)                                                                      |

### Kanıtı olmayan veya güvenle iddia edilemeyecek konular

Şu iddialar mevcut araştırma ve mevcut ürün kanıtıyla “kanıtlanmış” kabul edilmemelidir:

- kısa sürede çok yüksek kelime/dakika artışı;
- çevresel görüşü genişleterek sayfayı tek bakışta okuma;
- göz hareketlerini veya regresyonları ortadan kaldırmanın genel olarak yararlı olması;
- tek bir çoktan seçmeli testin gerçek akıcılığı, kalıcılığı ve transferi ölçmesi;
- belirli bir `0.75` veya benzeri eşik değerin Türkçe 13–17 yaş grubu için evrensel başarı standardı olması;
- Oku+’daki mevcut response-time değerlerinin gerçek okuma hızı olarak yorumlanması.

## 4. Mevcut sistemin gerçek durumu

### 4.1 Beceri kataloğu

Mevcut üç hızlı okuma becerisi:

| Kod                | Ürün adı                | Mevcut öğrenme çıktısı                                 | Akademik yorum                                                                                                   |
| ------------------ | ----------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `FAST_ATTENTION`   | Dikkati yönelt          | Hedef bilgiyi ilgisiz ayrıntılardan ayırır.            | Anlamayı izleme ve amaçlı dikkat için kullanılabilir; göz takibi/eye-tracking becerisiyle eş anlamlı değildir.   |
| `FAST_RECOGNITION` | Hızlı tanı              | Aranan kelime veya ifadeyi doğru bağlamla eşleştirir.  | Kelime/ifade tanımanın bir bölümü vardır; otomatik kelime tanıma ve bağlı metin akıcılığı için ek görev gerekir. |
| `FAST_CHUNKING`    | Anlam gruplarını yakala | Birlikte anlam oluşturan kelime gruplarını ayırt eder. | Anlam gruplama ve akıcı işleme için uygun hedef; mevcut görevler gerçek üretimden çok seçim görevleridir.        |

Beceri tanımları: [`canonical-catalog.ts`](../src/curriculum/canonical-catalog.ts). Bu tanımlarda akademik kaynak, DOI veya kaynak kimliği bulunmamaktadır; dolayısıyla beceriler ürün sözleşmesidir, akademik olarak kaynaklandırılmış sınıflandırma değildir.

### 4.2 Egzersiz motoru

Mevcut egzersiz sözleşmeleri:

```text
ATTENTION_BURST    → FAST_ATTENTION    → QUESTION_ATTENTION_BURST
RAPID_RECOGNITION  → FAST_RECOGNITION  → QUESTION_RAPID_RECOGNITION
PHRASE_CHUNKING    → FAST_CHUNKING     → QUESTION_PHRASE_CHUNKING
```

Sözleşme yayınlanmış ContentVersion, QuestionVersion, doğru renderer, `MULTIPLE_CHOICE` ve deterministik skor gerektirir. Bu teknik güvence değerlidir: eksik veya sahte exercise graph sessizce çalıştırılmaz.

Mevcut egzersiz ölçümü:

- sunucu kaynaklı doğru/yanlış sonucu;
- `Attempt` ve session geçmişi;
- `rawScore`, `isCorrect`, `timeSpentMs`;
- beceri bazında StudentProgress ve adaptive sinyaller;
- son başarı, tekrar hata ve zorluk bandı.

Ancak bu ölçüm yüzeyi gerçek metin okuma hızını veya prosodiyi doğrudan ölçmez.

### 4.3 İçerik hacmi

Repository’deki `content/packs/v1` içinde:

- 6 hızlı okuma manifesti;
- 18 hızlı okuma sorusu;
- her beceri için 2 pasaj ve 6 soru;
- Türkçe kısa pasajlar;
- `FOUNDATION`/`DEVELOPING` ağırlıklı zorluk;
- çoktan seçmeli soru ve açıklama.

Bu içerikler pratik egzersiz için adaydır. Dosyada bulunmaları canlı veritabanında `PUBLISHED` olduklarını kanıtlamaz. Ayrıca içeriklerde hızlı okuma alanı için akademik kaynak URL’si veya araştırma dayanağı bulunmamaktadır.

### 4.4 Ders ve öğrenme yolu

`LEARNING_LESSON` için objective, explanation, worked example, guided practice ve exercise template bağlantısını zorunlu kılan bir sözleşme vardır. Ancak mevcut repository snapshot’ında üç FAST becerisine bağlanmış somut, akademik kaynaklı ders içerikleri ve bunların kalıcı öğrenme yolu adımlarına bağlandığı doğrulanamadı.

Mevcut Learning Path dinamik olarak Skill, StudentProgress, Level, Today ve yayınlanmış template sürümlerini birleştirir. Kalıcı `Unit → Lesson → Practice → Review` grafiği bugünkü temel sistemin tamamı değildir. Bu sınır mevcut mimari belgede de belirtilmiştir: [`CURRICULUM_ARCHITECTURE.md`](../docs/CURRICULUM_ARCHITECTURE.md).

### 4.5 Günlük eğitim ve adaptive yapı

Günlük kompozisyonda altı aile bulunur:

1. `ATTENTION_BURST`
2. `RAPID_RECOGNITION`
3. `PHRASE_CHUNKING`
4. `MAIN_IDEA`
5. `DETAIL_EVIDENCE`
6. `INFERENCE`

Bu, iki alanın aynı günlük oturumda görünmesini sağlar; fakat tek başına Öğretim → Küçük Çalışma → Uygulama → Ortak Pekiştirme → Değerlendirme pedagojik akışını kanıtlamaz.

Adaptive yapı; doğruluk, son hatalar, oturum sayısı, exposure, zorluk ve response time sinyallerini birleştirir. Response time ikincil sinyaldir; ana sinyal doğruluktur. Bu, ürünün mevcut davranışı için doğru bir sınırlamadır.

## 5. Önerilen hızlı okuma eğitim modeli

### 5.1 Modelin amacı

Hızlı okuma alanı şu beceriyi hedeflemelidir:

> Öğrenci, amaca ve metnin zorluğuna uygun bir tempoda; kelimeleri ve anlam gruplarını doğru işleyerek, dikkatini metnin önemli bilgisine yöneltir ve anlama kaybı olduğunda bunu fark edip düzeltir.

Bu tanımda hız bir sonuç sinyalidir; tek başına hedef değildir.

### 5.2 FAST_ATTENTION — Dikkati yönelt ve anlamayı izle

**Öğrenme çıktısı:** Öğrenci, okuma amacını belirler; hedef bilgi ile ilgisiz ayrıntıyı ayırır; bir cümle veya paragrafın anlamını kaybettiğini fark ettiğinde metne dönüp kontrol eder.

**Öğretim:**

- öğretmen kısa bir metin ve okuma amacı verir;
- hedef bilgi için hangi kelime ve cümlelerin önemli olduğunu sesli düşünerek modeller;
- “Bu bilgi soruyu cevaplamak için gerekli mi?” kontrolünü gösterir;
- anlam kaybı olduğunda tekrar okuma, bağlam kontrolü ve anahtar kelimeye dönme davranışını gösterir.

**Küçük çalışma:** Hedef ayrıntıyı seçme, metindeki ilgili cümleyi işaretleme, koşul değiştiğinde hangi bilginin değiştiğini bulma.

**Uygulama:** Yeni ve kısa bir pasajda amaç belirleme + hedef bilgi bulma + kısa açıklama.

**Ölçüm:** Hedef bilgi doğruluğu, metin içi kanıt seçimi, anlamayı izleme davranışı. Sadece tıklama süresi “dikkat” olarak yorumlanmamalıdır.

**Uygun olmayan iddia:** Göz hareketlerini tamamen durdurmanın veya geri dönüşleri ortadan kaldırmanın genel olarak öğrenmeyi artırdığı iddia edilmemelidir. Rayner ve arkadaşları, geri dönüşlerin anlaşılmayan materyali onarmada işlevsel olabileceğini bildirir.

### 5.3 FAST_RECOGNITION — Kelime ve ifadeyi otomatikleştirme

**Öğrenme çıktısı:** Öğrenci, hedef kelime/ifade ve eklerini doğru bağlamda hızlı ve doğru tanır; benzer görünen seçenekleri anlam ve bağlam açısından ayırt eder.

**Öğretim:**

- kelimeyi tek başına değil, cümle ve anlam bağlamında gösterme;
- kök, ek, sözcük türü ve bağlam ipucunu gerektiğinde açıkça modelleme;
- kelimeyi tekrar okuma ve farklı cümlede yeniden kullanma;
- yeni ve bilinen kelimeleri karıştırarak ayırt etme.

**Küçük çalışma:** Kelime–anlam eşleştirme, bağlamdaki uygun kelimeyi seçme, benzer kelimeler arasındaki anlam farkını açıklama.

**Uygulama:** Daha önce görülmemiş kısa metinde hedef kelimeyi bulma ve cümle anlamına katkısını açıklama.

**Ölçüm:** Kelime tanıma doğruluğu, bağlı metin içinde doğru kullanım, gecikmeli tekrar ve yeni cümleye transfer. Response time yalnızca doğruluk ve metin koşullarıyla birlikte yorumlanmalıdır.

**Dil sınırı:** Türkçenin eklemeli ve görece şeffaf yazı sistemi nedeniyle İngilizce temelli kelime tanıma sonuçları doğrudan aktarılmamalıdır. Türkçe kelime/ek yapısını ve hedef yaş grubunu içeren pilot kalibrasyon gerekir.

### 5.4 FAST_CHUNKING — Anlam gruplarıyla akıcı işleme

**Öğrenme çıktısı:** Öğrenci, cümleyi anlamı bozmadan kısa anlam gruplarına ayırır; grupları cümlenin ilişkileri ve vurgu yapısıyla birlikte işler.

**Öğretim:**

- cümlenin özne–yüklem ve tamamlayıcı ilişkilerini modelleme;
- kelime kelime okumayla anlam gruplarını fark ederek okumayı karşılaştırma;
- anlamı bozan yanlış bölme ile doğal grup arasındaki farkı gösterme;
- uzun cümleyi anlam ilişkisini koruyarak parçalara ayırma.

**Küçük çalışma:** Anlam grubu sınırını seçme, parçaları doğru sıraya koyma, aynı grubun farklı cümledeki anlamını karşılaştırma.

**Uygulama:** Yeni bir paragrafta öğrencinin grup sınırlarını belirlemesi ve seçimini kısa gerekçeyle açıklaması.

**Ölçüm:** Grup sınırlarının doğruluğu, cümle anlamının korunması, yeni cümleye transfer ve gerektiğinde sesli okuma/prozodi kanıtı. Salt çoktan seçmeli tanıma görevi üretim becerisini tam ölçmez.

**Uygun olmayan iddia:** “Her cümleyi sabit sayıda kelimeye bölmek” veya herkese aynı chunking kuralını uygulamak pedagojik olarak savunulamaz.

## 6. Okuduğunu anlama modeli

Mevcut `RC_MAIN_IDEA`, `RC_DETAIL` ve `RC_INFERENCE` becerileri korunmalıdır. Ek beceriler ilk aşamada yeni Skill kodları olarak değil, mevcut ders ve görevlerin öğretim stratejileri olarak ele alınmalıdır.

| Alan               | Öğrenme davranışı                                       | Oku+ uygulama karşılığı                                                              |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ana fikir          | Metnin merkez düşüncesini yardımcı ayrıntılardan ayırma | `RC_MAIN_IDEA`                                                                       |
| Ayrıntı/kanıt      | Açık bilgiyi doğru cümle veya ilişkiyle eşleştirme      | `RC_DETAIL`                                                                          |
| Çıkarım            | Metinsel kanıtlardan desteklenen sonucu çıkarma         | `RC_INFERENCE`                                                                       |
| Kelime ve ön bilgi | Bilinmeyen kelimeyi bağlam ve ön bilgiyle anlamlandırma | Ders açıklaması, hint ve içerik seçimi; ayrı beceri olarak henüz zorunlu değil       |
| Anlamayı izleme    | Anlam kaybını fark edip düzeltme                        | `FAST_ATTENTION` ile ortak öğretim stratejisi                                        |
| Soru-cevap         | Metinle ilgili soru sorma ve cevap kanıtını bulma       | Mevcut MC sorularına ek rehberli görev gerekir                                       |
| Özetleme           | Metni ana fikir ve temel destekle kısaltma              | MC tek başına yeterli değildir; kısa yazılı veya yapılandırılmış özet görevi gerekir |

MEB’in Türkçe programı ana fikir, ayrıntı, soru oluşturma/cevaplama, çıkarım, özetleme ve metin yapısı gibi becerileri sınıf düzeylerine göre tanımlar. Bu kaynak müfredat hizalamasıdır; tek başına bir müdahalenin etkili olduğunu göstermez. [MEB Türkçe Dersi Öğretim Programı](https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20%C3%96%C4%9Fretim%20Program%C4%B1%202019.pdf)

### Anlama dersi şablonu

Her ders için önerilen akış:

1. Öğrenme hedefi ve okuma amacı.
2. Öğretmenin düşünme sürecini modellemesi.
3. Kısa metinde rehberli soru-cevap.
4. Kanıt cümlesini bulma veya işaretleme.
5. Bağımsız uygulama.
6. Yanlış cevapta ipucu → farklı örnek → yeniden deneme.
7. Kısa pekiştirme ve gecikmeli tekrar.
8. Yeni metinde transfer sorusu.

Çoktan seçmeli soru; ana fikir, ayrıntı ve bazı çıkarımları ölçebilir. Ancak özetleme, soru üretme, kanıtı açıklama ve anlamayı izleme için ek görevler gerekir.

## 7. İki alanın ortak öğrenme modeli

İki alan paralel ilerleyebilir; ancak ortak aşamaya geçiş yalnızca iki alandaki uygulama kanıtı oluştuğunda yapılmalıdır.

```text
FAST öğretim
  → FAST küçük çalışma
  → FAST uygulama

RC öğretim
  → RC küçük çalışma
  → RC uygulama

FAST uygulama tamamlandı
  + RC uygulama tamamlandı
  → Ortak pekiştirme: yeni kısa metin, hızlı fakat anlam kaybetmeden işleme
  → Ortak değerlendirme: beceri karışımı ve yeni metin
  → Başarı ölçümü: beceri kanıtlarını ayrı raporla
  → Sonraki öğrenme: eksik beceriye yeniden öğretim veya yeni adım
```

### Bir alan başarılı, diğeri başarısızsa

- Öğrenci tamamlanan alanda gereksiz yere başlangıca döndürülmemeli.
- Ortak aşama, eksik alanın uygulama kanıtı oluşana kadar kilitli kalmalı.
- Eksik alanda hata türüne göre yeniden öğretim, daha kolay örnek ve rehberli çalışma önerilmeli.
- Aynı soruya sınırsız tekrar izin verilmemeli; fakat öğrencinin öğrenme için yeni örneklerle tekrar çalışması sağlanmalı.

Bu davranışlar mevcut ürün state machine’ine bağlanırken kesin eşikler akademik gerçekmiş gibi yazılmamalıdır. Başlangıç eşikleri pilotta önceden belirlenmiş ürün hipotezi olarak etiketlenmeli ve yeni metin performansıyla kalibre edilmelidir.

### Pekiştirme ve değerlendirme ayrımı

Pekiştirme, öğrencinin öğrenmesine yardım eden geri bildirimli retrieval ve tekrar aşamasıdır. Değerlendirme ise mümkün olduğunca yeni metin ve daha az yardım ile kanıt toplar. Retrieval practice’in farklı eğitim düzeyleri ve gecikmeli test formatlarında yarar sağlayabildiğini bildiren sistematik derleme vardır; ancak kültür ve uygulama bağlamı farkları nedeniyle Oku+ eşikleri ayrıca pilotlanmalıdır. [Agarwal, Nunes & Blunt, 2021](https://doi.org/10.1007/s10648-021-09595-9)

## 8. Öğretim, küçük çalışma ve uygulama şablonları

### Öğretim şablonu

```text
Hedef:
Bugün hangi gözlenebilir davranışı öğreneceğim?

Model:
Öğretmen/uygulama metin üzerinde neyi, neden yaptığını gösterir.

Karşı örnek:
Sık yapılan hatalı yaklaşım ve neden işe yaramadığı gösterilir.

Kontrol sorusu:
Öğrenci kısa bir örnekte doğru adımı seçer ve gerekçeyi görür.
```

### Küçük çalışma şablonu

```text
Rehberlik yüksek → ipucu ve kanıt gösterilir
Rehberlik orta  → kanıt alanı daraltılır
Rehberlik düşük → öğrenci bağımsız seçim yapar
```

### Uygulama şablonu

Uygulama, öğretimde kullanılan aynı pasajın tekrarı olmamalıdır. En azından konu, cümle yapısı veya soru amacı değişmelidir. Böylece öğrenci cevabı ezberlemek yerine beceriyi yeni örneğe taşımak zorunda kalır.

### Geri bildirim şablonu

1. Sonucu söyle.
2. Metindeki kanıtı veya stratejiyi göster.
3. Doğru cevabı gereksiz yere önceden ifşa etme.
4. Yeni bir örnekle yeniden deneme fırsatı ver.
5. Aynı hatayı tekrar ediyorsa yeniden öğretim yoluna yönlendir.

## 9. Ölçme ve değerlendirme modeli

| Ölçüm           | Ne ölçer?                                   | Önerilen görev                                                                         | Mevcut karşılık                                | Eksik/uyarı                                                             |
| --------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Doğruluk        | Soruyu veya hedef davranışı doğru yapma     | MC, eşleştirme, kısa cevap                                                             | Attempt, rawScore, isCorrect                   | Mevcut ve kullanılabilir; tek başına yeterli değil                      |
| Kelime tanıma   | Kelimeyi doğru ve bağlam içinde tanıma      | Kelime/ifade tanıma, bağlı metin, yeni cümle                                           | FAST_RECOGNITION MC                            | Bağımsız otomatiklik ve yeni cümle transferi yok                        |
| Akıcılık        | Doğru, anlamlı ve uygun tempoda işleme      | Aynı/benzer metinde tekrar + yeni metinde performans; gerektiğinde sesli okuma/prozodi | Response time ikincil sinyal                   | WPM, hata ve prozodi ölçümü yok                                         |
| Hız             | Kontrollü görevde geçen süre                | Kelime sayısı ve kontrollü okuma süresi                                                | timeSpentMs                                    | Gerçek okuma başlangıç/bitişi ve WPM yok; süre tek başına puanlanmamalı |
| Anlama          | Ana fikir, ayrıntı, çıkarım ve ilişki kurma | MC + kanıt açıklama + özet                                                             | RC becerileri ve MC                            | Özet/kanıt açıklaması sınırlı                                           |
| Beceri başarısı | Hangi beceride hangi kanıtın oluştuğu       | Her skill için ayrı hedef ve item blueprint                                            | StudentProgress skill sinyali                  | Unit/node düzeyinde mastery yok                                         |
| Kalıcılık       | Öğrenmenin zaman geçtikten sonra korunması  | Gecikmeli retrieval ve yeni metin                                                      | Ham geçmiş, adaptive history                   | DueAt/interval/review planı yok                                         |
| Transfer        | Aynı becerinin yeni metinde kullanılması    | Görülmemiş pasaj ve farklı konu                                                        | Farklı içerikler var, özel transfer ölçümü yok | Transfer skoru ve raporu yok                                            |
| Hata türü       | Neden yanlış yapıldığı                      | Distractor analizi, kanıt/strateji hatası etiketi                                      | Genel doğru/yanlış ve explanation              | Yapılandırılmış hata taksonomisi eksik                                  |

### Ölçüm güvenilirliği ilkeleri

- Hız ölçümü metin uzunluğu, zorluk, amaç ve cihaz etkilerinden ayrılmalıdır.
- Doğruluk düşerken süre kısalıyorsa bu başarı değil, muhtemel anlama kaybıdır.
- Aynı pasajdaki tekrar ile yeni pasajdaki performans ayrı raporlanmalıdır.
- Türkçe için yaşa göre eşikler, geçerli norm çalışması olmadan uydurulmamalıdır.
- Assessment sonucundaki eşikler ürün/pilot kararıysa bu açıkça “ürün politikası” olarak etiketlenmelidir.

## 10. Yanlış cevap, tekrar ve ilerleme kuralları

### Kanıta dayalı tasarım ilkesi

Retrieval practice ve spacing genel öğrenmede yararlı olabilir; ancak Oku+ için soru sayısı, gün aralığı ve başarı eşiği doğrudan araştırmadan kopyalanmamalıdır. Spacing ve retrieval’ın eğitimdeki kullanımını inceleyen kapsamlı bir derleme vardır; sonuçlar güçlü bir tasarım yönü sağlar, fakat Türkçe 13–17 yaş grubu için ürün eşiği sağlamaz. [Carpenter, Pan & Butler, 2022](https://www.nature.com/articles/s44159-022-00089-1.pdf)

### Önerilen ürün davranışı

- İlk yanlış cevap: kısa strateji ipucu ve metinsel kanıt yönlendirmesi.
- İkinci benzer hata: daha basit örnek veya yeniden öğretim.
- Başarılı cevap: benzer fakat yeni örnek.
- Pekiştirme: daha sonra gecikmeli tekrar.
- Assessment: mümkün olduğunca yeni içerik, daha az ipucu.
- Tekrarlı aynı soruda sonsuz deneme: ölçüm güvenilirliği için engellenmeli; öğrenme için yeni örnek sunulmalı.

Bu kuralların kesin tekrar sayıları ve zaman aralıkları pilot verisiyle kalibre edilmelidir.

## 11. Yaş, seviye ve Türkçe uyarlama

### Grade ve proficiency ayrımı

Grade, hedef müfredat bağlamıdır; reading proficiency öğrencinin mevcut okuma kapasitesidir. `Content.difficulty`, `QuestionVersion.difficulty`, `readabilityScore` ve `timeSpentMs` bu iki kavramın yerine geçirilemez.

### 13–17 yaş için ilkeler

- Çocukça olmayan, doğal Türkçe.
- Soyutluk ve ön bilgi yükü grade ve görev amacına göre ayarlanmalı.
- Farklı domain’ler kullanılmalı; konu seçimi becerinin yerine geçmemeli.
- Sınav benzeri görevler genel okuma becerisinin yerine konmamalı.
- Metinler uzman/editoryal insan kontrolünden geçmeli.

### Türkçeye özgü sınırlar

Türkçede eklemeli yapı, kelime biçimi, sözcük sıklığı ve cümle yapısı okuma görevlerini etkileyebilir. İngilizce kaynaklardaki WPM veya otomatik kelime tanıma eşikleri Türkçe için doğrudan kullanılmamalıdır. Türkçe okuma akıcılığı ve anlama ilişkisini inceleyen çalışmalar yararlı bağlam sağlar, ancak bulunan Türkçe çalışmaların bir bölümü farklı yaş gruplarında korelasyonel veya özel örneklemli çalışmalardır; 13–17 yaş genellemesi için ayrıca veri gerekir.

MEB programı, 5–8. sınıflarda ana fikir, ayrıntı, soru-cevap, çıkarım, özet ve metin yapısı gibi becerileri resmî kazanımlarla ilişkilendirir. Bu, Oku+ beceri sözlüğü için hizalama girdisidir; müdahale etkisi iddiası değildir. [MEB 2019 programı](https://mufredat.meb.gov.tr/Dosyalar/20195716392253-02-T%C3%BCrk%C3%A7e%20%C3%96%C4%9Fretim%20Program%C4%B1%202019.pdf)

## 12. Mevcut sistemle fark analizi

| Öncelik | Mevcut durum                                                                  | Pedagojik gereklilik                                   | Gerekli değişiklik                                                        | Bağımlılık ve doğrulama                                                             |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0      | FAST beceri ve soru egzersizleri var; somut öğretim adımları tam doğrulanmadı | Önce öğret, sonra rehberli ve bağımsız uygulama        | FAST için kaynaklı lesson metadata ve öğrenme yolu bağları                | Published lesson + renderer + öğrenci akışı; ilgili mevcut lesson/training testleri |
| P0      | Hızlı okuma daily composition içinde var                                      | Ortak aşamaya yeni metin ve iki alanın kanıtıyla geçiş | Ortak pekiştirme/değerlendirme contract’ının skill kanıtlarına bağlanması | Learning-path/progress entegrasyon testi                                            |
| P0      | Doğruluk ölçümü var; hız yalnızca response time                               | Hız, doğruluk ve anlama birlikte izlenmeli             | Kontrollü okuma görevi ve rate ölçüm tasarımı                             | Önce pilot protokolü; Türkçe norm olmadan eşik yok                                  |
| P0      | Genel Assessment var; FAST’e özel blueprint doğrulanmadı                      | Beceriye özgü ve transfer içeren ölçme                 | FAST assessment blueprint ve yeni metin bölümü                            | İçerik/ölçme uzmanı onayı, pilot                                                    |
| P1      | 18 FAST sorusu ve 6 pasaj                                                     | Farklı metin, soru amacı ve zorluk çeşitliliği         | İçerik hacmi ve yeni örnekler artırılmalı                                 | Editorial QA, source/license kontrolü                                               |
| P1      | Explanation ve hint var                                                       | Yanlış cevapta yeniden öğretim                         | Hata türü ve müdahale eşlemesi                                            | Attempt/error analytics                                                             |
| P1      | Ham geçmiş ve adaptive sinyal var                                             | Kalıcılık için zaman aralıklı tekrar                   | Review evidence, dueAt/interval ve gecikmeli test                         | Önce pilot; sonra additive schema/API tasarımı                                      |
| P1      | Content/question kaynağı FAST için belirgin değil                             | Akademik ve telif provenance                           | Kaynak, lisans, kontrol iddiası ve insan onayı alanları                   | Editorial publish gate                                                              |
| P1      | MC ağırlığı yüksek                                                            | Özet, kanıt açıklama, soru üretme gibi performanslar   | Kısa cevap/özet veya rubric tabanlı görevler                              | Scoring ve insan/otomatik değerlendirme kararı                                      |
| P2      | Adaptive zorluk ve son hata sinyali var                                       | Öğrenciye özel curriculum progression                  | Grade/proficiency/unit alignment                                          | Taxonomy schema kararı, migration ve RLS incelemesi                                 |
| P2      | Eye-tracking veya sesli okuma kanıtı yok                                      | Satır takibi/prozodi gerekiyorsa doğrudan ölçüm        | Ayrı cihaz/mahremiyet ve erişilebilirlik değerlendirmesi                  | Araştırma protokolü; varsayılan feature yapılmamalı                                 |

## 13. Önceliklendirilmiş uygulama planı

### Faz P0 — Öğretim ve ölçme çekirdeği

1. Üç FAST becerisi için gerçek öğretim derslerini yaz ve her dersi `LEARNING_LESSON` sözleşmesine bağla.
2. Her ders için objective, model, guided practice, application, feedback ve completion koşulunu tanımla.
3. Ortak pekiştirmeyi iki alanın uygulama kanıtından sonra açılacak şekilde mevcut öğrenme yolu kurallarına bağla.
4. FAST için yeni pasajlı, düşük ipuçlu değerlendirme bölümü ekle.
5. Mevcut `0.75` benzeri eşikleri akademik gerçek olarak değil, sürüm/pilot konfigürasyonu olarak belgelemeye devam et.

### Faz P1 — Kalite, transfer ve kalıcılık

1. Her FAST becerisi için en az iki farklı konu ve görev tipiyle yeni içerik hazırlama.
2. Gecikmeli retrieval ve yeni pasaj transfer görevlerini planlama.
3. Hata türü taksonomisi ve yeniden öğretim yönlendirmesi ekleme.
4. Kaynak, lisans, yaş/grade uygunluğu ve insan incelemesi için publish gate oluşturma.
5. Kısa cevap/özet/kanıt açıklama görevlerinin teknik maliyetini ayrı değerlendirme.

### Faz P2 — Kişiselleştirme ve ileri ölçüm

1. Grade, proficiency, unit/topic ve version-aware alignment için additive schema kararı.
2. Skill ve curriculum node mastery projection.
3. Spaced review scheduling.
4. Gerekirse sesli okuma veya eye-tracking araştırma prototipi; bunları hızlı okumanın zorunlu parçası yapmama.

## 14. Kanıtı yetersiz konular ve pilot araştırma gereksinimleri

Şu kararlar canlı ürün gerçeği değil, pilotta sınanması gereken hipotezlerdir:

- Hangi kısa/orta metin uzunlukları 13–17 yaş için sürdürülebilir?
- FAST_RECOGNITION için hangi Türkçe kelime/ek görevleri anlamlı ve erişilebilir?
- FAST_CHUNKING için seçim görevi ile gerçek üretim görevi arasındaki fark ne kadar?
- Response time ölçümü cihaz ve öğrenci davranışından ne kadar etkileniyor?
- Hangi gecikmeli tekrar aralıkları öğrenme ve kullanım davranışını dengeliyor?
- Hangi score bandı ortak aşamaya geçiş için pedagojik olarak yeterli?
- Yeni metin transferi için kaç farklı pasaj ve beceri örneği gerekli?
- 13–17 yaşın farklı grade ve reading proficiency gruplarında görev etkisi nasıl değişiyor?

Bu sorular için pilot çalışmada en az şu ayrımlar tutulmalıdır: yaş/grade, önceki okuma deneyimi, beceri, metin türü, içerik zorluğu, doğruluk, süre, anlama, gecikmeli tekrar ve yeni metin transferi.

## 15. Son karar

**Mevcut altyapı:** Teknik egzersiz pilotu için kullanılabilir.
**Tam akademik eğitim modeli:** Henüz tamamlanmış değil.
**En önemli eksik:** FAST becerilerinin gerçek öğretim dersleri ve çoklu ölçüm kanıtlarıyla öğrenme yoluna bağlanması.
**Güvenli ürün kararı:** Mevcut kodu “hızlı okuma becerilerini destekleyen egzersizler” olarak konumlandır; bilimsel olarak doğrulanmamış “çok daha hızlı okuma” veya kesin başarı eşiği iddialarını kullanma.

Bu doküman hazırlanırken uygulama kodu, Prisma şeması, veritabanı, migration, seed, deployment veya mevcut çalışma alanındaki diğer dosyalar değiştirilmemiştir.
