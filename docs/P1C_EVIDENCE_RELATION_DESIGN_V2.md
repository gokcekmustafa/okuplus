# OkuPratik — P1-C Evidence Relation Bağımsız Ölçüm Tasarımı v2

**Durum:** Tasarım taslağı; production assignment kapalı
**Başlangıç master:** bd4737d20b2201201b96601595fedf4a561ed9d1
**V1 item mapping:** P1_ADAPTIVE_ITEM_MAPPING_V1
**Önerilen tasarım ailesi:** P1-C V2

Bu belge doğrulanmış bir ölçme aracı, kalibrasyon sonucu veya production curriculum değildir. Uzman ve veri sorumlusu incelemesine sunulan tasarımdır. V1 item bankası, V1 mapping'i, published version'lar ve geçmiş assessment sonuçları değiştirilmeyecektir.

## 1. Tasarım kararı

P1-C için üç boyut aynı metin ailesini kullanabilse de aynı öğrenci cevabını yeniden etiketlememelidir:

1. **INFERENCE:** Metinden desteklenen sonucu belirleme.
2. **EVIDENCE_FINDING:** Önceden verilmiş bir sonucu destekleyen metin parçasını belirleme.
3. **EVIDENCE_RELATION:** Önceden verilmiş bir sonuç ile seçilmiş/aday kanıt arasındaki destek ilişkisini açıklama veya doğru ilişkiyi kurma.

En güvenli V2 başlangıcı, üç görevi ayrı response object, ayrı QuestionVersion ve ayrı mapping rolü ile tasarlamaktır. Bir görevin cevabı sonraki görevin cevabı olarak taşınmaz. Route seçimi için her boyutun kendi server-scored kanıtı gerekir.

Önerilen ilk V2 relation görevi yapılandırılmış bir response kullanır:

- öğrenciye sabit bir sonuç/claim verilir;
- bir veya daha fazla metin kanıtı adayı verilir;
- öğrenci uygun kanıtı seçer;
- kanıtın claim'i nasıl desteklediğini ilişki türü veya kısa gerekçe seçimiyle belirtir.

Serbest açıklama, ikinci bir araştırma kolu olarak pilotta denenebilir; ilk scorer'ın üretken yapay zekâ ile otomatikleştirilmesi önerilmez.

## 2. Mevcut V1 bulguları

### V1 mapping

Mevcut P1_ADAPTIVE_ITEM_MAPPING_V1 içinde:

- INFERENCE adayları vardır.
- EVIDENCE_FINDING adayları vardır.
- Q006, Q018 ve Q030 hem INFERENCE hem EVIDENCE_RELATION olarak etiketlenmiştir.
- Q013 EVIDENCE_RELATION adayı olarak etiketlenmiştir.

Bu etiketler editorial metadata'dır; bağımsız relation ölçümü kanıtlamaz.

### V1 scorer ve contract

Mevcut adaptive measurement scorer:

- yalnız canonical placement identity, item-bank identity, trusted source metadata ve server-side answer sonucunu kabul eder;
- mapping'de bir soru birden fazla dimension taşıyorsa aynı raw answer score'u her mapped dimension için toplar;
- C için INFERENCE, EVIDENCE_FINDING ve EVIDENCE_RELATION evidence alanlarını üretir;
- C route kararını yalnız eksiksiz ve endpoint-only server evidence durumunda değerlendirir;
- eksik/çelişkili/intermediate evidence durumunda REVIEW_REQUIRED döndürür;
- NOT_CALIBRATED ve productionAssignmentEnabled=false olduğu sürece route assignment'ı kapalı tutar.

Sonuç olarak V1, relation'ın gerçekten bağımsız ölçüldüğünü söylemek için yeterli değildir. V2, aynı QuestionVersion'ın iki construct'a aynı cevapla puan yazmasını yasaklamalıdır.

## 3. Önerilen V2 version seti

Bu kimlikler henüz oluşturulmuş production kayıtları değildir; yalnızca tasarım önerisidir:

| Bileşen              | Önerilen V2 kimliği                           | Kural                                            |
| -------------------- | --------------------------------------------- | ------------------------------------------------ |
| Item bank            | OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN | V1'e soru eklemez; yeni stable ID alanı kullanır |
| Assessment           | OKU-READING-PLACEMENT-C-V2-DESIGN             | V1 assessment'ı overwrite etmez                  |
| Mapping              | P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN          | Her C görevi tek primary construct role taşır    |
| Measurement contract | P1_ADAPTIVE_MEASUREMENT_V2_C_DESIGN           | Dimension evidence şemasını versionlar           |
| Relation rubric      | P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN        | İnsan değerlendirmesi için taslak rubrik         |
| Scoring contract     | P1C_EVIDENCE_RELATION_SCORING_V1_DESIGN       | Pilot öncesi implement edilmez                   |
| Calibration decision | Boş                                           | Uzman ve pilot kanıtı olmadan atanmaz            |

V2 stable question ID'leri V1'den farklı olmalıdır. Bir V1 questionVersionId'si V2 evidence boyutu için yeniden yorumlanmamalıdır.

## 4. Üç bağımsız görev modeli

### 4.1 INFERENCE — sonucu belirleme

**Görev girdisi:** Passage ve tek bir çıkarım sorusu.
**Öğrenci yanıtı:** Metinle desteklenen bir sonuç seçer veya kısa bir sonuç kurar.
**Scoring:** İlk sürüm için dört seçenekli server-scored seçim önerilir. Serbest yanıt varsa insan rubriği gerekir.
**Kanıt:** Seçilen sonucun passage ile desteklenip desteklenmediği.

Inference görevi, doğru kanıt paragrafını seçenek olarak vermemelidir. Aksi halde öğrenci evidence finding görevinin cevabını kullanarak inference cevabını eleme yoluyla bulabilir.

**Hata türleri:**

- Metnin söylemediği sonucu üretme.
- Tek ayrıntıyı bütün passage'a genelleme.
- İlgili konuyu doğru bulup desteklenmeyen sonucu seçme.
- Nedensellik, karşılaştırma veya zaman ilişkisini yanlış kurma.
- Sonucu kendi ön bilgisine dayandırma.

### 4.2 EVIDENCE_FINDING — destekleyen parçayı belirleme

**Görev girdisi:** Passage ve önceden sabitlenmiş bir claim/sonuç.
**Öğrenci yanıtı:** Claim'i doğrudan destekleyen cümle, paragraph veya span seçer.
**Scoring:** Canonical span/paragraph ID ile server exact-match veya önceden tanımlı çoklu doğru span contract'ı.
**Kanıt:** Claim ile seçilen text span arasındaki doğrudan metinsel destek.

Bu görevde claim öğrenci tarafından inference görevinden taşınmamalıdır. Claim prompt içinde bağımsız verilir. Böylece inference başarısız olsa bile evidence finding ayrı değerlendirilebilir.

**Hata türleri:**

- Aynı konudan söz eden fakat claim'i desteklemeyen span seçme.
- Sonucu tekrar eden ama gerekçe sunmayan cümleyi seçme.
- Kanıt yerine yöntem ayrıntısı seçme.
- Claim ile çelişen parçayı seçme.
- Çok geniş passage seçip ayırt edici kanıtı bulamama.

### 4.3 EVIDENCE_RELATION — kanıt-sonuç bağını kurma

**Görev girdisi:** Passage, sabit claim ve kanıt adayları. Claim ile doğru kanıt arasındaki relation türleri ayrıca verilir.
**Öğrenci yanıtı:** Uygun kanıtı ve bunun claim'i nasıl desteklediğini seçer. İlk V2 taslağında response iki ayrı alandır:

1. evidenceCandidateId;
2. relationType.

Önerilen relationType kümesi passage'a göre sınırlı ve editorial olarak tanımlı olmalıdır:

- doğrudan gözlem;
- karşılaştırma;
- neden-sonuç desteği;
- koşullu/sınırlı destek;
- desteklemiyor veya çelişiyor.

Bu küme her item için aynı olmak zorunda değildir; ancak bir item'ın kabul edilen relation türü açıkça versioned metadata'da bulunmalıdır.

**Scoring:**

- evidenceCandidateId server tarafında canonical item metadata ile karşılaştırılır;
- relationType bağımsız olarak değerlendirilir;
- iki alanın birlikte doğrulanması relation evidence üretir;
- yalnız ilgili konuya ait bir span seçmek, relation kanıtı sayılmaz;
- claim'i doğru seçmek veya inference sorusunu doğru cevaplamak relation puanı üretmez.

**Hata türleri:**

- Konuyla ilgili ama claim'i desteklemeyen kanıt seçme.
- Kanıtı seçip destek ilişkisini yanlış adlandırma.
- Korelasyonu nedensellik olarak açıklama.
- Gelecekte yapılacak deneyi gerçekleşmiş kanıt sanma.
- Kanıtı tekrar edip neden desteklediğini kurmama.
- Kapsamı aşan, metinde olmayan sonuç üretme.
- Çelişen kanıtı destekleyici olarak işaretleme.

## 5. Aynı metin üzerinde bağımsızlık

Aynı passage üzerinde üç görev kullanılacaksa aşağıdaki kurallar zorunludur:

1. INFERENCE görevi evidence span seçeneklerini göstermemelidir.
2. EVIDENCE_FINDING görevi claim'i sabit prompt olarak vermeli, öğrencinin inference cevabını girdi kabul etmemelidir.
3. EVIDENCE_RELATION görevi hem claim'i hem relation adaylarını sabit ve versioned biçimde vermelidir.
4. Bir görevin response'u başka göreve otomatik taşınmamalıdır.
5. Görevler randomize veya counterbalanced sırayla sunulmalıdır; sıra etkisi pilotta izlenmelidir.
6. Aynı passage'ın tekrar okunması, hafıza ve alışma etkisi olarak kaydedilmelidir.
7. Relation görevinde kullanılan claim, inference görevindeki doğru seçenekle aynı cümle yapısında olmamalıdır.
8. Evidence finding doğru span'i doğrudan relation görevinde tekrar kullanacak şekilde öğrenciye ipucu vermemelidir.
9. Metin uzunluğu, kelime yükü, görev yönergesi ve cevap biçimi construct dışı yük olarak uzman tarafından değerlendirilmelidir.
10. Response time yalnız yardımcı bağlamdır; tek başına relation evidence veya route kararı değildir.

Tercih edilen pilot düzeni, aynı construct için paralel passage/item setleri ve counterbalanced görev sıraları kullanmaktır. Aynı passage üzerinde üç görevin birlikte kullanılması ancak okuma yükü ve tekrar etkisi ayrıca incelenirse kabul edilmelidir.

## 6. Örnek V2 görev paketi

Aşağıdaki örnekler gerçek production item'ı değildir; uzman incelemesine sunulan taslaklardır.

### Örnek passage

Okulun arka bahçesinde yağmurdan sonra su birikiyordu. Öğrenciler üç hafta boyunca yağmur miktarını ve suyun ne kadar sürede çekildiğini kaydetti. Su, toprağın sıkıştırıldığı alanlarda daha geç çekildi; ancak çok yoğun yağmurdan sonraki ölçümleri ayrı not ettiler. Ekip, zemini gevşetilen küçük bir alanda suyun daha hızlı çekilip çekilmediğini denemeyi önerdi.

### Görev A — INFERENCE

**Soru:** Bu gözlemlerden hangi sonuç metinle en iyi desteklenir?

**Taslak seçenekler:**

1. Toprak sıkışması, suyun çekilme süresiyle ilişkili olabilir.
2. Her yağmurdan sonra su aynı sürede çekilir.
3. Zemini gevşetmek kesin olarak sorunu çözer.
4. Yağmur miktarı ölçülemez.

**Beklenen yanıt:** 1
**Taslak puanlama:** Server exact-match; seçenek 1 dışında cevap inference kanıtı oluşturmaz.
**Uzman sorusu:** 1 numara ilişki iddiasını metnin desteklediği ölçüde mi sınırlıyor, yoksa nedensellik iddiası fazla mı?

### Görev B — EVIDENCE_FINDING

**Sabit claim:** Sıkıştırılmış zeminlerde su daha geç çekilmiştir.

**Soru:** Bu claim'i doğrudan destekleyen span hangisidir?

**Taslak seçenekler:**

1. Öğrenciler üç hafta boyunca yağmur miktarını kaydetti.
2. Su, toprağın sıkıştırıldığı alanlarda daha geç çekildi.
3. Çok yoğun yağmurdan sonraki ölçümleri ayrı not ettiler.
4. Ekip küçük bir alanda yeni bir deneme önermiştir.

**Beklenen yanıt:** 2
**Taslak puanlama:** Canonical span ID exact-match.
**Uzman sorusu:** 3 numara önemli bir koşul olsa da claim için doğrudan kanıt değildir; seçenekler bu ayrımı yeterince net yapıyor mu?

### Görev C — EVIDENCE_RELATION

**Sabit claim:** Zemini gevşetmek suyun çekilmesini hızlandırabilir.

**Sabit evidence candidate:** Ekip, zemini gevşetilen küçük bir alanda suyun daha hızlı çekilip çekilmediğini denemeyi önerdi.

**Soru:** Bu cümle claim'i nasıl destekler?

**Taslak seçenekler:**

1. Claim'i kesin olarak kanıtlar; çünkü deney sonucu zaten alınmıştır.
2. Claim için bir test önerir; ancak sonucu henüz doğrulamaz.
3. Claim ile ilgisizdir; yalnız yağmur miktarını anlatır.
4. Claim'in tersini kanıtlar.

**Beklenen yanıt:** 2
**Taslak puanlama:** evidenceCandidateId doğru ve relationType koşullu/henüz doğrulanmamış destek olmalıdır.
**Uzman sorusu:** Öğrenci hypothesis ile gözlenmiş kanıtı güvenilir biçimde ayırıyor mu?

Bu üç taslak aynı passage'ı kullanmasına rağmen:

- A'da öğrenci claim seçer;
- B'de claim sabittir ve span seçilir;
- C'de claim ve span sabittir, ilişki niteliği seçilir.

Bu nedenle B'nin doğru span'i A'nın doğru claim'ini otomatik ele vermemeli, C de B'nin response'unu input olarak almamalıdır.

## 7. Evidence relation rubriği

İlk rubrik taslağı hem yapılandırılmış response hem de kısa açıklama pilotunu destekler. Bu puanlar route threshold değildir; yalnızca uzmanların aynı yanıtı karşılaştırması için çalışma ölçeğidir.

| Düzey     | Evidence seçimi                                                             | Relation açıklaması                                                 | Tipik karar            |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| 3 — tam   | Claim'i doğrudan veya item contract'ına göre uygun biçimde destekleyen span | Kanıtın claim'i nasıl desteklediğini doğru, kapsamı aşmadan açıklar | Güçlü aday kanıt       |
| 2 — kısmi | İlgili bir span seçer; doğrudanlık veya kapsam kısmen doğrudur              | İlişkiyi eksik, fazla genel veya kısmen doğru kurar                 | Uzman review           |
| 1 — zayıf | Konuyla ilgili ama claim'i desteklemeyen ya da fazla geniş span seçer       | İlişkiyi tekrar, sezgi veya ön bilgiyle açıklar                     | Evidence yok/çok zayıf |
| 0 — yok   | Yanlış, boş, çelişkili veya metin dışı span                                 | Claim ile ilişki kuramaz veya ters ilişki kurar                     | Evidence yok           |

Serbest açıklama puanlanırken iki boyut ayrı kaydedilmelidir:

- evidence selection;
- relation reasoning.

Bunlar pilot öncesi tek toplam puana indirgenmemelidir. Ağırlık ve kabul kuralı ölçme uzmanı tarafından belirlenmelidir.

### Çoklu değerlendirici prosedürü

1. Değerlendiriciler response metadata ve route kararını görmeden bağımsız puanlar.
2. Her item için anchor response örnekleri ve gerekçe kaydedilir.
3. Anlaşmazlıklar ilk puanlar değiştirilmeden ayrı adjudication kaydına alınır.
4. Değerlendirici eğitimi ve örnek yanıtlar aynı rubric version ile saklanır.
5. Anlaşma analizi, veri sorumlusu tarafından uygun kategorik/ordinal yöntemle yapılır; bu belge sayısal kabul eşiği belirlemez.
6. Üretken yapay zekâ en fazla açıklama organizasyonu için yardımcı olabilir; nihai akademik puan veya calibration kararı veremez.

## 8. Uzman inceleme soruları

### Construct ayrımı

- Inference item'ı metinle desteklenen sonucu gerçekten ayırt ediyor mu?
- Evidence finding item'ında claim öğrencinin inference cevabından bağımsız mı?
- Relation item'ı evidence seçimi ile relation reasoning'i ayrı gözlemliyor mu?
- Relation seçenekleri doğru cevabı dilsel olarak ele veriyor mu?
- Aynı passage tekrarına bağlı hafıza etkisi construct dışı yük oluşturuyor mu?

### Metin ve cevap biçimi

- Passage uzunluğu ve kelime yükü üç görevi orantısız etkiliyor mu?
- Matching, çoktan seçmeli veya kısa açıklama biçimi relation yerine format becerisini mi ölçüyor?
- Cümleler birden fazla savunulabilir relation türü üretiyor mu?
- Hypothesis, observation, correlation, causality ve limitation ayrımları yaş grubuna uygun mu?
- Türkçe yönerge ve seçenekler öğrencinin relation'ı anlamasını engelliyor mu?

### Scoring ve güvenilirlik

- Aynı response farklı değerlendiricilerce aynı gerekçeyle puanlanabilir mi?
- Kısmi puan için açık, gözlenebilir kanıt var mı?
- Serbest açıklamalarda eş anlamlı ve farklı ifade biçimleri nasıl ele alınacak?
- Missing, blank, contradictory veya copied response nasıl fail-closed olacak?
- Relation score, inference score'dan otomatik türetilmeden server tarafında saklanıyor mu?

## 9. Pilot tasarımı

Pilot, mevcut P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1 ile uyumlu ayrı ve silinebilir bir çalışma ortamında yapılmalıdır.

### Aşama 1 — bilişsel inceleme

- Hedef yaş/grade ve Türkçe profilini uzman doldurur.
- Öğrenciden think-aloud veya kısa görev sonrası açıklama alınabilir.
- Yanlış cevapların inference, span bulma, relation dili, metin yükü ve format kaynakları ayrılır.
- Bu aşama route assignment üretmez.

### Aşama 2 — kontrollü pilot

- Paralel passage/item setleri ve counterbalanced sıra kullanılır.
- Üç boyut için response, questionVersion, mappingVersion, rubricVersion ve scorer reason saklanır.
- Tamamlama, eksik cevap, invalid response, süre ve görev sırası ayrı alanlarda tutulur.
- Aynı participant için görevler arası öğrenme/repetition etkisi kaydedilir.
- Gerçek production tenant/student kayıtları kullanılmaz.

Örneklem büyüklüğü, tabakalama, kabul eşiği, classification stability ve seviye sınırları bu belgede belirlenmez. Bunlar ölçme uzmanı ve veri sorumlusu tarafından hedef yaş, dil ve kullanım amacıyla kararlaştırılmalıdır.

### Pilot analiz çıktıları

- Her boyut için response dağılımı ve madde güçlüğü.
- Inference ile evidence finding/relation arasındaki bağımlılık ve olası ipucu etkisi.
- Evidence seçimi ile relation reasoning'in ayrı ve birlikte puanları.
- Değerlendiriciler arası anlaşma ve adjudication oranı.
- Soru türü, metin uzunluğu, görev sırası ve yaş/grade etkisi.
- Boş/ambiguous/çelişkili yanıt oranı.
- Yanlış eşleştirme veya version drift durumlarının server fail-closed davranışı.
- Yeni item ve mapping sürümünde sonuçların yeniden üretilebilirliği.

## 10. Sürümleme ve geçmiş sonuçların korunması

V1 kayıtları immutable kalır. V2 için:

1. Yeni manifest, assessment, template/question version ve mapping identity oluşturulur.
2. V2 QuestionVersion metadata'sı tek primary construct role taşır; aynı item inference ve relation olarak çift sayılmaz.
3. V2 scorer, exact assessment/template/mapping/contract version eşleşmesi olmadan evidence üretmez.
4. V1 sonuçları V1 contract ile okunur; V2 scorer ile yeniden yorumlanmaz.
5. Geçmiş result veya student progress backfill edilmez.
6. V2 pilot sonuçları production assignment'a yazılmaz.
7. V2 calibration kararı ayrı decision ID ve protected release kaydıyla ilişkilendirilir.
8. V2 production'a açılmadan önce canonicalActive, calibrationStatus ve productionAssignmentEnabled kapıları ayrıca onaylanır.

Şema değişikliği gerekip gerekmediği uygulama tasarımında belirlenecektir. Bu tasarım aşamasında migration, seed, provisioning veya DB write yapılmaz.

## 11. Gelecekteki implementation test planı

Bu bölüm test sözleşmesidir; bu PR'da runtime implementation yapmaz.

### Mapping ve version

- V2 item yalnız tek primary C role üretir.
- V1 questionVersionId ile V2 mapping karıştırılamaz.
- Eksik veya yanlış mapping version REVIEW_REQUIRED üretir.
- Relation rubric version olmadan relation explanation score üretilemez.

### Scorer ayrımı

- Inference cevabı doğru/yanlış olsa da evidence finding sabit claim üzerinden bağımsız puanlanır.
- Evidence finding cevabı relation response olarak yeniden kullanılamaz.
- Relation evidenceCandidateId ve relationType ayrı doğrulanır.
- Aynı raw score iki dimension'a kopyalanamaz.
- Eksik, duplicate, unknown, contradictory ve incomplete response REVIEW_REQUIRED üretir.
- İstemci route alanı, Training, WPM veya tek aggregate score dikkate alınmaz.

### Regression

- V1 36 item identity, 9/9/9/9 dağılımı ve P0 22-step korunur.
- P1-A fallback, tek aktif P1, idempotency, tenant isolation ve teacher override audit korunur.
- canonicalActive=false iken V2 de öğrenci listesi/detail/session-start/onboarding akışına girmez.
- NOT_CALIBRATED, productionAssignmentEnabled=false, reviewRequired=true ve resultLevelId=null korunur.

## 12. Açık akademik kararlar

V2 uygulamasına geçmeden önce uzman ve veri sorumlusu şu soruları yanıtlamalıdır:

1. Relation türleri her passage için aynı mı, yoksa item bazında mı tanımlanacak?
2. Structured relation response, serbest açıklama yerine yeterli construct kapsamı sağlıyor mu?
3. Serbest açıklama kullanılacaksa rater training ve adjudication prosedürü nedir?
4. Evidence finding ile relation reasoning'in aynı passage'da tekrar etkisi nasıl kontrol edilecek?
5. Claim'in student response'a verilmesi inference ile relation arasındaki ayrımı yeterince kuruyor mu?
6. Çeldiriciler relation hatalarını gerçekten temsil ediyor mu?
7. Hangi response'lar evidence yok, review required veya kısmi olarak saklanacak?
8. Her dimension için gerekli item coverage ve stability kararı nedir?
9. Hangi yaş/grade/dil profilleri için ayrı inceleme gerekir?
10. Calibration kararının hangi yeni version seti için geçerli olduğu nasıl sınırlandırılacak?

Bu sorular cevaplanmadan P1-C otomatik ataması açılmaz. Mevcut güvenlik durumu korunur: canonicalActive=false, calibrationStatus=NOT_CALIBRATED, productionAssignmentEnabled=false, reviewRequired=true ve resultLevelId=null.
