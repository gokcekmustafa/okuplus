# OkuPratik — P1-C V2.1 Pilot Uygulama Taslağı

**Belge sürümü:** `P1C_EVIDENCE_RELATION_PILOT_V2_1_DESIGN`  
**Durum:** `DESIGN_ONLY` — pilot öncesi plan  
**Kaynak commit:** `f1c8ab90ceec29a4cc129b406d4ab961d6548e31`  
**Aday görevler:** 12 P1-C V2 görevi  
**Production assignment:** Kapalı

> Bu belge, iki öğrenci grubunun P1-C V2 aday maddelerine verdiği yanıtları ve ölçüm kalitesini incelemek için taslaktır. Örneklem büyüklüğü, sınıf aralığı, kabul eşiği ve kalibrasyon kararı uydurulmaz.

## 1. Pilot amacı ve analiz grupları

Pilot iki çalışma grubunu karşılaştırmayı planlar:

1. `GENERAL_STUDENT_POPULATION` — genel öğrenci kitlesi
2. `STUDENTS_NEEDING_READING_DEVELOPMENT` — okuma becerisini geliştirmeye ihtiyaç duyan öğrenciler

Bu adlandırmalar çalışma kodudur; öğrenciyi damgalayan kullanıcı etiketleri değildir. Grup üyeliği pilot başlamadan önce uzman, veri sorumlusu ve gerekli etik/onam süreci tarafından onaylanmış bağımsız ölçütlerle belirlenir.

### 1.1 Grup üyeliği güvenlik kuralları

- P1-C V2 aday sorularına verilen yanıtlar grup üyeliği kriteri değildir.
- WPM, Antrenman verisi, istemci puanı, route alanı veya tek toplam puan grup tanımında kullanılamaz.
- Grup ölçütleri pilot öncesinde kaydedilir; pilot yanıtlarına bakılarak sonradan değiştirilemez.
- Grup ölçütlerinin kaynağı, onay sahibi, dışlama kuralları ve anonim grup kodları ayrı tutulur.
- Grupların birbirini dışlayıp dışlamadığı veya kesişebileceği önceden belgelenmelidir.
- Yaş/sınıf ve grup etkisini karıştırmamak için sınıf/yaş tabakalama yaklaşımı uzman tarafından belirlenir.

| Alan                         | Değer                                       |
| ---------------------------- | ------------------------------------------- |
| Grup 1 bağımsız ölçütleri    | **DOLDURULMADI**                            |
| Grup 2 bağımsız ölçütleri    | **DOLDURULMADI**                            |
| Ölçüt kaynağı ve onay sahibi | **DOLDURULMADI**                            |
| Gruplar kesişir mi?          | **DOLDURULMADI**                            |
| Anonim grup kodları          | **DOLDURULMADI**                            |
| Hedef yaş/sınıf aralığı      | **DOLDURULMADI — uzman önerisi bekleniyor** |

## 2. Pilot ön koşulları

Pilot başlamadan önce aşağıdakiler ayrı karar kaydıyla tamamlanmalıdır:

- dış uzman incelemesi ve madde kararları;
- hedef yaş/sınıf önerisi, gerekçesi ve belirsizlikleri;
- iki grubun bağımsız dahil etme/dışlama ölçütleri;
- etik kurul/kurum/veli/onam gereksinimi ve geri çekilme yolu;
- anonim participant ID ve erişim rolleri;
- güvenli aktarım, saklama, yedek kapsamı ve doğrulanabilir silme yöntemi;
- production DB'den ayrı, silinebilir ve erişimi sınırlı pilot ortamı;
- görev sırası, counterbalance ve rater körleme planı.

Bu koşullar tamamlanmadan gerçek katılımcı verisi toplanmaz.

## 3. Version manifesti

Her oturumda kullanılan içerik immutable manifest ile kaydedilir:

| Alan                              | Değer                                         |
| --------------------------------- | --------------------------------------------- |
| `itemPoolManifestVersion`         | **DOLDURULMADI**                              |
| `assessmentVersion`               | **DOLDURULMADI**                              |
| `templateVersionId`               | **DOLDURULMADI**                              |
| `questionVersionId`               | **DOLDURULMADI**                              |
| `passageVersionId`                | **DOLDURULMADI**                              |
| `mappingVersion`                  | `P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN`        |
| `measurementContractVersion`      | `P1_ADAPTIVE_MEASUREMENT_V2_C_DESIGN`         |
| `rubricVersion`                   | `P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN`      |
| `pilotProtocolVersion`            | `P1C_EVIDENCE_RELATION_PILOT_V2_1_DESIGN`     |
| `targetPopulationDecisionVersion` | `P1C_V2_TARGET_POPULATION_DECISION_V1_DESIGN` |
| `calibrationDecisionId`           | Boş; pilot tamamlanmadan üretilemez           |

Eksik veya eşleşmeyen manifest `REVIEW_REQUIRED` olarak işaretlenir ve route classifier'a gönderilmez.

## 4. Pilot uygulama tasarımı

### 4.1 Bağımsız görev akışı

- `INFERENCE`: sonucu belirleme; cevap kanıtı görevi ele vermemeli.
- `EVIDENCE_FINDING`: claim sabit; doğru kanıt cümlesini bulma.
- `EVIDENCE_RELATION`: `evidenceCandidateId` ve `relationType` ayrı değerlendirme.

Görevler arası cevap carry-over yasaktır. Aynı passage üzerindeki görev sırası, tekrar okuma, yorgunluk ve önceki cevabı hatırlama olayları kaydedilir. Mümkünse parallel passage/item setleri kullanılır.

### 4.2 Güvenli kayıtlar

| Alan                                     | Kural                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| `pilotParticipantId`                     | Anonim; gerçek öğrenci/tenant ID kullanılmaz             |
| `analysisGroupCode`                      | Önceden belirlenmiş anonim grup kodu                     |
| `ageGradeStratum`                        | Uzman planına göre; hedef aralık uydurulmaz              |
| `taskDesignId`                           | `V2C-INF-*`, `V2C-EVF-*` veya `V2C-REL-*`                |
| `questionVersionId` / `passageVersionId` | Immutable version kimlikleri                             |
| `response`                               | Yapılandırılmış cevap; relation alanları ayrı            |
| `answerCompleteness`                     | `COMPLETE`, `BLANK`, `PARTIAL`, `INVALID`                |
| `serverScore`                            | Gerçek scorer çıktısı; istemci skoru kabul edilmez       |
| `scoringReason`                          | Gözlenebilir reason code                                 |
| `evidenceCandidateId` / `relationType`   | Versioned item metadata ile doğrulanır                   |
| `mappingVersion` / `rubricVersion`       | Her sonuçla saklanır                                     |
| `taskOrder`                              | Sıra etkisi için                                         |
| `raterCode` / `raterScore`               | İnsan değerlendirmesinde anonim kod                      |
| `adjudicationId`                         | Anlaşmazlık varsa ayrı kayıt                             |
| `routeDecision`                          | Pilot dışına yazılmaz; yalnız `REVIEW_REQUIRED` olabilir |

## 5. Pilot analiz planı

İki analiz grubunda, mümkün olan yaş/sınıf tabakaları içinde aşağıdaki başlıklar incelenir:

- madde bazında yanıt ve çeldirici dağılımları;
- eksik, geçersiz, belirsiz ve `REVIEW_REQUIRED` sonuçları;
- `INFERENCE`, `EVIDENCE_FINDING` ve `EVIDENCE_RELATION` boyutlarının bağımsızlığı;
- evidence seçimi ile relation puanının ayrı dağılımları;
- metin, cümle, kelime, yönerge ve ön bilgi yükü;
- görev sırası, cevap ipucu, carry-over ve tekrar etkisi;
- insan rater'lar arası anlaşma ve adjudication;
- mapping/version drift ve scorer tekrar üretilebilirliği;
- dil, yaş/sınıf, ön bilgi veya analiz grubu kaynaklı olası adaletsizlikler.

Gözlenen grup farkları otomatik olarak beceri açığı, tanı veya nedensel etki şeklinde yorumlanmaz. Analiz yöntemi, örneklem büyüklüğü, kabul eşiği ve istatistiksel karar kuralı uzman/veri sorumlusu tarafından gerekçelendirilmek üzere açık bırakılır.

### 5.1 Yaş/sınıf ve grup ayrımı

Yaş/sınıf ile grup etkini ayırmak için uzman aşağıdakilerden uygun olanı gerekçelendirir:

- sınıf/yaş bantlarına göre tabakalı tasarım;
- her tabakada iki grubun karşılaştırılması;
- eksik hücrelerin ve dengesiz örneklemin ayrı raporlanması;
- ön bilgi ve dil profilinin ayrı açıklayıcı alanlarda tutulması;
- bir bulgunun genellenemeyeceği durumların açıkça yazılması.

## 6. Rater ve relation değerlendirmesi

Evidence seçimi ile relation reasoning ayrı kayıt ve analiz değişkenidir. Rater'lar item ve rubric version'ını görür, route kararını görmez. İlk puanlar silinmez; anlaşmazlık ayrı adjudication kaydıdır.

`LIMITED_SUPPORT` maddeleri (`V2C-REL-01`–`04`) sırf dağılım eşitliği için başka etikete çevrilmez. `DIRECT_SUPPORT`, `COMPARISON` veya `CAUSAL_SUPPORT` iddiası açık metinsel koşul olmadan üretilemez.

Üretken yapay zekâ nihai akademik puan, rater kararı veya calibration gate olarak kullanılamaz.

## 7. Etik, veri saklama ve silme

- Katılımcı/veli onamı ve geri çekilme yolu pilot öncesi onaylanır.
- Kişisel veri ile pilot cevapları ayrılır; erişim en az ayrıcalıkla sınırlandırılır.
- Ham cevap, rater notu ve anonim eşleştirme anahtarı için saklama süresi belirlenir.
- Süre sonunda ham cevaplar, anahtarlar ve gereksiz kopyalar doğrulanabilir biçimde silinir.
- Production DB, production tenant veya gerçek öğrenci kimlikleri kullanılmaz.
- Sır, bağlantı bilgisi ve hassas öğrenci verisi log/artifact'e yazılmaz.

## 8. Ayrı karar kapıları

### Kapı 1 — Uzman incelemesi

12 aday görev, hedef kitle soruları, bağımsız rater kayıtları ve anlaşmazlık çözümü tamamlanmalıdır.

**Durum:** `NOT_COMPLETED`

### Kapı 2 — Pilot

Grup ölçütleri, etik/onam, veri güvenliği, yaş/sınıf tabakalama, görev sırası ve pilot ortamı onaylanmalıdır.

**Durum:** `NOT_COMPLETED`

### Kapı 3 — Kalibrasyon ve release

Pilot analizi, uzman/veri sorumlusu kararı, version manifesti ve protected release onayı olmadan route assignment açılamaz.

**Durum:** `NOT_CALIBRATED`

## 9. Değişmez güvenlik durumu

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B, P1-C ve P1-D otomatik atamaları kapalı
- P0 22 step, P1-A fallback, tenant isolation, tek aktif P1 ve teacher override audit korunur

Bu doküman yalnız tasarım ve doküman bütünlüğü içindir; akademik geçerlilik, pilot tamamlanması veya kalibrasyon kanıtlamaz.
