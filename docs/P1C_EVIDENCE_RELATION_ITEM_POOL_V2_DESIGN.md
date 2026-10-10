# OkuPratik — P1-C V2 Aday Soru Havuzu

**Durum:** `DESIGN_ONLY`; uzman incelemesi ve pilot hazırlığı için aday havuz
**V1 durumu:** `P1_ADAPTIVE_ITEM_MAPPING_V1`, V1 item bankası, published version'lar ve geçmiş sonuçlar değişmez
**Önerilen havuz ailesi:** `P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN`
**Production:** Öğrenciye atanmaz; runtime import, provisioning veya aktivasyon yoktur.

Bu belge doğrulanmış bir ölçme aracı, kalibre edilmiş soru bankası veya production curriculum değildir. Aday görevler uzmanların construct, dil, yaş uygunluğu ve scoring incelemesine sunulur. Dört görev her boyut için başlangıç tasarım hedefidir; psikometrik yeterlilik, örneklem veya route eşiği anlamına gelmez.

## 1. Ortak sürüm ve görev sözleşmesi

| Alan                         | Tasarım değeri                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `itemPoolId`                 | `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN`                                               |
| `assessmentId`               | `OKU-READING-PLACEMENT-C-V2-DESIGN`                                                           |
| `mappingVersion`             | `P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN`                                                        |
| `measurementContractVersion` | `P1_ADAPTIVE_MEASUREMENT_V2_C_DESIGN`                                                         |
| `scoringContractVersion`     | `P1C_EVIDENCE_RELATION_SCORING_V1_DESIGN`                                                     |
| `rubricVersion`              | `P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN`                                                      |
| `status`                     | `DESIGN_ONLY`, `canonicalActive=false`, `NOT_CALIBRATED`, `productionAssignmentEnabled=false` |

Her aday görev tek bir `primaryConstruct` taşır. Bir görev aynı anda iki dimension'a kopyalanmaz. `questionVersionId`, passage version, answer key, span kimlikleri ve mapping version ileride ayrı immutable kayıtlar olarak oluşturulmalıdır; bu belgede yalnız tasarım kimlikleri vardır.

### Görevler arası bağımsızlık kuralları

- `INFERENCE` görevinde doğru evidence span'i cevap seçenekleri arasında verilmez.
- `EVIDENCE_FINDING` görevinde claim sabit prompt olarak verilir; öğrencinin önceki inference cevabı input değildir.
- `EVIDENCE_RELATION` görevinde `evidenceCandidateId` ve `relationType` iki ayrı response alanıdır. Bir alan diğerinin puanını üretmez.
- Aynı passage kullanılırsa görev sırası counterbalance edilir ve tekrar okuma etkisi kaydedilir. Mümkün olduğunda paralel passage kullanılır.
- Yanıt, response id veya route alanı başka bir göreve taşınmaz. Eksik, duplicate, unknown veya çelişkili response server tarafında `REVIEW_REQUIRED` üretir.
- Relation türleri item bazında versioned metadata ile sınırlandırılır. Önerilen sözlük: `DIRECT_SUPPORT`, `LIMITED_SUPPORT`, `COMPARISON`, `CAUSAL_SUPPORT`, `NOT_SUPPORTED_OR_CONTRADICTS`.

## 2. INFERENCE adayları

`primaryConstruct: INFERENCE` — Öğrenci, passage'da açıkça desteklenen ancak tek bir cümlenin aynen tekrarı olmayan sonucu belirler. Seçenekler, doğru evidence span'ini doğrudan ifşa etmeyecek şekilde yazılır.

### V2C-INF-01 — Balkon saksılarında su kullanımı

- **Passage:** `P1C-V2-TXT-01@1.0`
- **Metin:** “Apartmanın balkonundaki üç saksı bir hafta boyunca aynı miktarda sulandı. Güneş alan saksıdaki toprak ertesi gün kururken gölgede kalan saksıdaki toprak daha uzun süre nemli kaldı. Rüzgâr alan köşedeki saksıda ise yüzey hızlı kurudu, fakat toprağın altı nemini korudu.”
- **Birincil boyut:** `INFERENCE`
- **Yönerge/yanıt biçimi:** “Bu gözlemlerden hangisi metinle en iyi desteklenir?” Dört seçenekli tek seçim; response `selectedOptionId`.
- **Beklenen yanıt/gerekçe:** `A`; güneş ve rüzgâr yüzey kuruluğunu etkileyebilir, fakat yüzey görüntüsü saksının tamamının kuruduğunu kesinleştirmez.
- **Destekleyici kanıt:** `P1C-V2-TXT-01-SPAN-02` (güneş alan toprağın ertesi gün kuruduğu) ve `SPAN-03` (rüzgâr alan saksının yüzey/alt nem ayrımı).
- **Makul yanlışlar/hata türleri:** `B` yüzey kuruluğunu tam kuruma sanma; `C` tek değişkeni tüm saksılara genelleme; `D` ölçüm yapılmadığı halde sulama miktarını sonuç sanma.
- **Puanlama:** Doğru seçenek 1, diğerleri 0; kısmi puan yok. Yanıt yoksa `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Günlük yaşam bağlamı, temel neden-sonuç ve yüzey/alt ayrımı; özel botanik bilgisi gerektirmemeli.
- **Uzman soruları:** A seçeneği metnin kapsamını aşmadan yazılmış mı? “Kuruma” kelimesi yüzey ve tüm toprak ayrımını yaş grubu için açık bırakıyor mu?
- **Pilot karıştırıcıları:** Güneş ve rüzgâr sözcüklerinin aşinalığı, seçenek uzunluğu, “en iyi desteklenir” yönergesinin anlaşılması.

### V2C-INF-02 — Kütüphane çalışma düzeni

- **Passage:** `P1C-V2-TXT-02@1.0`
- **Metin:** “Kütüphane sorumlusu, sessiz çalışma saatlerinde masaların bir bölümünü pencereye yakın, bir bölümünü kapıya yakın düzenledi. Öğrenciler pencere kenarındaki masalarda daha uzun süre çalıştı; kapı yanındaki masalarda ise giriş çıkışlar sıklaştıkça notlarına daha sık ara verdiler. Sorumlu, ertesi hafta masaların yerini değiştirmeyi değil, giriş akışını düzenlemeyi önerdi.”
- **Birincil boyut:** `INFERENCE`
- **Yönerge/yanıt biçimi:** “Metne göre sorumlunun önerisi hangi gözleme dayanıyor olabilir?” Dört seçenekli tek seçim.
- **Beklenen yanıt/gerekçe:** `B`; ara verme davranışı masanın kendisinden çok giriş çıkış akışıyla ilişkili göründüğü için akışı düzenlemek önerilmiştir.
- **Destekleyici kanıt:** `P1C-V2-TXT-02-SPAN-02` ve `SPAN-03`.
- **Makul yanlışlar/hata türleri:** `A` pencereyi tek neden sanma; `C` yer değiştirmenin yapıldığını sanma; `D` sessiz saatlerin kaldırılacağını çıkarma.
- **Puanlama:** Exact-match 1/0; kısmi yok. Belirsiz veya birden fazla seçim `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Okul/kütüphane bağlamı; “akış” sözcüğü uzman incelemesinde yaşa göre kontrol edilmeli.
- **Uzman soruları:** B, metindeki öneri ile gözlem arasında gerçekten sınırlı bir çıkarım mı? Cevap seçenekleri önerilmeyen müdahaleleri gereksiz yere ele veriyor mu?
- **Pilot karıştırıcıları:** Öğrencinin kütüphane deneyimi, uzun cümle yapısı, “dayanıyor olabilir” kipinin yorumlanması.

### V2C-INF-03 — Mahalle kompost kutusu

- **Passage:** `P1C-V2-TXT-03@1.0`
- **Metin:** “Mahalledeki kompost kutusuna sebze kabukları, kuru yapraklar ve bazen karton parçaları eklendi. Kutu yalnızca kabuklarla doldurulduğunda içi ıslandı ve koku oluştu. Kuru yaprak eklendiği haftalarda karışım daha gevşek kaldı. Gönüllüler, her eklemede malzemeleri karıştırıp kuru yaprak oranını gözlemlemeye karar verdi.”
- **Birincil boyut:** `INFERENCE`
- **Yönerge/yanıt biçimi:** “Gönüllülerin karıştırma ve kuru yaprakları izleme kararı en çok hangi sonuca dayanır?” Dört seçenekli tek seçim.
- **Beklenen yanıt/gerekçe:** `C`; yalnızca ıslak malzeme eklemek nem ve koku ile ilişkilendiği için karışım dengesi izlenmek istenmiştir.
- **Destekleyici kanıt:** `P1C-V2-TXT-03-SPAN-02` ve `SPAN-03`.
- **Makul yanlışlar/hata türleri:** `A` kartonu temel neden sanma; `B` tüm kokunun kuru yapraktan geldiğini sanma; `D` kompostun artık kullanılmayacağını çıkarma.
- **Puanlama:** Doğru seçim 1; kısmi yok. Boş/çoklu cevap `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Gündelik çevre bağlamı; kompost bilgisi metinden anlaşılabilir olmalı.
- **Uzman soruları:** C, gözlemden sınırlı sonuç çıkarıyor mu; “denge” sözcüğü metinsel olarak yeterince destekli mi?
- **Pilot karıştırıcıları:** Çevre terminolojisi, seçeneklerdeki malzeme adlarının hatırlanması, metin sıralamasını takip etme.

### V2C-INF-04 — Bisiklet yolunda görünürlük

- **Passage:** `P1C-V2-TXT-04@1.0`
- **Metin:** “Belediye, akşam saatlerinde bisiklet yolunun üç bölümünde gözlem yaptı. Aydınlatması güçlü bölümde yayalar bisikletlileri daha erken fark etti. Ağaçların gölge yaptığı bölümde fark etme mesafesi kısaldı. Yağışlı akşamlarda tüm bölümlerde gözlem sayısı azaldı; ekip bu günleri ayrı değerlendirmeyi planladı.”
- **Birincil boyut:** `INFERENCE`
- **Yönerge/yanıt biçimi:** “Bu gözlemler hangi sonucu en dikkatli biçimde destekler?” Dört seçenekli tek seçim.
- **Beklenen yanıt/gerekçe:** `D`; aydınlatma ve gölge, fark etme mesafesiyle ilişkili görünür; yağışlı günler ayrı tutulmalıdır.
- **Destekleyici kanıt:** `P1C-V2-TXT-04-SPAN-02`, `SPAN-03` ve `SPAN-04`.
- **Makul yanlışlar/hata türleri:** `A` aydınlatmanın her kazayı önlediğini söyleme; `B` yağışta yolun kapandığını çıkarma; `C` gözlem sayısı azalmasını görünürlük kanıtı sanma.
- **Puanlama:** Exact-match 1/0; kısmi yok.
- **Yaş/dil/ön bilgi:** Kamusal alan bağlamı; “fark etme mesafesi” açıklaması metinde bulunmalı.
- **Uzman soruları:** D seçeneği üç bulguyu gereğinden fazla birleştiriyor mu? Yağışın ayrı değerlendirilmesi inference içinde ölçülüyor mu?
- **Pilot karıştırıcıları:** Çok koşullu seçenek, “ayrı değerlendirme” ifadesi, bisiklet deneyimi.

## 3. EVIDENCE_FINDING adayları

`primaryConstruct: EVIDENCE_FINDING` — Claim önceden verilir. Öğrenci, claim'i doğrudan destekleyen span'i seçer; inference sonucu üretmez ve önceki görev cevabına dayanmaz.

### V2C-EVF-01 — Okul bahçesinde gölge

- **Passage:** `P1C-V2-TXT-05@1.0`
- **Metin/spanlar:** `SPAN-01` “Bahçenin kuzey kenarında öğleden sonra uzun bir gölge oluştu.” `SPAN-02` “Öğrenciler bu bölgedeki banklara daha erken oturdu.” `SPAN-03` “Sabah saatlerinde banklar güneşliydi.” `SPAN-04` “Bahçedeki ağaçların yaprakları yazın çoğaldı.”
- **Birincil boyut:** `EVIDENCE_FINDING`
- **Sabit claim:** “Kuzey kenarındaki banklar öğleden sonra gölgede kalmıştır.”
- **Yönerge/yanıt biçimi:** “Claim'i doğrudan destekleyen span'i seç.” Tek seçim; response `evidenceSpanId`.
- **Beklenen yanıt/gerekçe:** `SPAN-01`; gölgenin oluştuğunu doğrudan söyler.
- **Makul yanlışlar/hata türleri:** `SPAN-02` sonucu ima eder ama gölgeyi söylemez; `SPAN-03` farklı zaman dilimidir; `SPAN-04` konuya ilgilidir fakat claim'i desteklemez.
- **Puanlama:** Canonical span exact-match 1/0; `SPAN-02` kısmi sayılmaz. Boş/çoklu seçim `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Basit zaman ve mekân ilişkisi; özel botanik bilgisi gerektirmemeli.
- **Uzman soruları:** Claim ve span aynı anlamı gereksizce tekrar ediyor mu? İma eden span kasten makul ama yetersiz mi?
- **Pilot karıştırıcıları:** “kuzey kenarı” mekân sözcüğü, paragraf sırası, doğrudan/ima ayrımı.

### V2C-EVF-02 — Otobüs durağında bekleme

- **Passage:** `P1C-V2-TXT-06@1.0`
- **Metin/spanlar:** `SPAN-01` “Yağmur başladığında durakta bekleyenlerin çoğu saçak altına geçti.” `SPAN-02` “Durakta iki bank ve bir bilgilendirme panosu vardı.” `SPAN-03` “Otobüsün geliş saati panoda yazıyordu.” `SPAN-04` “Bazı yolcular şemsiyelerini kapının yanında kapattı.”
- **Birincil boyut:** `EVIDENCE_FINDING`
- **Sabit claim:** “Yağmur başlayınca bekleyenlerin bir bölümü daha korunaklı bir yere geçti.”
- **Yönerge/yanıt biçimi:** Dört span arasından claim'i doğrudan destekleyeni seç.
- **Beklenen yanıt/gerekçe:** `SPAN-01`; hem zaman hem hareket hem de saçak bilgisi vardır.
- **Makul yanlışlar/hata türleri:** `SPAN-04` yağmurla ilgili olabilir ama geçişi göstermez; `SPAN-02` durak yapısını verir; `SPAN-03` zaman bilgisidir.
- **Puanlama:** Exact-match 1/0; kısmi yok.
- **Yaş/dil/ön bilgi:** Günlük ulaşım bağlamı; “korunaklı” kelimesi uzman tarafından yaşa göre sadeleştirilebilir.
- **Uzman soruları:** “Saçak altı” korunaklılık için yeterli metinsel kanıt mı? Yanlış span'ler konu benzerliği yoluyla gereksiz ipucu veriyor mu?
- **Pilot karıştırıcıları:** Eş anlamlılık, yağmur sözcüğünün birden fazla span'de geçmesi, span uzunluğu.

### V2C-EVF-03 — Mutfak atıklarının ayrılması

- **Passage:** `P1C-V2-TXT-07@1.0`
- **Metin/spanlar:** `SPAN-01` “Kantin, meyve kabuklarını ayrı bir kovada toplamaya başladı.” `SPAN-02` “Kovaların üzerindeki etiketler her sabah yenilendi.” `SPAN-03` “Kantin ekibi öğle arasında masaları sildi.” `SPAN-04` “Meyve kabukları kompost kutusuna taşındı.”
- **Birincil boyut:** `EVIDENCE_FINDING`
- **Sabit claim:** “Kantin meyve kabuklarını diğer atıklardan ayrı toplamıştır.”
- **Yönerge/yanıt biçimi:** Claim'i doğrudan destekleyen span'i seç.
- **Beklenen yanıt/gerekçe:** `SPAN-01`; ayrı kova açıkça ayrıştırmayı gösterir. `SPAN-04` sonraki taşıma adımıdır ve tek başına toplama biçimini anlatmaz.
- **Makul yanlışlar/hata türleri:** `SPAN-04` sonucu taşımadan çıkarma; `SPAN-02` etiketlemeyi toplama sanma; `SPAN-03` ilgisiz işlem.
- **Puanlama:** Exact-match 1/0; alternatif cevap kabul edilmez.
- **Yaş/dil/ön bilgi:** Okul/kantin bağlamı; kompostun ne olduğu bilinmese de claim çözülebilmeli.
- **Uzman soruları:** `SPAN-04` neden ilgili ama yetersiz; bu ayrım yönergeyle ölçülüyor mu?
- **Pilot karıştırıcıları:** “ayrı”, “ayrıştırma”, “taşındı” fiillerinin anlaşılması.

### V2C-EVF-04 — Mahalle haritası

- **Passage:** `P1C-V2-TXT-08@1.0`
- **Metin/spanlar:** `SPAN-01` “Harita ekibi parkın iki girişini farklı renklerle işaretledi.” `SPAN-02` “Çocuklar haritaya kendi isimlerini yazdı.” `SPAN-03` “Parkın çevresinde dört sokak bulunuyor.” `SPAN-04` “Ekip haritayı cuma günü sergileyecek.”
- **Birincil boyut:** `EVIDENCE_FINDING`
- **Sabit claim:** “Haritada parkın iki girişi birbirinden ayırt edilmiştir.”
- **Yönerge/yanıt biçimi:** Claim'i doğrudan destekleyen span'i seç.
- **Beklenen yanıt/gerekçe:** `SPAN-01`; iki giriş ve farklı renkler doğrudan ayrımı gösterir.
- **Makul yanlışlar/hata türleri:** `SPAN-03` parkın çevresini anlatır ama girişleri ayırt etmez; `SPAN-04` sergileme zamanıdır; `SPAN-02` harita üzerindeki farklı bir işlemdir.
- **Puanlama:** Exact-match 1/0; boş veya birden çok cevap `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Harita kavramı günlük düzeyde; “ayırt edilmiştir” yönerge öncesi örnekle açıklanabilir.
- **Uzman soruları:** Claim için “farklı renk” yeterince doğrudan mı? Renk görsel olmadan metin olarak anlaşılır mı?
- **Pilot karıştırıcıları:** Renk adları, “giriş” ile “çevre” ayrımı, harita deneyimi.

## 4. EVIDENCE_RELATION adayları

`primaryConstruct: EVIDENCE_RELATION` — Claim ve aday kanıtlar sabit verilir. Öğrenci iki ayrı alan doldurur:

```json
{
  "evidenceCandidateId": "...",
  "relationType": "DIRECT_SUPPORT | LIMITED_SUPPORT | COMPARISON | CAUSAL_SUPPORT | NOT_SUPPORTED_OR_CONTRADICTS"
}
```

`evidenceCandidateId` doğru olsa bile `relationType` ayrıca puanlanır. Bir item'da kabul edilen relation türleri answer key içinde açıkça versioned metadata'ya yazılmalıdır. Buradaki puanlar route eşiği değildir.

### V2C-REL-01 — Bitkinin ışık yönü

- **Passage:** `P1C-V2-TXT-09@1.0`
- **Metin:** “Sınıftaki küçük bitkinin yaprakları pencereye bakan tarafta daha sık görünüyordu. Öğretmen saksıyı her gün çevirmedi; yalnızca ışığın gün içinde değiştiğini gözlemledi. Bitkinin daha hızlı büyüdüğünü söylemek için henüz ölçüm yapılmadı.”
- **Birincil boyut:** `EVIDENCE_RELATION`
- **Sabit claim:** “Bitkinin yaprak dağılımı ışık yönüyle ilişkili olabilir.”
- **Aday kanıtlar:** `CAND-01` “Yapraklar pencereye bakan tarafta daha sıktı.” `CAND-02` “Saksı her gün çevrilmedi.” `CAND-03` “Daha hızlı büyüdüğünü söylemek için ölçüm yapılmadı.”
- **Yönerge/yanıt biçimi:** “Claim'i en doğrudan destekleyen kanıtı seç (`evidenceCandidateId`) ve ilişkinin niteliğini seç (`relationType`).”
- **Beklenen yanıt/gerekçe:** `CAND-01` + `LIMITED_SUPPORT`; gözlem ilişkiyi düşündürür, nedenselliği veya büyümeyi kanıtlamaz.
- **Makul yanlışlar/hata türleri:** `CAND-02` koşulu kanıt sanma; `CAND-03` sınırlılığı destek sanma; `CAUSAL_SUPPORT` gözlemi kesin neden olarak yorumlama.
- **Puanlama:** Evidence seçimi 0/1, relation türü 0/1 ayrı kaydedilir. İki alanın ikisi de doğruysa item relation evidence tamamdır; tek alan doğruysa toplam puana otomatik çevrilmez, `PARTIAL_REVIEW` adayıdır.
- **Yaş/dil/ön bilgi:** Sınıf bitkisi bağlamı; “ilişkili olabilir” ile “kesin neden” ayrımı açıkça kontrol edilmeli.
- **Uzman soruları:** `LIMITED_SUPPORT` seçenek metninde doğru relation'ı ipucu olarak ele veriyor mu? CAND-03 sınırlılık örneği olarak anlaşılır mı?
- **Pilot karıştırıcıları:** İlişki/nedensellik dili, seçeneklerin uzunluğu, bitki bilgisi ve olumsuz cümleler.

### V2C-REL-02 — Yağmur sonrası yaya yolu

- **Passage:** “Park görevlisi yağmurdan sonra yaya yolunun bir bölümünde su kaldığını kaydetti. Aynı bölümde eğimin daha az olduğunu da not etti. Görevli, eğim değişikliğinin suyun akışını etkileyip etkilemediğini ölçmek için yeni bir gözlem planladı.”
- **Passage ID:** `P1C-V2-TXT-10@1.0`
- **Birincil boyut:** `EVIDENCE_RELATION`
- **Sabit claim:** “Yolun az eğimli olması, suyun daha uzun süre kalmasına katkı sağlayabilir.”
- **Aday kanıtlar:** `CAND-01` “Yağmurdan sonra yolun bir bölümünde su kaldı.” `CAND-02` “Aynı bölümde eğim daha azdı.” `CAND-03` “Eğim değişikliğinin etkisi henüz ölçülmedi.”
- **Yönerge/yanıt biçimi:** İki alanlı response: aday kanıt + relation türü.
- **Beklenen yanıt/gerekçe:** `CAND-02` + `LIMITED_SUPPORT`; eğim ve su kalması birlikte gözlenmiştir, katkı henüz deneyle doğrulanmamıştır.
- **Makul yanlışlar/hata türleri:** `CAND-01` tek başına eğimi kanıt sanma; `CAND-03` araştırma planını sonuç sanma; `CAUSAL_SUPPORT` ile kesin nedensellik kurma.
- **Puanlama:** Evidence ve relation ayrı 0/1; kısmi yanıt final route evidence değildir.
- **Yaş/dil/ön bilgi:** Günlük çevre/yağmur bağlamı; “eğim” kısa tanımla veya uzman kararıyla kontrol edilmeli.
- **Uzman soruları:** Claim'in “katkı sağlayabilir” sınırı metinle uyumlu mu? CAND-01 ve CAND-02 birlikte verilince doğru ilişki aşırı kolaylaşıyor mu?
- **Pilot karıştırıcıları:** Eğim sözcüğü, “aynı bölüm” referansı, adayların uzunluk farkı.

### V2C-REL-03 — Sınıf kitaplığında ödünç alma

- **Passage:** “Sınıf kitaplığında yeni bir ödünç alma çizelgesi kullanılmaya başlandı. İlk hafta öğrenciler kitapları daha düzenli geri getirdi; ancak öğretmen aynı hafta kitap seçme saatlerinin de değiştiğini belirtti. Bu nedenle çizelgenin tek başına düzeni sağladığı sonucuna henüz varılmadı.”
- **Passage ID:** `P1C-V2-TXT-11@1.0`
- **Birincil boyut:** `EVIDENCE_RELATION`
- **Sabit claim:** “Yeni çizelge, kitapların daha düzenli geri getirilmesine katkıda bulunmuş olabilir.”
- **Aday kanıtlar:** `CAND-01` “İlk hafta kitaplar daha düzenli geri getirildi.” `CAND-02` “Kitap seçme saatleri de değişti.” `CAND-03` “Çizelgenin tek başına etkisi henüz belirlenmedi.”
- **Yönerge/yanıt biçimi:** Claim'i destekleyen en uygun aday kanıtı ve relation türünü ayrı seç.
- **Beklenen yanıt/gerekçe:** `CAND-01` + `LIMITED_SUPPORT`; sonuç çizelgeyle aynı dönemde gözlenmiştir, tek neden olduğu gösterilmemiştir.
- **Makul yanlışlar/hata türleri:** `CAND-02` alternatif koşulu doğrudan destek sanma; `CAND-03` sınırlılığı kanıt sanma; `CAUSAL_SUPPORT` ile tek neden iddiası.
- **Puanlama:** Evidence selection ve relation type ayrı kayıt; yalnız ikisinin birlikte doğrulanması tam relation evidence adayıdır.
- **Yaş/dil/ön bilgi:** Sınıf rutini; “tek başına” ve “aynı hafta” anlamları kontrol edilmeli.
- **Uzman soruları:** Doğru relation'ın sınırlı olduğu seçenekler dilsel olarak dengeli mi? Alternatif açıklama metinde yeterince görünür mü?
- **Pilot karıştırıcıları:** Zaman eşzamanlılığını nedensellik sanma, “düzenli” sözcüğü, okuma belleği.

### V2C-REL-04 — Meyve kasalarının gölgede tutulması

- **Passage:** “Pazar esnafı çilek kasalarını sabah güneşi almayan bir bölüme taşıdı. Öğleden sonra bazı kasalarda meyveler daha diri görünüyordu; aynı gün kasalara daha az ürün konduğu da kaydedildi. Esnaf, gölge ve kasa doluluğunun etkisini ayrı ayrı incelemek istedi.”
- **Passage ID:** `P1C-V2-TXT-12@1.0`
- **Birincil boyut:** `EVIDENCE_RELATION`
- **Sabit claim:** “Kasaların gölgede tutulması meyvelerin daha diri kalmasına yardımcı olmuş olabilir.”
- **Aday kanıtlar:** `CAND-01` “Kasalar sabah güneşi almayan bölüme taşındı.” `CAND-02` “Bazı kasalarda meyveler daha diri göründü.” `CAND-03` “Aynı gün kasalara daha az ürün kondu.” `CAND-04` “Gölge ve doluluk etkileri ayrı incelenecek.”
- **Yönerge/yanıt biçimi:** `evidenceCandidateId` ve `relationType` alanlarını bağımsız doldur.
- **Beklenen yanıt/gerekçe:** `CAND-02` + `LIMITED_SUPPORT`; diri görünüm gözlenmiştir fakat gölgenin tek neden olduğu ayrıştırılmamıştır. `CAND-04` sınırlılığı açıklar, ana destek değildir.
- **Makul yanlışlar/hata türleri:** `CAND-01` koşulu sonuç sanma; `CAND-03` alternatif faktörü destekleyici kanıt sanma; `CAUSAL_SUPPORT` ile kesinleştirme; `CAND-04` ile claim'i desteklediğini sanma.
- **Puanlama:** Selection 0/1, relation 0/1; disagreement veya iki alanın çelişkisi `REVIEW_REQUIRED`.
- **Yaş/dil/ön bilgi:** Pazar/yiyecek bağlamı; “diri” sözcüğünün hedef yaşta anlaşılması doğrulanmalı.
- **Uzman soruları:** `CAND-02` ile `CAND-04` işlevsel olarak yeterince ayrılıyor mu? “Yardımcı olmuş olabilir” sınırlı ilişkiyi doğru temsil ediyor mu?
- **Pilot karıştırıcıları:** Görsel kaliteyi yorumlama, “diri” kelimesi, alternatif açıklamanın hatırlanması, aday uzunluğu.

## 5. Boyutlar arası karşılaştırmalı kontrol

| Kontrol                                     | Beklenen tasarım kararı                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Aynı response'un yeniden etiketlenmesi      | Yasak; her görev tek primary construct taşır                            |
| INFERENCE → EVIDENCE_FINDING                | Claim sabit verilir; önceki inference yanıtı taşınmaz                   |
| EVIDENCE_FINDING → EVIDENCE_RELATION        | Span seçimi relation puanını otomatik üretmez                           |
| Relation seçim alanları                     | `evidenceCandidateId` ve `relationType` ayrı saklanır ve puanlanır      |
| Bütün boyutlarda tek toplam puan            | Bu tasarımda yok; akademik kalibrasyon kararı uzman/veri ekibine aittir |
| Eksik/ambiguous/çelişkili cevap             | `REVIEW_REQUIRED`; otomatik route ataması yok                           |
| WPM, süre, Training veya client route alanı | Evidence değildir; scorer tarafından kullanılmaz                        |

## 6. Uzman incelemesine aktarılacak ortak sorular

1. Her görev tek bir construct'ı mı ölçüyor, yoksa okuma belleği ve dil yükü baskın mı?
2. Doğru seçenek/aday, span veya relation türü dilsel biçimiyle ipucu veriyor mu?
3. Çeldirici, belirli bir hata türünü temsil ediyor mu; yoksa yalnızca bariz yanlış mı?
4. Claim ile evidence arasındaki kapsam, zaman ve nedensellik sınırları tek anlamlı mı?
5. Türkçe ifade hedef yaş ve grade için doğal, açık ve önyargısız mı?
6. Kısmi yanıtın insan değerlendiricilerce aynı rubrikle sınıflandırılması mümkün mü?
7. Bu aday, production assignment veya seviye kararı vermeden önce hangi ek kanıtı gerektiriyor?

## 7. Pilot öncesi açık bırakılan kararlar

Bu aday havuz; katılımcı sayısı, nihai madde sayısı, yaş/grade aralığı, minimum evidence count, kabul eşiği, route seviyesi veya classification stability kriteri belirlemez. Bunlar ölçme uzmanı ve veri sorumlusu tarafından mevcut kalibrasyon protokolüne göre doldurulmalıdır.

Pilot tamamlanana kadar:

- `canonicalActive=false`;
- `calibrationStatus=NOT_CALIBRATED`;
- `productionAssignmentEnabled=false`;
- `reviewRequired=true`;
- `resultLevelId=null`;
- P1-B ve P1-D kapalı;
- P1-C otomatik ataması kapalı;
- P0, P1-A ve geçmiş sonuçlar korunur.
