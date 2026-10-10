# OkuPratik — P1-C V2 Uzman İnceleme Formu

**Durum:** `DESIGN_ONLY`; uzman tarafından doldurulacak form
**İlgili aday havuz:** `P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN`
**İlgili tasarım:** `P1C_EVIDENCE_RELATION_DESIGN_V2`
**V1 sınırı:** V1 item bankası, mapping'i, published version'ları ve geçmiş sonuçları bu form ile değiştirilmez.

Bu form aday görevlerin construct uyumunu ve pilot öncesi risklerini incelemek içindir. Uzman adı, imzası, kararı veya onayı bu belgede doldurulmuş değildir. Formun doldurulması kalibrasyon, production readiness veya route assignment onayı anlamına gelmez.

## 1. İnceleme kimliği

| Alan                             | Doldurulacak değer                              |
| -------------------------------- | ----------------------------------------------- |
| İnceleme paketi sürümü           | `P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN` |
| Item pool sürümü                 | `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN` |
| Mapping sürümü                   | `P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN`          |
| Rubric sürümü                    | `P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN`        |
| Uzman/inceleyici kodu            |                                                 |
| İnceleme tarihi                  |                                                 |
| Hedef yaş/grade                  |                                                 |
| Türkçe dil profili               |                                                 |
| İncelenen görev aralığı          |                                                 |
| Bağımsız inceleme tamamlandı mı? |                                                 |

Uzmanlar mümkünse birbirlerinin kararlarını görmeden item-level karar verir. Ad, iletişim bilgisi, öğrenci bilgisi veya production tenant verisi bu formda tutulmaz.

## 2. Karar sözlüğü

| Alan              | İzin verilen değerler                                    | Anlamı                                                      |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Construct kararı  | `KEEP`, `REVISE`, `REJECT`, `PENDING_DATA`               | Görevin hedef construct'ı ölçmeye aday olup olmadığı        |
| Answer key kararı | `UNAMBIGUOUS`, `AMBIGUOUS`, `INCORRECT`, `PENDING`       | Beklenen cevabın tek ve metinle savunulabilir olup olmadığı |
| Dil/yaş kararı    | `SUITABLE`, `REVISE_LANGUAGE`, `AGE_RISK`, `PENDING`     | Metin/yönergenin hedef profile uygunluğu                    |
| Scoring kararı    | `APPLICABLE`, `REVISE_RUBRIC`, `NOT_SCORABLE`, `PENDING` | Rubriğin gözlenebilir ve uygulanabilirliği                  |
| Genel item kararı | `ACCEPT_FOR_PILOT`, `REVISE`, `REJECT`, `HOLD`           | Pilot öncesi taslak kararı; release değildir                |

`ACCEPT_FOR_PILOT` seçimi, akademik doğrulama veya otomatik route açılması değildir. Eksik kanıt, version uyuşmazlığı, çelişkili cevap veya belirsiz span varsa item `HOLD`/`PENDING_DATA` kalır.

## 3. Item-level form

Her `V2C-INF-*`, `V2C-EVF-*` ve `V2C-REL-*` görevi için ayrı kopyalanır.

### 3.1 Kimlik ve bütünlük

| Kontrol                                          | Uzman notu/kararı                                      |
| ------------------------------------------------ | ------------------------------------------------------ |
| Stable design ID                                 |                                                        |
| Passage ID ve version                            |                                                        |
| Primary construct                                | `INFERENCE` / `EVIDENCE_FINDING` / `EVIDENCE_RELATION` |
| Question version ID                              | Tasarımda henüz yok; uygulama aşamasında doldurulacak  |
| Mapping version                                  |                                                        |
| Span/candidate ID'leri passage ile eşleşiyor mu? | `YES` / `NO` / `PENDING`                               |
| Birden fazla primary construct etiketi var mı?   | `NO` / `YES — açıklama`                                |
| Version drift veya eksik kimlik var mı?          |                                                        |

### 3.2 Construct uyumu ve bağımsızlık

| Soru                                                                               | Karar/not                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Görev yalnızca ilan edilen primary construct'ı mı gözlüyor?                        |                                               |
| Cevabı bulmak için hedef dışı ön bilgi gerekiyor mu?                               |                                               |
| Görev türü, hedef beceri yerine okuma belleğini veya format becerisini mi ölçüyor? |                                               |
| Aynı öğrencinin başka görevdeki cevabı bu görevi ele veriyor mu?                   |                                               |
| Aynı passage tekrarının sıra/alışma etkisi var mı?                                 |                                               |
| `INFERENCE` doğru evidence span'ini seçenek olarak ifşa ediyor mu?                 |                                               |
| `EVIDENCE_FINDING` claim'i bağımsız ve sabit mi?                                   |                                               |
| `EVIDENCE_RELATION` selection ve relation yanıtlarını ayrı gözlüyor mu?            |                                               |
| Construct kararı                                                                   | `KEEP` / `REVISE` / `REJECT` / `PENDING_DATA` |
| Gerekçe                                                                            |                                               |

### 3.3 Metin, kanıt ve cevap anahtarı

| Soru                                                                        | Karar/not                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Passage doğal ve özgün Türkçe mi?                                           |                                                       |
| İstenen sonuç/claim metinden gerçekten destekleniyor mu?                    |                                                       |
| Doğru span veya candidate ID passage'da tam olarak bulunuyor mu?            |                                                       |
| Doğru cevap tek anlamlı mı?                                                 |                                                       |
| Başka bir seçenek makul biçimde savunulabilir mi?                           |                                                       |
| Claim ile kanıtın kapsam, zaman ve nedensellik sınırları uyumlu mu?         |                                                       |
| Evidence, observation/hypothesis/correlation/causality ayrımını koruyor mu? |                                                       |
| Answer key kararı                                                           | `UNAMBIGUOUS` / `AMBIGUOUS` / `INCORRECT` / `PENDING` |
| Düzeltilmesi gereken span/claim/anahtar                                     |                                                       |
| Gerekçe                                                                     |                                                       |

### 3.4 Çeldirici ve hata türleri

Her çeldirici için bir satır doldurulur.

| Option/candidate ID | Makul mü?    | Temsil ettiği hata                                                                            | İpucu etkisi              | Not |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------- | ------------------------- | --- |
|                     | `YES` / `NO` | `OVERGENERALIZATION` / `TOPIC_MATCH` / `CAUSALITY` / `TIME_SCOPE` / `CONTRADICTION` / `OTHER` | `LOW` / `MEDIUM` / `HIGH` |     |
|                     |              |                                                                                               |                           |     |
|                     |              |                                                                                               |                           |     |
|                     |              |                                                                                               |                           |     |

Uzman şu ayrımı özellikle kaydeder: konuya değinen ama claim'i desteklemeyen kanıt, yanlış relation türü; metin dışı ön bilgi; korelasyonun nedensellik sanılması; önerinin gerçekleşmiş sonuç sanılması.

### 3.5 Relation görevleri için özel iki-alan incelemesi

Yalnız `V2C-REL-*` görevleri için:

| Alan                                                                       | Beklenen response | Uzman kararı/not |
| -------------------------------------------------------------------------- | ----------------- | ---------------- |
| `evidenceCandidateId`                                                      |                   |                  |
| `relationType`                                                             |                   |                  |
| Selection doğru olsa relation yine de yanlış olabilir mi?                  |                   |                  |
| Relation seçimi evidence seçimini ipucu olarak veriyor mu?                 |                   |                  |
| Kabul edilen relation türleri item metadata'sında sınırlı ve versioned mı? |                   |                  |
| `LIMITED_SUPPORT` ile `CAUSAL_SUPPORT` ayrımı açık mı?                     |                   |                  |
| İlgili ama desteklemeyen candidate yeterince makul mü?                     |                   |                  |
| İki alanın birlikte puanlanması için gözlenebilir kural var mı?            |                   |                  |

Evidence selection ve relation reasoning ayrı alanlarda saklanmalıdır. Pilot öncesinde bunlar tek toplam puana indirgenmez.

### 3.6 Türkçe, yaş ve ön bilgi

| Kontrol                                                                 | Karar/not                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Hedef yaş/grade için yönerge açık mı?                                   |                                                         |
| Sözcüklerin anlamı passage veya yönergede yeterince kurulmuş mu?        |                                                         |
| Yerel/kültürel ön bilgi cevabı etkiliyor mu?                            |                                                         |
| Özel alan bilgisi gerekmeden cevaplanabiliyor mu?                       |                                                         |
| Metin uzunluğu ve kelime güçlüğü hedef construct dışı yük yaratıyor mu? |                                                         |
| Dil veya yaş kararı                                                     | `SUITABLE` / `REVISE_LANGUAGE` / `AGE_RISK` / `PENDING` |
| Önerilen sadeleştirme                                                   |                                                         |

### 3.7 Puanlama ve REVIEW_REQUIRED güvenliği

| Soru                                                                                    | Karar/not                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Beklenen cevap server-side immutable metadata ile doğrulanabilir mi?                    |                                                             |
| Partial credit gözlenebilir bir kural mı?                                               |                                                             |
| Partial credit, route threshold gibi yorumlanmıyor mu?                                  |                                                             |
| Blank, duplicate, unknown veya contradictory response nasıl sınıflanır?                 | `REVIEW_REQUIRED` / gerekçe                                 |
| `evidenceCandidateId` doğru, `relationType` yanlış olduğunda iki sonuç ayrı kalıyor mu? |                                                             |
| Client route/score/WPM/Training verisi scorer'a girmiyor mu?                            |                                                             |
| Rubric kararı                                                                           | `APPLICABLE` / `REVISE_RUBRIC` / `NOT_SCORABLE` / `PENDING` |
| Gerekli rubric değişikliği                                                              |                                                             |

## 4. Dimension-level form

Her boyut için uzmanlar ayrı form doldurur; dimension kararları item-level kararların yerine geçmez.

### 4.1 INFERENCE

| İnceleme sorusu                                                    | Karar/not                                     |
| ------------------------------------------------------------------ | --------------------------------------------- |
| Sonuç metinden destekleniyor ama aynen kopyalanmıyor mu?           |                                               |
| Seçenekler doğru evidence span'ini ifşa etmiyor mu?                |                                               |
| Doğru cevap kapsamı aşmıyor mu?                                    |                                               |
| Nedensellik, zaman veya karşılaştırma gereksiz yere eklenmiyor mu? |                                               |
| Ön bilgi ve seçenek eleme yükü kontrol edildi mi?                  |                                               |
| Genel dimension kararı                                             | `KEEP` / `REVISE` / `REJECT` / `PENDING_DATA` |
| Gerekçe                                                            |                                               |

### 4.2 EVIDENCE_FINDING

| İnceleme sorusu                                                        | Karar/not                                     |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| Claim öğrenciye sabit ve bağımsız veriliyor mu?                        |                                               |
| Doğru span claim'i doğrudan destekliyor mu?                            |                                               |
| Konu benzerliği olan ama yetersiz span mevcut mu?                      |                                               |
| Span uzunluğu, paragraf konumu veya anahtar kelime ipucu yaratıyor mu? |                                               |
| Inference cevabı bu göreve taşınmıyor mu?                              |                                               |
| Genel dimension kararı                                                 | `KEEP` / `REVISE` / `REJECT` / `PENDING_DATA` |
| Gerekçe                                                                |                                               |

### 4.3 EVIDENCE_RELATION

| İnceleme sorusu                                                                      | Karar/not                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------- |
| Claim sabit ve açık mı?                                                              |                                               |
| Candidate'ler gözlem, öneri, alternatif açıklama ve çelişkiyi ayırıyor mu?           |                                               |
| `evidenceCandidateId` ve `relationType` gerçekten ayrı yanıt gerektiriyor mu?        |                                               |
| Doğru candidate seçimi relation puanını otomatik üretmiyor mu?                       |                                               |
| Korelasyon/nedensellik, hypothesis/observation ve kapsam sınırları test ediliyor mu? |                                               |
| Serbest açıklama varsa insan rater rubriği uygulanabilir mi?                         |                                               |
| Genel dimension kararı                                                               | `KEEP` / `REVISE` / `REJECT` / `PENDING_DATA` |
| Gerekçe                                                                              |                                               |

## 5. Dimension coverage ve kalibrasyon hazırlığı

| Dimension           | Aday görevler     | Gerçek coverage yeterli mi? | Eksik veri / uzman notu |
| ------------------- | ----------------- | --------------------------- | ----------------------- |
| `INFERENCE`         | `V2C-INF-01`–`04` |                             |                         |
| `EVIDENCE_FINDING`  | `V2C-EVF-01`–`04` |                             |                         |
| `EVIDENCE_RELATION` | `V2C-REL-01`–`04` |                             |                         |

Bu tablo route açma kararı değildir. Örneklem, nihai madde sayısı, kabul eşiği, classification stability ve seviye sınırı boş bırakılır.

## 6. Bağımsız rater ve anlaşmazlık kaydı

İki veya daha fazla değerlendirici item'ları birbirinin kararını görmeden inceler. İlk kararlar değiştirilmeden aşağıdaki kayıt açılır.

| Alan                                      | Değer                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Item ID                                   |                                                                           |
| Dimension                                 |                                                                           |
| Rater A kararı                            |                                                                           |
| Rater B kararı                            |                                                                           |
| Farkın türü                               | `CONSTRUCT` / `ANSWER_KEY` / `SPAN` / `RELATION` / `LANGUAGE` / `SCORING` |
| Her rater'ın gerekçesi                    |                                                                           |
| Adjudication gerektirdi mi?               | `YES` / `NO`                                                              |
| Adjudication kararı                       |                                                                           |
| Adjudication gerekçesi                    |                                                                           |
| Nihai tasarım revizyonu                   |                                                                           |
| Revizyon sonrası yeni version gerekli mi? |                                                                           |

Anlaşmazlık çözümü, önceki bireysel puanları silerek değil, ayrı bir adjudication kaydıyla yapılır. Uzmanlar arası anlaşma ve uygun analiz yöntemi veri sorumlusu tarafından belirlenir; bu doküman sayısal eşik koymaz.

## 7. Pilot ve akademik güvenlik soruları

1. Pilot görevi, gerçek production öğrenci veya tenant verisiyle karıştırılmadan ayrı ve silinebilir bir ortamda mı yürütülecek?
2. Anonim participant ID, item/version ID, response, scorer reason, task order ve missing/invalid durumları saklanacak mı?
3. Aynı passage görevleri arasında carry-over ve tekrar okuma etkisi nasıl izlenecek?
4. Serbest relation açıklamalarında insan rater rubriği ve körleme nasıl uygulanacak?
5. Üretken yapay zekâ yalnızca yardımcı düzenleme için mi kullanılacak; nihai puan/routing kararı insan ve onaylı prosedürde mi kalacak?
6. Nihai calibration kararı verilmeden önce hangi veri ve uzman onayı eksik?

## 8. İmzalı sonuç alanları

| Alan                            | Doldurulacak değer                       |
| ------------------------------- | ---------------------------------------- |
| Uzman 1 kararı                  |                                          |
| Uzman 1 tarih/sürüm             |                                          |
| Uzman 2 kararı                  |                                          |
| Uzman 2 tarih/sürüm             |                                          |
| Anlaşmazlık çözümü              |                                          |
| Veri sorumlusu kararı           |                                          |
| Product/engineering gate kararı |                                          |
| Calibration decision ID         |                                          |
| Production assignment kararı    | **Boş bırakılacak; bu tasarımda kapalı** |

## 9. Değişmez güvenlik durumu

Bu form doldurulsa bile aşağıdaki kapılar ayrıca ve sürümlü bir release kararı olmadan değişmez:

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B ve P1-D otomatik atamaya kapalı
- P1-C otomatik atamaya kapalı
- V1 sonuçları, P0 22 adım, P1-A fallback, tenant isolation, tek aktif P1 ve teacher override audit korunur
