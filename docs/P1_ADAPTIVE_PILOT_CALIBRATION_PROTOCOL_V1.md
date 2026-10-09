# OkuPratik — P1 Adaptive Measurement Pilot ve Kalibrasyon Protokolü v1

**Durum:** Tasarım protokolü; uzman ve veri sorumlusu doldurur.
**Amaç:** P1-B/C/D route-need ölçümünün teknik olarak çalışmasının ötesinde, hangi construct'ları güvenilir biçimde temsil ettiğini uzman incelemesi ve kontrollü pilotla değerlendirmek.

Bu protokol eşik, örneklem sayısı veya akademik başarı iddiası uydurmaz. Aşağıdaki boş alanlar uzman/ölçme-değerlendirme ekibi tarafından, hedef yaş ve Türkçe bağlamına uygun gerekçeyle doldurulmadan production assignment açılmaz.

## 1. Ön koşullar

- [ ] `P1_ADAPTIVE_ITEM_MAPPING_V1` için item-level form tamamlandı.
- [ ] Item bankası ile assessment manifestindeki kimlik, sürüm ve soru türü farkları çözüldü veya açıkça release blocker olarak kayda alındı.
- [ ] Her dimension için en az bir açık construct tanımı ve scorer çıktısı var.
- [ ] C `EVIDENCE_RELATION` için inference'tan bağımsız görev/kanıt kararı verildi.
- [ ] B'nin fluency, accuracy, meaning preservation ve transfer boyutları ayrı tasarlandı; tek skorla birleştirilmedi.
- [ ] D'nin contextual meaning, lexical relation ve domain context boyutları ayrı tasarlandı; genel kelime puanı domain context sayılmadı.
- [ ] Sunucu, answer key, item version, mapping version, assessment identity ve completion durumunu doğruluyor.
- [ ] Eksik/çelişkili/ambiguous sonuç `REVIEW_REQUIRED` üretmeye devam ediyor.
- [ ] Pilot verisi production öğrenci ilerlemesine veya production route assignment'a yazılmıyor.

## 2. Pilot tasarımı

| Alan                         | Uzman tarafından doldurulacak |
| ---------------------------- | ----------------------------- |
| Hedef yaş / grade            |                               |
| Türkçe dil profili           |                               |
| Katılımcı seçim ölçütleri    |                               |
| Dışlama ölçütleri            |                               |
| Planlanan toplam katılımcı   |                               |
| Her grade/skill tabakası     |                               |
| Pilot ortamı ve gözetim      |                               |
| Etik/veli/onam prosedürü     |                               |
| Veri saklama ve silme süresi |                               |
| Körleme / rater bağımsızlığı |                               |
| Pilot sürümü                 |                               |

Pilot katılımcıları gerçek production tenant/student kayıtlarıyla karıştırılmamalı; değerlendirme kayıtları ayrı, silinebilir ve erişimi sınırlı bir çalışma ortamında tutulmalıdır.

## 3. Görev formu

### P1-B

Her boyut, diğerlerinden ayrılacak şekilde görevlenir:

1. **Fluency:** kontrollü metin, okuma koşulu ve gözlenen performans birlikte kaydedilir. Sadece ekran tıklama süresi veya WPM kullanılmaz.
2. **Accuracy:** metin işleme/doğru okuma kanıtı ayrı tasarlanır. Soru cevabı doğruluğu otomatik olarak accuracy yerine geçmez.
3. **Meaning preservation:** okuma koşulu değiştiğinde anlamın korunmasını gösteren eşleştirilmiş görev gerekir.
4. **Transfer:** daha önce görülmemiş metin/bağlam veya uygun gecikmeli görevle hedef davranışın aktarımı gerekir.

| Boyut                | Görev formu | Cevap/scorer | Uzman gerekçesi |
| -------------------- | ----------- | ------------ | --------------- |
| FLUENCY              |             |              |                 |
| ACCURACY             |             |              |                 |
| MEANING_PRESERVATION |             |              |                 |
| TRANSFER             |             |              |                 |

### P1-C

1. **Inference:** metinsel kanıttan desteklenen sonucu seçme/kurma.
2. **Evidence finding:** sonucu destekleyen cümle/ifade/parçayı bulma.
3. **Evidence relation:** bulunan kanıtın seçilen sonucu nasıl desteklediğini ayrı kurma veya açıklama.

| Boyut             | Görev formu | Cevap/scorer | Uzman gerekçesi |
| ----------------- | ----------- | ------------ | --------------- |
| INFERENCE         |             |              |                 |
| EVIDENCE_FINDING  |             |              |                 |
| EVIDENCE_RELATION |             |              |                 |

### P1-D

1. **Contextual meaning:** sözcük/ifadenin cümle/passage içindeki anlamı.
2. **Lexical relation:** sözcükler veya ifadeler arasındaki yapı/anlam ilişkisi.
3. **Domain context:** alan bağlamı ve ilgili ön bilginin yeni örneğe uygulanması.

| Boyut              | Görev formu | Cevap/scorer | Uzman gerekçesi |
| ------------------ | ----------- | ------------ | --------------- |
| CONTEXTUAL_MEANING |             |              |                 |
| LEXICAL_RELATION   |             |              |                 |
| DOMAIN_CONTEXT     |             |              |                 |

## 4. Toplanacak teknik kayıtlar

Her completed assessment için aşağıdaki alanlar item version ve contract version ile birlikte saklanır. Pilot dışında production verisi değiştirilmez.

- `assessmentId`, `assessmentVersion`, `templateVersionId`;
- `questionVersionId`, stable question ID, passage/content version;
- server answer evaluation, raw score ve scoring reason;
- editorial mapping version ve mapped dimension;
- answer completeness, ambiguous/error state, elapsed time (yalnız bağlam sinyali);
- scorer output'unun `READY` veya `REVIEW_REQUIRED` nedeni;
- route decision'ın assessment completion'a bağlı olup olmadığı;
- varsa human/rater label'ı ve rater kimlik kodu;
- participant/tenant kimliği yerine anonim pilot ID.

İstemciden gelen route family, route need, score veya dimension alanları ölçüm kanıtı değildir; server-side scorer bunları yok saymalıdır.

## 5. Analiz planı

### Item ve construct incelemesi

- answer key doğruluğu ve tek-anlamlılık;
- çeldirici seçilme desenleri;
- boş/eksik/ambiguous cevapların etkisi;
- passage uzunluğu, kelime yükü ve ön bilgi confound'u;
- soru türünün construct dışı performans etkisi;
- mapping dimension coverage ve item overlap;
- item version değiştiğinde eski sonuçların korunması.

### Dimension düzeyi

Her dimension için aşağıdaki değerler uzman/ölçme ekibi tarafından seçilir ve gerekçelendirilir; bu belge varsayılan threshold önermez:

- minimum usable evidence;
- eksik cevap policy'si;
- çelişkili kanıt policy'si;
- inter-rater agreement gerekiyorsa rater prosedürü;
- classification stability ölçümü;
- ölçüm hatası / belirsizlik raporu;
- hangi koşulda `REVIEW_REQUIRED` zorunlu kalır.

| Dimension            | Gerekli veri | Kabul ölçütü | Eşik / gerekçe |
| -------------------- | ------------ | ------------ | -------------- |
| FLUENCY              |              |              | **Boş**        |
| ACCURACY             |              |              | **Boş**        |
| MEANING_PRESERVATION |              |              | **Boş**        |
| TRANSFER             |              |              | **Boş**        |
| INFERENCE            |              |              | **Boş**        |
| EVIDENCE_FINDING     |              |              | **Boş**        |
| EVIDENCE_RELATION    |              |              | **Boş**        |
| CONTEXTUAL_MEANING   |              |              | **Boş**        |
| LEXICAL_RELATION     |              |              | **Boş**        |
| DOMAIN_CONTEXT       |              |              | **Boş**        |

## 6. Kalibrasyon kararı

Kalibrasyon kararı, yalnızca toplam puan veya tek soru türüyle verilemez. Aşağıdaki durumlarda route otomatik seçilemez:

- gerekli dimension'lardan biri eksik veya yalnızca dolaylı kanıta dayanıyorsa;
- mapping sürümü beklenen bankayla eşleşmiyorsa;
- cevaplar tamamlanmamışsa;
- scorer sonucu null/ambiguous/error ise;
- kanıt boyutları birbiriyle çelişiyorsa;
- uzman kararı `REVISE`, `REJECT` veya `PENDING_DATA` ise;
- calibration status `NOT_CALIBRATED` veya production assignment flag `false` ise.

| Karar alanı                       | Sonuç                                                             |
| --------------------------------- | ----------------------------------------------------------------- |
| Placement scoring contract status | **`NOT_CALIBRATED` — mevcut canonical durum**                     |
| Production assignment             | **`false` — mevcut canonical durum**                              |
| P1-A fallback                     | **Korunur**                                                       |
| P1-B                              | **Kapalı; dört boyutun gerçek kanıtı yok**                        |
| P1-C                              | **Teknik C adayları mevcut; akademik calibration olmadan kapalı** |
| P1-D                              | **Kapalı; üç boyutun gerçek kanıtı yok**                          |
| Uzman nihai kararı                | **Boş bırakılacak**                                               |

## 7. Release gate ve geri alma

Bir route'u açmadan önce ayrı bir release kaydında şu sürümler birlikte yazılmalıdır:

`itemBankManifestVersion` + `assessmentVersion` + `templateVersionId` + `mappingVersion` + `measurementContractVersion` + `scoringContractVersion` + calibration decision ID.

Gate açılması; mevcut P0 22-step akışını, P0 geçmişini, P1-A fallback'ini, tek aktif P1/idempotency kurallarını, tenant izolasyonunu ve teacher override audit izini değiştirmemelidir. Geri alma; yeni route assignment üretimini durdurur, geçmiş assessment sonuçlarını yeniden yazmaz ve production DB'de manuel düzeltme yapmaz.
