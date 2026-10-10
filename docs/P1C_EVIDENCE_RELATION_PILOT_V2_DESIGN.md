# OkuPratik — P1-C V2 Pilot Uygulama Taslağı

**Durum:** `DESIGN_ONLY`; uzman ve veri sorumlusu doldurur
**İlgili item pool:** `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN`
**İlgili protokol:** `P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1`
**Production assignment:** Kapalı

Bu taslak, `INFERENCE`, `EVIDENCE_FINDING` ve `EVIDENCE_RELATION` görevlerinin bağımsızlığını ve puanlanabilirliğini incelemek içindir. Pilot için örneklem sayısı, nihai madde sayısı, kabul eşiği, yaş/grade aralığı veya seviye sınırı uydurulmaz; bunlar ölçme uzmanı ve veri sorumlusu tarafından belirlenir.

## 1. Güvenli çalışma alanı

- Pilot verisi production tenant/student kayıtlarından ayrı, erişimi sınırlı ve silinebilir bir ortamda tutulur.
- Production DB'ye migration, seed, provisioning veya manuel write yapılmaz.
- Participant kimliği yerine rastgele/anonsuz `pilotParticipantId` kullanılır.
- Kişisel veri, gizli anahtar, DB bağlantısı veya kullanıcıya ait doğrudan tanımlayıcılar dokümana/artifact'e yazılmaz.
- V2 aday kimlikleri production item bankasına otomatik import edilmez.
- Pilot sonucu production assessment sonucu, student progress veya route assignment olarak yazılmaz.

## 2. Ön kayıt ve version manifesti

Her pilot oturumu başlamadan önce şu sürümler birlikte kaydedilir:

| Alan                         | Değer                                    |
| ---------------------------- | ---------------------------------------- |
| `itemPoolManifestVersion`    |                                          |
| `assessmentVersion`          |                                          |
| `templateVersionId`          |                                          |
| `questionVersionId`          |                                          |
| `passageVersionId`           |                                          |
| `mappingVersion`             | `P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN`   |
| `measurementContractVersion` | `P1_ADAPTIVE_MEASUREMENT_V2_C_DESIGN`    |
| `rubricVersion`              | `P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN` |
| `pilotProtocolVersion`       |                                          |
| `calibrationDecisionId`      | Boş; pilot tamamlanmadan üretilemez      |

Eksik veya eşleşmeyen version manifesti `REVIEW_REQUIRED` olarak işaretlenir; sonuç route classifier'a gönderilmez.

## 3. Aşama 1 — bilişsel ve uzman incelemesi

1. Uzmanlar her item'ı bağımsız inceler.
2. `INFERENCE` için sonucu belirleme ile evidence span'ini bulma ayrılır.
3. `EVIDENCE_FINDING` için claim sabit tutulur; önceki inference yanıtı kullanılmaz.
4. `EVIDENCE_RELATION` için `evidenceCandidateId` ve `relationType` ayrı değerlendirilir.
5. Her adayda metin uzunluğu, kelime güçlüğü, yönerge yükü, ön bilgi, seçenek ipucu ve format etkisi kaydedilir.
6. Think-aloud veya görev sonrası kısa açıklama kullanılabilir; açıklama puanı production route kanıtı sayılmaz.
7. `REVISE`, `REJECT` veya `PENDING_DATA` kararı alan görevler pilot setine alınmadan ayrı version gerektirir.

## 4. Aşama 2 — kontrollü pilot tasarımı

Uzman aşağıdaki alanları doldurmadan pilot başlatılmaz:

| Alan                                   | Uzman/veri sorumlusu kararı |
| -------------------------------------- | --------------------------- |
| Hedef yaş/grade                        |                             |
| Türkçe dil profili                     |                             |
| Katılımcı dahil etme/dışlama ölçütleri |                             |
| Planlanan katılımcı ve tabakalama      |                             |
| Etik/veli/onam süreci                  |                             |
| Gözetim ve uygulama ortamı             |                             |
| Görev sırası planı                     |                             |
| Paralel passage/item setleri           |                             |
| Rater sayısı ve körleme                |                             |
| Veri saklama/silme süresi              |                             |
| Analiz planı ve sorumlu                |                             |

### Sıra ve tekrar kontrolü

- Aynı passage üzerinde üç görev kullanılacaksa görev sırası counterbalance edilir.
- Mümkünse her construct için paralel passage setleri kullanılır.
- Passage'ın tekrar okunması, görev sırası, önceki cevapların hatırlanması ve yorgunluk ayrı olay alanlarıyla kaydedilir.
- Görevler arası cevap carry-over yasaktır.
- Görev süresi yalnız yardımcı bağlamdır; WPM, tıklama süresi veya Training verisi akademik evidence değildir.

## 5. Toplanacak kayıtlar

Her görev yanıtı için yalnız gerekli, güvenli metadata tutulur:

| Alan                                     | Kural                                                            |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `pilotParticipantId`                     | Anonim; gerçek öğrenci/tenant ID'si kullanılmaz                  |
| `taskDesignId`                           | `V2C-INF-*`, `V2C-EVF-*` veya `V2C-REL-*`                        |
| `questionVersionId` / `passageVersionId` | Immutable version kimlikleri                                     |
| `primaryConstruct`                       | Tek construct                                                    |
| `response`                               | Yapılandırılmış cevap; relation'da iki alan ayrı                 |
| `answerCompleteness`                     | `COMPLETE`, `BLANK`, `PARTIAL`, `INVALID`                        |
| `serverScore`                            | Gerçek scorer çıktısı; istemci skoru kabul edilmez               |
| `scoringReason`                          | Gözlenebilir reason code                                         |
| `evidenceSpanId`/`evidenceCandidateId`   | Canonical item metadata ile doğrulanır                           |
| `relationType`                           | Item'ın versioned izinli sözlüğünden                             |
| `mappingVersion` / `rubricVersion`       | Her sonuçla saklanır                                             |
| `taskOrder`                              | Sıra etkisi için                                                 |
| `elapsedTimeMs`                          | Yalnız bağlam; tek başına evidence değil                         |
| `raterCode` / `raterScore`               | İnsan değerlendirmesinde anonim kod                              |
| `adjudicationId`                         | Anlaşmazlık varsa ayrı kayıt                                     |
| `routeDecision`                          | Pilot dışında yazılmaz; burada yalnız `REVIEW_REQUIRED` olabilir |

İstemciden gelen route family, route need, aggregate score veya dimension alanları yok sayılır.

## 6. Relation puanlama ve rater prosedürü

Evidence seçimi ve relation reasoning iki ayrı kayıt ve analiz değişkenidir. İlk taslakta her ikisi de 0–1 çalışma puanı olarak tutulabilir; bu puanlar route eşiği değildir ve toplam puana otomatik çevrilmez.

Serbest açıklama kullanılırsa:

1. Rater'lar item version ve rubric version'ı görür; route kararını görmez.
2. Anchor yanıtlar pilot başlamadan uzmanlarca hazırlanır.
3. Rater'lar bağımsız puanlar; ilk puanlar silinmez.
4. Anlaşmazlık ayrı adjudication kaydına alınır.
5. Anlaşma yöntemi, kabul ölçütü ve sınıflandırma kararı veri sorumlusunun planında belirlenir.
6. Üretken yapay zekâ nihai akademik puan, rater kararı veya calibration gate olarak kullanılmaz.

## 7. Analiz başlıkları

Ölçme ekibi aşağıdaki başlıkları analiz eder; sayısal eşikler bu taslakta yoktur:

- item-level cevap ve çeldirici desenleri;
- blank/invalid/ambiguous/contradictory oranları;
- passage uzunluğu, kelime yükü, görev türü ve sıra etkisi;
- inference, evidence finding ve relation sonuçları arasındaki carry-over/cueing;
- evidence seçimi ile relation reasoning'in ayrı dağılımları;
- rater'lar arası anlaşma ve adjudication oranı;
- relation türlerinin gözlenebilirliği ve alternatif yorumlar;
- mapping/version drift ve scorer reproducibility;
- yaş, grade, Türkçe dil profili ve ön bilgi kaynaklı olası bias;
- hangi boyutun yetersiz kanıt nedeniyle `REVIEW_REQUIRED` kaldığı.

## 8. Kalibrasyon ve release kapısı

Aşağıdaki koşullardan biri varsa otomatik route assignment açılamaz:

- gerekli boyutlardan biri eksik, yalnız dolaylı veya çelişkili kanıta dayanıyorsa;
- item/mapping/contract/rubric version'larından biri eşleşmiyorsa;
- cevap blank, invalid veya ambiguous ise;
- rater anlaşması ve uzman gerekçesi tamamlanmamışsa;
- kalibrasyon kararı `NOT_READY`, `PILOT_REQUIRED`, `CALIBRATION_REVIEW` veya boş ise;
- `canonicalActive=false`, `calibrationStatus=NOT_CALIBRATED` veya `productionAssignmentEnabled=false` ise.

Release için ayrı ve protected bir karar kaydında şu alanlar birlikte bulunmalıdır: item bank manifesti, assessment/template/question version'ları, mapping, measurement/scoring contract, rubric, pilot raporu, uzman kararı ve calibration decision ID. Bu taslak hiçbirini üretmez.

## 9. Değişmez güvenlik bayrakları

Pilot veya uzman incelemesi tamamlanmış gibi raporlanmaz. Bu dokümanın varlığı şu durumu değiştirmez:

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B ve P1-D kapalı
- P1-C otomatik ataması kapalı
- P0, P1-A, tenant isolation, tek aktif P1, idempotency ve teacher override audit korunuyor
