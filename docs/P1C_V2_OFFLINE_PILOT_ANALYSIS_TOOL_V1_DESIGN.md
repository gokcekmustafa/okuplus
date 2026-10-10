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

```json
{
  "manifest": {
    "datasetVersion": "P1C-V2-PILOT-DATASET-V1",
    "itemPoolId": "OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN",
    "sourceCommit": "f1c8ab90ceec29a4cc129b406d4ab961d6548e31",
    "taskVersionIds": ["V2C-INF-01@2.0"],
    "passageVersionIds": ["P1C-V2-TXT-01@1.0"],
    "questionVersionIds": ["V2C-INF-01-Q@2.0"],
    "mappingVersion": "P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN",
    "rubricVersion": "P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN",
    "pilotProtocolVersion": "P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN",
    "groupCriteriaVersion": "EXTERNAL_CRITERIA-V1",
    "groupCriteriaReference": "local/redacted",
    "targetGradeStatus": "NOT_DETERMINED",
    "targetGradeBand": null,
    "analysisGroups": ["GENERAL_STUDENT_POPULATION", "STUDENTS_NEEDING_READING_DEVELOPMENT"]
  },
  "records": [
    {
      "pilotParticipantId": "anon-001",
      "analysisGroup": "GENERAL_STUDENT_POPULATION",
      "gradeBand": "G7",
      "taskDesignId": "V2C-INF-01",
      "passageVersionId": "P1C-V2-TXT-01@1.0",
      "questionVersionId": "V2C-INF-01-Q@2.0",
      "taskOrder": 1,
      "answerCompleteness": "COMPLETE",
      "answer": { "optionId": "V2C-INF-01-OPT-A" },
      "raterScores": [
        { "raterCode": "R1", "score": 1 },
        { "raterCode": "R2", "score": 1 }
      ]
    }
  ]
}
```

`sourceCommit` bir tahmin değil, verinin gerçekten üretildiği aday havuzu
kaynak commit'idir. Hedef yaş/sınıf henüz belirlenmediyse `targetGradeStatus`
`NOT_DETERMINED` ve `targetGradeBand` boş/null tutulur; araç bunu kendisi
belirlemez.

### JSONL

İlk satır manifest zarfıdır, sonraki satırlar response zarfıdır:

```jsonl
{"type":"manifest","manifest":{"datasetVersion":"P1C-V2-PILOT-DATASET-V1","itemPoolId":"OKU-CANONICAL-PLACEMENT-ITEM-BANK-V2-C-DESIGN","sourceCommit":"f1c8ab90ceec29a4cc129b406d4ab961d6548e31","taskVersionIds":["V2C-EVF-01@2.0"],"passageVersionIds":["P1C-V2-TXT-05@1.0"],"questionVersionIds":["V2C-EVF-01-Q@2.0"],"mappingVersion":"P1_ADAPTIVE_ITEM_MAPPING_V2_C_DESIGN","rubricVersion":"P1C_EVIDENCE_RELATION_RUBRIC_V1_DESIGN","pilotProtocolVersion":"P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN","groupCriteriaVersion":"EXTERNAL_CRITERIA-V1","groupCriteriaReference":"local/redacted","targetGradeStatus":"NOT_DETERMINED","targetGradeBand":null,"analysisGroups":["GENERAL_STUDENT_POPULATION","STUDENTS_NEEDING_READING_DEVELOPMENT"]}}
{"type":"response","record":{"pilotParticipantId":"anon-001","analysisGroup":"GENERAL_STUDENT_POPULATION","gradeBand":"G7","taskDesignId":"V2C-EVF-01","passageVersionId":"P1C-V2-TXT-05@1.0","questionVersionId":"V2C-EVF-01-Q@2.0","taskOrder":1,"answerCompleteness":"COMPLETE","evidenceCandidateId":"SPAN-01"}}
```

Zarf türü, görev alanlarını yanlış biçimde birbirine karıştırmayı önler.

## Yanıt sözleşmesi ve doğrulama

Her kayıt aşağıdaki anonim/sürüm alanlarını taşımalıdır:

- `pilotParticipantId`, `analysisGroup`, isteğe bağlı `gradeBand`;
- `taskDesignId`, `passageVersionId`, `taskOrder`;
- `questionVersionId`; manifest ayrıca görev, metin ve soru sürüm listelerini
  doğrular;
- `answerCompleteness`: `COMPLETE`, `BLANK`, `PARTIAL`, `INVALID` veya
  `REVIEW_REQUIRED`;
- INFERENCE için `answer.optionId`;
- EVIDENCE_FINDING için `evidenceCandidateId`;
- EVIDENCE_RELATION için birbirinden ayrı `evidenceCandidateId` ve
  `relationType`;
- varsa anonim `raterCode`/`score` listesi ve ayrı `adjudication` kaydı.

Araç yalnızca mevcut 12 tasarım görevini ve görev türüyle uyumlu alanları kabul
eder. Bilinmeyen görev, yanlış cevap şekli, eksik zorunlu sürüm alanı veya
geçersiz grup fatal veri kalite hatasıdır. Kimlik, tenant veya iletişim alanları
(`email`, `phone`, `tenantId`, `studentId`, `userId`, `name`, `address`, vb.)
herhangi bir iç içe nesnede reddedilir. Yinelenen katılımcı/görev/sürüm/sıra
anahtarı sessizce silinmez; `DUPLICATE_RESPONSE` olarak raporlanır.

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
