# OkuPratik — Placement Production Açılış Koşulları v1

**Sonuç:** Açılış için hazır değil. Bu belge tamamlanmamış kapıları görünür kılar; hiçbir kapıyı kendiliğinden açmaz.

## 1. Teknik güvenlik kapıları

Aşağıdaki koşullar aynı sürüm seti için doğrulanmadan placement öğrenciye açılmaz:

- canonical manifest identity ve version exact match;
- item bank, assessment, template, template version, content version ve question version graph bütünlüğü;
- 36 stable question ID'nin tamamı ve 9/9/9/9 tür dağılımı;
- answer key, evidence span, option/pair/fill-blank bağlantıları;
- server-side scoring ve trusted mapping;
- tamamlanmamış, eksik, invalid, ambiguous veya conflict sonuçlarda fail-closed davranış;
- tenant isolation;
- P0 22-step ve P0 progress regression;
- P1-A fallback, tek aktif P1 ve idempotent assignment;
- teacher override yetki ve audit izi;
- backup/rollback ve protected release kanıtı.

## 2. Akademik ve kalibrasyon kapıları

- 36 item için uzman inceleme formu tamamlanmış olmalı.
- Her answer key ve evidence span için metin desteği ile tek-anlamlılık kararı olmalı.
- Çeldiriciler, matching all-or-nothing burden, fill-blank alternate answers ve TF wording incelenmiş olmalı.
- difficultyLabel değerleri pilot verisiyle desteklenmeli; mevcut label'lar otomatik olarak empirik seviye sayılmamalı.
- C INFERENCE, EVIDENCE_FINDING ve EVIDENCE_RELATION ayrı kanıtlanmalı.
- B FLUENCY, ACCURACY, MEANING_PRESERVATION ve TRANSFER ayrı kanıtlanmalı.
- D CONTEXTUAL_MEANING, LEXICAL_RELATION ve DOMAIN_CONTEXT ayrı kanıtlanmalı.
- Eksik veya çelişkili dimension'da REVIEW_REQUIRED kalmalı.
- Threshold ve karar kuralları ölçme uzmanı/veri sorumlusu tarafından gerekçeli şekilde onaylanmalı.

## 3. Sürüm ve geri alma kapıları

Release kaydı en az şu kimlikleri birlikte içermelidir:

itemBankManifestVersion + assessmentVersion + templateVersionId + mappingVersion + measurementContractVersion + scoringContractVersion + calibrationDecisionId

Açılış yeni bir version ve açık audit kararıyla yapılmalıdır. Eski assessment sonuçları yeniden yazılmaz. Geri alma:

1. yeni assignment üretimini durdurur;
2. mevcut öğrenci progress'ini silmez veya yeniden yazmaz;
3. P0 geçmişini değiştirmez;
4. teacher override audit izini korur;
5. manual SQL, doğrudan seed veya protected akış dışı write kullanmaz.

## 4. Mevcut V1 kararı

| Kapı                      | Mevcut durum                                            |
| ------------------------- | ------------------------------------------------------- |
| Graph ve identity         | Teknik olarak tutarlı                                   |
| Otomatik yapı kontrolleri | Mevcut testlerle korunuyor                              |
| Assessment görünürlüğü    | canonicalActive=false nedeniyle kapalı                  |
| Calibration               | NOT_CALIBRATED                                          |
| Production assignment     | false                                                   |
| P1-B                      | Kapalı; dört bağımsız boyut eksik                       |
| P1-C                      | Teknik aday; relation bağımsızlığı ve calibration eksik |
| P1-D                      | Kapalı; üç bağımsız boyut eksik                         |
| Nihai karar               | NOT_READY_FOR_PRODUCTION_ASSIGNMENT                     |

Bu kararın değiştirilmesi, yalnızca uzman/pilot kanıtı ve korumalı release onayıyla yeni bir görevdir. Bu kalite denetimi placement'ı etkinleştirmez.
