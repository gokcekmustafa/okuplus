# OkuPratik — P1-C V2 Çevrimdışı Pilot Analiz Aracı v1

**Durum:** Yerel, betimleyici analiz aracı tasarımı

Bu araç P1-C V2 aday görevleri için ileride toplanabilecek pilot verisini yalnızca
yerel JSON/JSONL dosyasından özetler. Uzman incelemesinin, etik/onam sürecinin,
pilot uygulamasının, akademik kalibrasyonun veya production release kararının
yerine geçmez. V1 item bankası, production scorer'ı, mapping'i ve geçmiş
sonuçları değiştirmez.

## Güvenlik sınırı

`pilot:analyze:offline` komutu yalnızca verilen yerel dosyayı okur. Araçta
Prisma, production servisleri, ağ çağrısı, route ataması, seviye kararı veya
kalibrasyon kararı bulunmaz. Ham yanıtlar rapora yazılmaz; yalnızca sayımlar ve
veri kalitesi uyarıları üretilir. Araç hiçbir grubu başarılı/başarısız ilan etmez
ve bireysel öğrenci hakkında tanı üretmez.

Bu nedenle raporun `safety` bölümü sabit olarak şunları gösterir:

- `offlineOnly: true`
- `productionDatabase: NOT_USED`
- `network: NOT_USED`
- `rawResponses: OMITTED`

P1-B/C/D otomatik atama kapıları, `REVIEW_REQUIRED` ilkesi ve mevcut production
güvenlik bayrakları bu araç tarafından değiştirilmez.

## Girdi biçimi

Araç iki biçimi destekler. Dosyalar anonim/sentetik çalışma verisi olmalı; gerçek
öğrenci, tenant veya iletişim bilgisi içeremez.

### JSON

Kök nesne `manifest` ve `records` alanlarını taşır:

<!-- P1C-V2-OFFLINE-MANIFEST-V1:START -->

```json
{
  "manifest": {
    "datasetVersion": "P1C-V2-PILOT-DATASET-V1",
    "itemPoolId": "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN",
    "sourceCommit": "f1c8ab90ceec29a4cc129b406d4ab961d6548e31",
    "designStatus": "DESIGN_ONLY",
    "taskDesignIds": [
      "V2C-INF-01",
      "V2C-INF-02",
      "V2C-INF-03",
      "V2C-INF-04",
      "V2C-EVF-01",
      "V2C-EVF-02",
      "V2C-EVF-03",
      "V2C-EVF-04",
      "V2C-REL-01",
      "V2C-REL-02",
      "V2C-REL-03",
      "V2C-REL-04"
    ],
    "passageDesignRefs": {
      "V2C-INF-01": "P1C-V2-TXT-01@1.0",
      "V2C-INF-02": "P1C-V2-TXT-02@1.0",
      "V2C-INF-03": "P1C-V2-TXT-03@1.0",
      "V2C-INF-04": "P1C-V2-TXT-04@1.0",
      "V2C-EVF-01": "P1C-V2-TXT-05@1.0",
      "V2C-EVF-02": "P1C-V2-TXT-06@1.0",
      "V2C-EVF-03": "P1C-V2-TXT-07@1.0",
      "V2C-EVF-04": "P1C-V2-TXT-08@1.0",
      "V2C-REL-01": "P1C-V2-TXT-09@1.0",
      "V2C-REL-02": "P1C-V2-TXT-10@1.0",
      "V2C-REL-03": "P1C-V2-TXT-11@1.0",
      "V2C-REL-04": "P1C-V2-TXT-12@1.0"
    },
    "passageVersionStatus": "NOT_CREATED",
    "passageVersionIds": [],
    "passageVersionBindings": {
      "V2C-INF-01": null,
      "V2C-INF-02": null,
      "V2C-INF-03": null,
      "V2C-INF-04": null,
      "V2C-EVF-01": null,
      "V2C-EVF-02": null,
      "V2C-EVF-03": null,
      "V2C-EVF-04": null,
      "V2C-REL-01": null,
      "V2C-REL-02": null,
      "V2C-REL-03": null,
      "V2C-REL-04": null
    },
    "questionVersionStatus": "NOT_CREATED",
    "questionVersionIds": [],
    "questionVersionBindings": {
      "V2C-INF-01": null,
      "V2C-INF-02": null,
      "V2C-INF-03": null,
      "V2C-INF-04": null,
      "V2C-EVF-01": null,
      "V2C-EVF-02": null,
      "V2C-EVF-03": null,
      "V2C-EVF-04": null,
      "V2C-REL-01": null,
      "V2C-REL-02": null,
      "V2C-REL-03": null,
      "V2C-REL-04": null
    },
    "mappingVersion": "P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN",
    "rubricVersion": "P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN",
    "pilotProtocolStatus": "DESIGN_ONLY",
    "pilotProtocolVersion": null,
    "groupCriteriaVersion": "EXTERNAL_CRITERIA-V1",
    "groupCriteriaReference": "local/redacted",
    "targetGradeStatus": "NOT_DETERMINED",
    "targetGradeBand": null,
    "analysisGroups": ["GENERAL_STUDENT_POPULATION", "STUDENTS_NEEDING_READING_DEVELOPMENT"]
  },
  "records": []
}
```

<!-- P1C-V2-OFFLINE-MANIFEST-V1:END -->

`sourceCommit` bir tahmin değil, verinin gerçekten üretildiği aday havuzu
kaynak commit'idir. Hedef yaş/sınıf henüz belirlenmediyse `targetGradeStatus`
`NOT_DETERMINED` ve `targetGradeBand` boş/null tutulur; araç bunu kendisi
belirlemez.

Bu örnek mevcut aday havuzunun gerçek durumunu gösterir: passage ve
`QuestionVersion` kayıtları henüz oluşturulmadığı için sürüm listeleri boştur ve
tamamlanmış yanıt kaydı geçerli sayılamaz. İlerideki bir sentetik fixture, yalnız
gerçekten oluşturulmuş immutable sürüm kimliklerini `passageVersionBindings`,
`questionVersionBindings`, `passageVersionIds` ve `questionVersionIds` içinde
tekrarlayabilir. `V2C-INF-01@2.0` veya `V2C-INF-01-Q@2.0` gibi tasarım kimlikleri
gerçek sürüm kimliği olarak kabul edilmez.

### JSONL

İlk satır manifest zarfıdır, sonraki satırlar response zarfıdır:

```jsonl
{"type":"manifest","manifest":{"datasetVersion":"P1C-V2-PILOT-DATASET-V1","itemPoolId":"OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN","sourceCommit":"f1c8ab90ceec29a4cc129b406d4ab961d6548e31","designStatus":"DESIGN_ONLY","taskDesignIds":["V2C-INF-01","..."],"passageDesignRefs":{},"passageVersionStatus":"NOT_CREATED","passageVersionIds":[],"passageVersionBindings":{},"questionVersionStatus":"NOT_CREATED","questionVersionIds":[],"questionVersionBindings":{},"mappingVersion":"P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN","rubricVersion":"P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN","pilotProtocolStatus":"DESIGN_ONLY","pilotProtocolVersion":null,"groupCriteriaVersion":"EXTERNAL_CRITERIA-V1","groupCriteriaReference":"local/redacted","targetGradeStatus":"NOT_DETERMINED","targetGradeBand":null,"analysisGroups":["GENERAL_STUDENT_POPULATION","STUDENTS_NEEDING_READING_DEVELOPMENT"]}}
{"type":"response","record":{"pilotParticipantId":"anon-001","analysisGroup":"GENERAL_STUDENT_POPULATION","gradeBand":"G7","taskDesignId":"V2C-EVF-01","passageVersionId":"immutable-passage-id-from-provisioning","questionVersionId":"immutable-question-id-from-provisioning","taskOrder":1,"answerCompleteness":"COMPLETE","evidenceCandidateId":"SPAN-01"}}
```

JSONL örneğindeki `...`, boş map ve açıklayıcı immutable kimlikler şema
anlatımıdır; çalıştırılabilir veri değildir. Gerçek dosyada map'in tüm 12 task
anahtarını taşıması ve bu iki immutable kimliğin manifestteki ilgili binding ile
aynı olması zorunludur. Zarf türü, görev alanlarını yanlış biçimde birbirine
karıştırmayı önler.

## Yanıt sözleşmesi ve doğrulama

### Tasarım kimliği ile immutable sürüm ayrımı

Mevcut havuz `DESIGN_ONLY` durumundadır. `V2C-INF-*`, `V2C-EVF-*` ve
`V2C-REL-*` değerleri task tasarım kimlikleridir; `P1C-V2-TXT-*@1.0` değerleri
de aday havuzundaki tasarım metni referanslarıdır. Bunların hiçbiri gerçek
`QuestionVersion` veya provision edilmiş immutable passage kimliği değildir.

Manifest bu ayrımı zorunlu alanlarla taşır:

- `taskDesignIds` ve `passageDesignRefs`: commit'e sabitlenmiş aday havuzu
  ilişkileri. Araç, mevcut havuzun desteklemediği task–metin eşleşmesini kabul
  etmez. REL-02, REL-03 ve REL-04 için de sırasıyla
  `P1C-V2-TXT-10@1.0`, `P1C-V2-TXT-11@1.0` ve `P1C-V2-TXT-12@1.0` tasarım
  referansları sabittir.
- `passageVersionBindings` ve `questionVersionBindings`: ileride gerçekten
  oluşturulacak immutable sürümlerin task'a bağlı kimlikleri.
- `passageVersionIds` ve `questionVersionIds`: binding'lerde kullanılan gerçek
  kimliklerin listeleri.
- `passageVersionStatus`/`questionVersionStatus`: `NOT_CREATED` iken ilgili
  liste boş ve bütün binding'ler `null` olmalıdır. `AVAILABLE` olsa bile kimlik
  task tasarım adını taklit edemez ve her response doğru task binding'iyle
  eşleşmelidir.

Bu nedenle mevcut design-only manifest, complete pilot yanıtı için yeterli
değildir; araç bunu sessizce geçerli saymaz. Protocol sürümü de mevcut taslakta
belirlenmemişse `pilotProtocolStatus: DESIGN_ONLY` ve `pilotProtocolVersion:
null` olarak kalır. Uydurma `@2.0` kimlikleri kullanılmaz.

Her kayıt aşağıdaki anonim/sürüm alanlarını taşımalıdır:

- `pilotParticipantId`, `analysisGroup`, isteğe bağlı `gradeBand`;
- `taskDesignId`, `passageVersionId`, `taskOrder`;
- `questionVersionId`; manifest ayrıca görev, metin ve soru sürüm listelerini
  doğrular;
- `answerCompleteness`: `COMPLETE`, `BLANK`, `PARTIAL`, `INVALID` veya
  `REVIEW_REQUIRED`;
- `gradeBand`: hedef yaş/sınıf henüz tasarım kararı değil; kayıt düzeyinde yalnızca
  `G1`–`G12` biçimindeki sentetik sınıf kodları kabul edilir. Serbest metinler
  `GRADE_BAND_INVALID` olarak işaretlenir ve rapor tablolarına taşınmaz;
- INFERENCE için `answer.optionId`;
- EVIDENCE_FINDING için `evidenceCandidateId`;
- EVIDENCE_RELATION için birbirinden ayrı `evidenceCandidateId` ve
  `relationType`;
- varsa anonim `raterCode`/`score` listesi ve ayrı `adjudication` kaydı.

Araç yalnızca mevcut 12 tasarım görevini ve görev türüyle uyumlu alanları kabul
eder. EVIDENCE_FINDING için aday kimlikleri ilgili görevin `SPAN-01`–`SPAN-04`
havuzundan, EVIDENCE_RELATION için ilgili görevin belgelenmiş `CAND-*`
havuzundan gelmelidir; bilinmeyen adaylar dağılıma eklenmez. Bilinmeyen görev,
yanlış cevap şekli, eksik zorunlu sürüm alanı veya geçersiz grup fatal veri
kalitesi hatasıdır. Kimlik, tenant veya iletişim alanları
(`email`, `phone`, `tenantId`, `studentId`, `userId`, `name`, `address`, vb.)
herhangi bir iç içe nesnede reddedilir. Yinelenen katılımcı/görev/sürüm/sıra
anahtarı sessizce silinmez; `DUPLICATE_RESPONSE` olarak raporlanır.

Rapor özetleri ve dağılımları yalnızca izin verilen görev, grup, tamamlanma,
sınıf ve aday kategorilerini içerir. Geçersiz alanların ham metni rapora
eklenmez; ilgili kayıt hata kodu ve indeksiyle birlikte `INVALID_DATA` olarak
işaretlenir. Böylece hata içeren JSON çıktısı da girdi değerlerini yankılamaz.

Eksik grup veya sınıf bilgisi kayda geçirilir ve toplulaştırmaya `MISSING` hücresi
olarak girer. Grup üyeliği P1-C yanıtlarından, WPM'den, Antrenman verisinden veya
istemci puanlarından türetilmez; manifestte dış ölçüt sürümü/referansı bulunur.

## Çıktı

Rapor şu betimleyici bölümleri içerir:

- yanıt ve benzersiz anonim katılımcı sayısı;
- görev, grup ve cevap bütünlüğü dağılımları;
- görev/grup kesişimi;
- INFERENCE seçenek sıklığı;
- EVIDENCE_FINDING kanıt seçimi sıklığı;
- EVIDENCE_RELATION kanıt seçimi ve `relationType` sıklığının iki ayrı tablosu;
- grup/sınıf tabakaları, eksik bilgiler ve boş hücreler;
- birden çok değerlendirici varsa ham anlaşma/anlaşmazlık sayıları ve adjudication
  sayısı;
- manifest/sürüm bütünlüğü uyarıları ve veri kalite hataları.

Rapor route, seviye, başarı, başarısızlık, hazır olma veya kalibrasyon kararı
üretmez. İlişki puanları inference puanlarıyla birleştirilmez. Yeterli veri
olmaması açıkça sayım/uyarı olarak kalır; araç örneklem yeterliliği, kabul eşiği
ve akademik geçerlilik iddiası oluşturmaz.

## Çalıştırma

```text
npm run pilot:analyze:offline -- ./local/p1c-v2-pilot.json
npm run pilot:analyze:offline -- ./local/p1c-v2-pilot.jsonl
```

CLI JSON raporu stdout'a yazar. Girdi okunamıyor veya veri sözleşmesi geçersizse
`status` başarısız bir durumla döner ve süreç sıfır olmayan kodla sonlanır. Bu
rapor hiçbir dış sisteme gönderilmez.

## Pilot ve akademik karar sınırı

Bu araç uzman incelemesi, etik/onam, veri saklama/silme, pilot tasarımı,
inter-rater prosedürü, uzman adjudication'ı veya kalibrasyonun yerine geçmez.
Hedef yaş/sınıf aralığı, örneklem büyüklüğü, kabul eşiği ve release kararı
uzman/ölçme-değerlendirme ekibinin ayrı karar kayıtlarında belirlenmelidir.
Eski sürüm sonuçları yeniden yazılmaz; mapping, rubric, protokol veya görev
sürümü değiştiğinde yeni bir veri kümesi sürümü kullanılmalıdır.
