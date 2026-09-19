# OKU+ Pilot Content QA Pack

Bu paket, Release 0.6 canonical içerik setinin küçük gerçek öğrenci pilotu öncesi
kontrol listesidir. Canlı içerik doğrulaması manuel SQL ile değil, resmi staging
provisioner ve authenticated E2E çıktısı üzerinden yapılır.

## Makine doğrulaması

| Kontrol                    | Durum                     | Kanıt                                                                                                                |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Canonical lesson inventory | PASS — 6/6 published      | [Staging authenticated E2E #32](https://github.com/gokcekmustafa/okuplus/actions/runs/35446527587), commit `35faf87` |
| Published template/runtime | PASS                      | E2E: published content graph, teaching/example/application ve runtime feedback                                       |
| Exercise families          | PASS — 6/6                | `ATTENTION_BURST`, `RAPID_RECOGNITION`, `PHRASE_CHUNKING`, `MAIN_IDEA`, `DETAIL_EVIDENCE`, `INFERENCE`               |
| Passage inventory          | PASS — 12 unique passages | Staging content inventory/read-only verification                                                                     |
| Questions                  | PASS — 36                 | Staging content inventory/read-only verification                                                                     |
| Placeholder/test text      | PASS — 0                  | Static content QA and live published-content checks                                                                  |
| Feedback/measurement       | PASS — runtime contract   | Attempt, wrong-answer retry, completion, GP and progress checks                                                      |

## 6 lesson checklist

| Family            | Published | Template/family | Teaching / example / application | Feedback / measurement | Turkish review        |
| ----------------- | --------- | --------------- | -------------------------------- | ---------------------- | --------------------- |
| ATTENTION_BURST   | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |
| RAPID_RECOGNITION | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |
| PHRASE_CHUNKING   | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |
| MAIN_IDEA         | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |
| DETAIL_EVIDENCE   | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |
| INFERENCE         | PASS      | PASS            | PASS                             | PASS — runtime/E2E     | HUMAN_REVIEW_REQUIRED |

`HUMAN_REVIEW_REQUIRED`, insan incelemesi yapılmadan PASS kabul edilmemelidir.

## İnsan QA checklist'i

### Passage

- [ ] Yaş grubuna uygun, doğal Türkçe — `HUMAN_REVIEW_REQUIRED`
- [ ] Hedef beceriyi gerçekten taşıyor — `HUMAN_REVIEW_REQUIRED`
- [ ] Gereksiz uzunluk/çeviri kokusu yok — `HUMAN_REVIEW_REQUIRED`
- [ ] Aynı passage gereksiz tekrar edilmiyor — `HUMAN_REVIEW_REQUIRED`

### Question

- [ ] Soru tek ve anlaşılır bir görevi ölçüyor — `HUMAN_REVIEW_REQUIRED`
- [ ] Soru passage ve teaching hedefiyle ilişkili — `HUMAN_REVIEW_REQUIRED`
- [ ] Cevap anahtarı ve explanation tutarlı — `HUMAN_REVIEW_REQUIRED`
- [ ] Yanlış cevap feedback'i cevabı ifşa etmeden yönlendiriyor — `HUMAN_REVIEW_REQUIRED`

### Turkish language

- [ ] Yazım ve noktalama kontrolü — `HUMAN_REVIEW_REQUIRED`
- [ ] Öğrenciye hitap ve ton tutarlı — `HUMAN_REVIEW_REQUIRED`
- [ ] Teknik stack/error text görünmüyor — otomatik UI kontrolü PASS; görsel insan kontrolü `HUMAN_REVIEW_REQUIRED`

### Distractors

- [ ] Yanlış seçenekler makul — `HUMAN_REVIEW_REQUIRED`
- [ ] Doğru seçenek yalnızca uzunluk/biçim ipucuyla seçilemiyor — `HUMAN_REVIEW_REQUIRED`
- [ ] Birden fazla seçenek istemeden doğru görünmüyor — `HUMAN_REVIEW_REQUIRED`

### Duplicate / repetition

- [ ] Passage ve soru kökleri gereksiz tekrar etmiyor — `HUMAN_REVIEW_REQUIRED`
- [ ] Altı ailede konu ve soru amacı çeşitliliği var — `HUMAN_REVIEW_REQUIRED`

## Pilot minimumu

Mevcut 6 lesson / 36 question teknik pilot smoke için yeterlidir. Her family için
en az 2 farklı passage, 2 farklı soru kalıbı ve 3 zorluk bandı korunmalıdır. Aynı
metni tekrar ettirmek yerine aynı beceriyi farklı konu, cümle yapısı ve soru amacıyla
ölçmek gerekir. Yeni content lifecycle altyapısı bu kapı için gerekli değildir.

## Event taxonomy notu

Mevcut `PilotEventType` enum'ı migration olmadan genişletilemez. Closure telemetry
mevcut canonical event'leri bounded `clientEventId` semantic key ile kullanır:

| Pilot sinyali          | Canonical event        | Semantic key             |
| ---------------------- | ---------------------- | ------------------------ |
| first training started | `EXERCISE_STARTED`     | `first-training-started` |
| placement started      | `ASSESSMENT_STARTED`   | `placement-started`      |
| placement completed    | `ASSESSMENT_COMPLETED` | `placement-completed`    |
| training completed     | `EXERCISE_COMPLETED`   | `training-completed`     |
| progress viewed        | `LEARNING_PATH_OPENED` | `progress-viewed`        |
| return session         | `TODAY_OPENED`         | `return-session`         |

`SIGNUP_STARTED`, authenticated endpoint signup tamamlanmadan önce çağrılamadığı
için gerçek event olarak üretilemez; `SIGNUP_COMPLETED` korunur. Pilot reporting
semantic key'leri ayrıştırmıyorsa bu, migration gerektiren ayrı bir eksiktir.
