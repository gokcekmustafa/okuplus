# OkuPratik — Placement Kalite Denetimi ve Kalibrasyon Hazırlığı v1

**Denetim tarihi:** 2026-10-10
**Canonical master:** b62ec7f8cacdb9a0789c08e53e05e193277bfa25
**Item bank:** OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1 / 1.0.1
**Assessment:** OKU-READING-PLACEMENT-V1 / 1.1.0
**Durum:** Teknik olarak doğrulanmış taslak; uzman incelemesi ve pilot kalibrasyonu bekliyor.

Bu belge, placement grafiğini etkinleştirmez, öğrenciye sınav açmaz ve hiçbir üretim kaydını değiştirmez. Otomatik doğrulama ile editoryal/psikometrik değerlendirme özellikle birbirinden ayrılmıştır.

## 1. Sonuç

**Karar: NOT_READY_FOR_PRODUCTION_ASSIGNMENT**

Canonical V1 paketi yapısal olarak tutarlı görünmektedir:

- 12 passage ve 36 benzersiz soru vardır.
- Her passage üç soruya sahiptir.
- Beceri dağılımı RC_MAIN_IDEA, RC_DETAIL ve RC_INFERENCE için 12/12/12'dir.
- Soru türleri MULTIPLE_CHOICE, TRUE_FALSE, MATCHING ve FILL_BLANK için 9/9/9/9'dur.
- EASY, MEDIUM ve HARD blokları 12/12/12'dir; her beceri içinde 4/4/4 korunur.
- Soruların hiçbiri OPEN_ENDED değildir.
- Answer contract, evidence span varlığı, seçenek/cevap bağlantısı, matching çiftleri ve fill-blank cevap listeleri otomatik olarak doğrulanır.

Buna karşılık aşağıdaki iddialar henüz üretim kararı olarak desteklenmemektedir:

- B rotasının akıcılık, doğruluk, anlamın korunumu ve transfer boyutları.
- D rotasının bağlamsal anlam, sözcük ilişkisi ve alan bağlamı boyutları.
- C rotasının EVIDENCE_RELATION boyutunun INFERENCE'tan bağımsız olduğu.
- difficultyLabel değerlerinin gerçek öğrenci verisiyle kalibre edilmiş olduğu.

Bu nedenle mevcut güvenlik sözleşmeleri korunmalıdır:

- canonicalActive=false
- calibrationStatus=NOT_CALIBRATED
- productionAssignmentEnabled=false
- tamamlanmamış, çelişkili veya yetersiz sonuçlarda reviewRequired=true
- resultLevelId=null

## 2. İnceleme kapsamı ve kanıt kaynakları

İnceleme şu canonical kaynaklar üzerinden yapılmıştır:

- src/curriculum/canonical-placement-item-bank.ts
- src/curriculum/canonical-placement-assessment.ts
- src/curriculum/adaptive-placement-item-mapping.ts
- src/modules/assessments/placement-scoring.ts
- src/modules/assessments/adaptive-measurement-scoring.ts
- src/modules/assessments/canonical-selector.ts
- src/modules/assessments/service.ts
- src/modules/onboarding/routes.ts
- src/modules/assessments/student-routes.ts
- test/canonical-placement-item-bank.test.ts
- test/placement-scoring.test.ts
- test/placement-route-security.test.ts
- P1_ADAPTIVE_MEASUREMENT_EVIDENCE_MATRIX_V1.md
- P1_ADAPTIVE_EXPERT_REVIEW_FORM_V1.md
- P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1.md
- P1_ADAPTIVE_PRODUCTION_READINESS_GATE_V1.md

Production'daki canonical graph’ın salt-okunur audit sonucu da aynı identity, version, 36 soru ve 9/9/9/9 dağılımını doğrulamıştır; bu belge production assignment açılması anlamına gelmez.

## 3. Otomatik doğrulama ile uzman kararının ayrımı

### Otomatik olarak doğrulanabilenler

Manifest validator ve mevcut testler aşağıdakileri kontrol eder:

1. Stable ID biçimi ve benzersizliği.
2. Passage/question içerik kimliği ilişkisi.
3. Her passage için üç soru.
4. Skill, difficulty ve soru türü dağılımları.
5. OPEN_ENDED yasağı.
6. Soru türü ile answer contract eşleşmesi.
7. MULTIPLE_CHOICE correct option ID bağlantısı.
8. TRUE_FALSE true/false sözleşmesi.
9. MATCHING left/right ID bütünlüğü ve duplicate kontrolü.
10. FILL_BLANK blank ID ve boş olmayan acceptedAnswers.
11. Evidence span'in passage içinde bulunması.
12. Scorer'ın yalnızca sunucu tarafındaki soru/cevap ve trusted mapping verisini kullanması.
13. Minimum scored count, üç skill coverage ve calibration gate.
14. canonicalActive=false iken öğrenci listesi/detail/session-start/onboarding akışlarının placement'ı seçmemesi.

### Otomatik olarak iddia edilemeyecekler

Şema doğrulaması bir maddenin pedagojik olarak iyi olduğunu, tek cevabın tartışmasız olduğunu, çeldiricilerin eşit güçte olduğunu veya bir label'ın gerçek difficulty olduğunu kanıtlamaz. Evidence span'in passage içinde olması da span'in seçilen construct'ı gerçekten temsil ettiğini kanıtlamaz.

Evidence span için paragraph numarası tutulur; mevcut validator span'in passage içinde olmasını ve paragraph alanının varlığını kontrol eder. Özellikle birden fazla paragrafı kapsayan matching/span kayıtlarında paragraph-level exactness ayrıca uzman tarafından incelenmelidir.

## 4. Design ve ölçüm riskleri

### Sıra ve difficulty

- Her passage aynı üçlü sırayı izler: MAIN_IDEA, DETAIL, INFERENCE.
- EASY sorular Q001–Q012, MEDIUM sorular Q013–Q024, HARD sorular Q025–Q036 olarak bloklanmıştır.
- Bu düzen otomatik bir hata değildir; ancak soru sırası, yorgunluk, öğrenme/alışma ve metin sırasına bağlı performans etkisi yaratabilir.
- difficultyLabel ve difficulty değeri yazar tanımıdır; pilot verisi olmadan empirik güçlük veya seviye iddiası değildir.

### Soru türü ve puanlama yükü

- 9 MULTIPLE_CHOICE: correct option bağlantısı otomatik kontrol edilir; çeldiricilerin ikinci savunulabilir cevap üretip üretmediği uzman incelemesi ister.
- 9 TRUE_FALSE: negatiflik, kapsam ve tek bir sözcüğün anlamı cevabı yapay biçimde belirlememelidir.
- 9 MATCHING: mevcut contract partialCredit=false ve all-or-nothing'dir; çiftlerin birbirini açıkça dışlaması ve puanlama yükünün construct dışı olmaması incelenmelidir.
- 9 FILL_BLANK: acceptedAnswers listesi teknik olarak doğrulanır; morfoloji, eş anlamlılar, yazım varyantları ve beklenmeyen doğru ifadeler uzman tarafından gözden geçirilmelidir.

### Evidence ve construct

- Ana fikir maddeleri tek başına C route kanıtı sayılmaz.
- Detail maddeleri EVIDENCE_FINDING için aday olabilir; doğrudan bulma ile basit hatırlama ayrımı uzman tarafından yapılmalıdır.
- INFERENCE maddeleri C için teknik adaydır, ancak doğru cevap seçimi tek başına evidence relation değildir.
- EVIDENCE_RELATION etiketli matching maddeleri Q006, Q013, Q018 ve Q030'dur. Bu etiketin bağımsız bir kanıt oluşturduğu henüz kabul edilmemelidir.
- Mevcut bankada B'nin dört boyutunu veya D'nin üç boyutunu doğrudan ve ayrı üreten görev/scorer yoktur. Bu eksikliği cevap doğruluğu, response time, Training veya WPM ile kapatmak yasaktır.

## 5. 36 maddelik soru denetim kaydı

Otomatik durum sütunundaki PASS yalnızca yapısal ve server-contract kontrollerinin geçtiğini ifade eder. Uzman durumu tüm maddeler için boş bırakılmalı ve form üzerinden doldurulmalıdır. Evidence span'in uzun tam metni ve seçeneklerin tamamı canonical item bankası ile mevcut evidence matrix'te tutulur; aşağıdaki kısa kayıt, izlenebilir denetim indeksidir.

| ID        | Content | Skill / talep          | Zorluk | Tür / beklenen cevap               | Evidence paragraph / kısa span                         | Beklenen gerekçe                                 | Risk / review odağı                      | Öncelik / durum               |
| --------- | ------- | ---------------------- | ------ | ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------- | ----------------------------- |
| PLV1-Q001 | C001    | MAIN_IDEA / UNDERSTAND | EASY   | MC / b                             | p2 / ölçülebilir gözlem                                | Tahmini değil, ölçümlü gözlem                    | Ana fikir ve çeldirici tekliği           | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q002 | C001    | DETAIL / RECALL        | EASY   | TF / D                             | p2 / aynı miktarda su ve filtre karşılaştırması        | Deney yöntemini tanıma                           | Açık ayrıntı ile evidence finding ayrımı | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q003 | C001    | INFERENCE / INFER      | EASY   | FB / sınamak                       | p3 / tek deneme yerine yeni ölçümler                   | Tek denemeden kesin sonuç çıkarmama              | Accepted answer ve çıkarım yükü          | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q004 | C002    | MAIN_IDEA / UNDERSTAND | EASY   | TF / D                             | p2 / hareketli ve sessiz alan ayrımı                   | Düzenlemenin iki amacını görme                   | Ana fikir, negatiflik ve çeldirici       | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q005 | C002    | DETAIL / RECALL        | EASY   | FB / duvar kenarına                | p1 / kitap arabalarının konumu                         | Açık konum bilgisini bulma                       | Yazım/morfoloji ve basit hatırlama       | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q006 | C002    | INFERENCE / INFER      | EASY   | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / passage tamamı                                  | Düzenleme ile kullanım amacını ilişkilendirme    | All-or-nothing; relation bağımsızlığı    | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q007 | C003    | MAIN_IDEA / UNDERSTAND | EASY   | FB / araştırma                     | p2 / passage gözlem ve temkinli yorum bütünü           | Gözlemi araştırma yaklaşımı olarak özetleme      | Ana fikir, uzun span ve cevap tekliği    | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q008 | C003    | DETAIL / UNDERSTAND    | EASY   | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p2 / kayıt alanları ve kullanım bütünü                 | Kayıt bilgisini kullanım amacıyla eşleştirme     | Matching yükü ve evidence finding        | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q009 | C003    | INFERENCE / INFER      | EASY   | MC / b                             | p3 / hava ve çevre etkileri                            | Koşulların sonucu etkileyebileceğini çıkarma     | Çeldirici ikinci cevap riski             | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q010 | C004    | MAIN_IDEA / UNDERSTAND | EASY   | MC / b                             | p2 / günlüğün tahmin için sınırlı oluşu                | Verinin sınırını özetleme                        | Ana fikir ve seçenek ayrışması           | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q011 | C004    | DETAIL / RECALL        | EASY   | FB / yönünü, yonunu                | p1 / rüzgârın yönü                                     | Kaydedilen alanı hatırlama                       | Yazım varyantı ve cevap genişliği        | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q012 | C004    | INFERENCE / INFER      | EASY   | TF / D                             | p3 / sabah-akşam gözlemleri                            | Karşılaştırmayı güçlendirme çıkarımı             | TF kapsamı ve tek maddelik kanıt         | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q013 | C005    | MAIN_IDEA / UNDERSTAND | MEDIUM | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / veri, sonuç ve öneri bütünü                     | Bulguyu sonuca/öneriye bağlama                   | EVIDENCE_RELATION bağımsızlığı           | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q014 | C005    | DETAIL / RECALL        | MEDIUM | TF / Y                             | p2 / yalnız toplam sayıyla yetinmeme                   | Ölçüm kapsamını doğru okuma                      | Negatif ifade ve TF yükü                 | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q015 | C005    | INFERENCE / INFER      | MEDIUM | MC / b                             | p1–3 / saatlere göre taşıma önerisi                    | Zaman deseninden uygulama çıkarma                | Çeldirici ve ön bilgi etkisi             | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q016 | C006    | MAIN_IDEA / UNDERSTAND | MEDIUM | TF / D                             | p3 / akıntı, derinlik ve zemin                         | Tek nedene indirgememe                           | Ana fikir ve TF formu                    | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q017 | C006    | DETAIL / RECALL        | MEDIUM | MC / b                             | p2 / aynı büyüklükte alanlar                           | Yöntem kontrolünü bulma                          | Çeldirici tekliği                        | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q018 | C006    | INFERENCE / INFER      | MEDIUM | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / çayır, karşılaştırma ve sınırlılık bütünü       | Bulguyu temkinli yorumlama                       | Relation ve inference örtüşmesi          | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q019 | C007    | MAIN_IDEA / UNDERSTAND | MEDIUM | FB / düzenlemiştir                 | p2 / açıklamayı kısaltma ve ayrıntı düğmesi            | Geri bildirime dayalı uyarlamayı özetleme        | Accepted answer ve ana fikir             | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q020 | C007    | DETAIL / UNDERSTAND    | MEDIUM | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / rehber özellikleri ve işlevleri bütünü          | Özellik ile kullanımını eşleştirme               | Matching ve doğrudan detail ayrımı       | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q021 | C007    | INFERENCE / INFER      | MEDIUM | MC / b                             | p3 / destekler, fiziksel incelemeyi kaldırmaz          | Destek ile yerine geçmeyi ayırma                 | Çeldirici ve çıkarım açıklığı            | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q022 | C008    | MAIN_IDEA / UNDERSTAND | MEDIUM | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / deney yöntemi ve amacı bütünü                   | Yöntemi amacıyla ilişkilendirme                  | Ana fikir; matching yükü                 | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q023 | C008    | DETAIL / RECALL        | MEDIUM | FB / nemini                        | p2 / yaprak, nem ve boy ölçümü                         | Kaydedilen ölçümü bulma                          | Accepted answer ve hatırlama             | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q024 | C008    | INFERENCE / INFER      | MEDIUM | TF / D                             | p3 / küçük örneklem ve kısa süre                       | Aşırı genellemeyi reddetme                       | Negatiflik ve çıkarım                    | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q025 | C009    | MAIN_IDEA / INFER      | HARD   | MC / b                             | p3 / eksik bilgiyi işaretleyip araştırmaya açma        | Arşiv amacını ve sınırlılığını çıkarma           | Ana fikir ama yüksek çıkarım yükü        | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q026 | C009    | DETAIL / UNDERSTAND    | HARD   | TF / D                             | p2 / kayıtları ve araç hassasiyetini birlikte ele alma | Veri güvenilirliğini koşullu değerlendirme       | Detail/evidence ayrımı ve TF             | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q027 | C009    | INFERENCE / INFER      | HARD   | FB / kesin kanıtı                  | p1–3 / tek kaydın kesin keşif sayılmaması              | Kanıt gücünü sınırlama                           | Accepted answer ve soyut çıkarım         | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q028 | C010    | MAIN_IDEA / INFER      | HARD   | TF / D                             | p1–3 / dil çeşitliliğini belgeleme                     | Doğru/yanlış ilanı yerine çeşitlilik amacı       | Ana fikir, TF ve dil yükü                | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q029 | C010    | DETAIL / UNDERSTAND    | HARD   | MC / b                             | p2 / birden fazla dayanağı birlikte kullanma           | Yaygınlık iddiasının iki kanıtını ayırma         | Çeldirici ve kanıt seçimi                | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q030 | C010    | INFERENCE / INFER      | HARD   | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / bulgu ve izin verilen yorumlar bütünü           | Bulguyu aşırı genellemeden yorumlama             | EVIDENCE_RELATION bağımsızlığı           | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q031 | C011    | MAIN_IDEA / INFER      | HARD   | FB / benimsemiştir                 | p3 / güvenlik ve canlı davranışı dengesi               | Trade-off yaklaşımını özetleme                   | Accepted answer ve ön bilgi              | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q032 | C011    | DETAIL / UNDERSTAND    | HARD   | MATCH / l1→r2, l2→r4, l3→r1, l4→r3 | p1–3 / ışık ayrıntıları ve işlevleri bütünü            | Ayrıntıyı işleviyle eşleştirme                   | Matching ve domain confound              | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q033 | C011    | INFERENCE / INFER      | HARD   | MC / b                             | p3 / tüm lambaları kaldırmama dengesi                  | Güvenlik ve canlı davranışı arasında denge       | Çeldirici/ön bilgi riski                 | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q034 | C012    | MAIN_IDEA / INFER      | HARD   | MATCH / l1→r2, l2→r3, l3→r1, l4→r4 | p1–3 / amaç ve ayrıntı düzeyi bütünü                   | Harita seçimini kullanım amacıyla ilişkilendirme | Matching ve ana fikir ayrımı             | DÜŞÜK / PASS; uzman bekliyor  |
| PLV1-Q035 | C012    | DETAIL / UNDERSTAND    | HARD   | FB / dar geçitlerin                | p2 / acil rota ayrıntısı                               | Gerekli ayrıntıyı bulma                          | Accepted answer ve morfoloji             | ÖNEMLİ / PASS; uzman bekliyor |
| PLV1-Q036 | C012    | INFERENCE / INFER      | HARD   | TF / Y                             | p2 / küçük haritanın her kullanımda hatalı olmaması    | Amaç ile doğruluk iddiasını ayırma               | Negatiflik, kapsam ve çıkarım            | ÖNEMLİ / PASS; uzman bekliyor |

## 6. Güvenlik ve görünürlük denetimi

Canonical selector, manifest identity/version, tenant scope, PUBLISHED durum ve canonicalActive=true koşullarını birlikte arar. canonicalActive=false iken:

- öğrenci assessment listesinde placement görünmemelidir;
- öğrenci detail çağrısı canonical placement bulamamalıdır;
- session start placement'ı başlatmamalıdır;
- onboarding placement seçimi boş dönmelidir;
- teknik kayıtların PUBLISHED olması tek başına öğrenciye görünürlük sağlamamalıdır.

Server-side placement scorer:

- soruları ve cevapları veritabanından/assessment session'dan alır;
- istemciden gelen rota veya seviye alanlarına güvenmez;
- OPEN_ENDED dışındaki supported answer contract'larını puanlar;
- minimum scored count veya skill coverage eksikse reviewRequired=true ve resultLevelId=null döndürür;
- NOT_CALIBRATED veya productionAssignmentEnabled=false ise sonuç seviyesini etkinleştirmez.

Bu denetim P0 22-step akışını, P0 geçmişini, P1-A fallback'ini, Training/Assignment ayrımını, tek aktif P1, idempotency, teacher override audit ve tenant izolasyonunu değiştirmemiştir.

## 7. Açılış koşulları

Placement veya B/C/D route assignment açılmadan önce aşağıdaki koşulların tamamı ayrı release kaydıyla kanıtlanmalıdır:

1. Uzman inceleme formu 36 item için doldurulmuş ve blocker sayısı sıfırdır.
2. Her item için answer key, passage evidence, dil/yaş uygunluğu ve çeldirici incelemesi tamamdır.
3. C EVIDENCE_RELATION için bağımsız görev veya bağımsız uzman/ölçüm kanıtı vardır.
4. B'nin dört, D'nin üç dimension'ı ayrı item/scorer kanıtıyla tamamdır.
5. Pilot veri seti ve analiz planı uzman/veri sorumlusu tarafından onaylanmıştır.
6. Difficulty ve route karar kuralları veriyle gerekçelendirilmiştir; ürün içinde uydurulmuş eşik yoktur.
7. Item bank, assessment, template, mapping, measurement ve scoring sürümleri tek release kaydında sabittir.
8. Yeni kalibrasyon kararı, eski sonuçları geriye dönük değiştirmeden yeni version ile ilişkilidir.
9. Protected provisioning/release akışı, backup/rollback ve smoke kanıtı hazırdır.
10. canonicalActive, calibrationStatus ve productionAssignmentEnabled değişiklikleri açık insan onayı ve audit kaydı olmadan yapılmaz.

Bu koşullar sağlanana kadar güvenli sonuç REVIEW_REQUIRED / NOT_READY'dir.

## 8. Otomatik kontroller ve test durumu

Bu denetimde yeni runtime kodu veya yeni production erişim yolu eklenmemiştir. Mevcut manifest validator, scorer testleri ve route-security testleri yeterli yapısal kapsamı sağlamaktadır. Yeni bir validator eklemek, aynı sözleşmeyi ikinci yerde yeniden uygulayıp drift riski yaratacağı için gerekli görülmemiştir.

Çalıştırılacak doğrulamalar:

- canonical placement item-bank focused testleri;
- placement scoring focused testleri;
- route-security focused testleri;
- typecheck;
- lint;
- format check;
- build.

Bu belgede geçen PASS sonuçları yalnızca repository içindeki otomatik kontrollerin ve mevcut read-only production graph audit'inin kapsamındadır; akademik uzman onayı değildir.
