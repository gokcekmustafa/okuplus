# OkuPratik — P1 Adaptive Production Readiness Gate v1

**Kapsam:** P1-B/C/D adaptive route need ve placement measurement
**Mevcut karar:** `NOT_CALIBRATED`; `productionAssignmentEnabled=false`
**Amaç:** Teknik scorer'ın varlığını akademik olarak doğrulanmış production route seçimiyle karıştırmamak.

## 1. Mevcut canonical durum

| Bileşen               | Durum                       | Yorum                                                                                                    |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| P0                    | Aktif canonical akış        | 22 step linear progression korunur                                                                       |
| P1-A                  | Balanced fallback/candidate | P0 geçmişini ve tek aktif P1 kuralını bozmaz                                                             |
| P1-B                  | Kapalı                      | Fluency, accuracy, meaning preservation, transfer ayrı güvenilir kanıt değil                             |
| P1-C                  | Teknik aday                 | INFERENCE ve EVIDENCE_FINDING adayları var; EVIDENCE_RELATION bağımsızlığı ve akademik calibration eksik |
| P1-D                  | Kapalı                      | Contextual meaning, lexical relation, domain context için güvenilir item/scorer yok                      |
| Item bank             | `DESIGN_ONLY`               | `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1` / `1.0.1`                                                         |
| Assessment            | `DESIGN_ONLY`               | `OKU-READING-PLACEMENT-V1` / `1.1.0`                                                                     |
| Measurement           | `NOT_CALIBRATED`            | Route selection gate'i kapalı                                                                            |
| Production assignment | `false`                     | B/C/D otomatik atanamaz                                                                                  |

## 2. Zorunlu kapılar

Bir B/C/D route'u ancak bütün ilgili kapılar geçilirse `production-ready` kabul edilebilir:

### Kimlik ve içerik

- [ ] Item bank, passage, question, template ve answer key sürümleri immutable ve birlikte kaydedildi.
- [ ] Assessment manifest ile item bank fiili dağılımı/türleri uyumlu; açık mismatch yok.
- [ ] Her required dimension için gerçek Türkçe item coverage var.
- [ ] Her item'ın doğru cevap ve passage evidence'ı uzman tarafından onaylandı.
- [ ] Çeldiriciler ve dil/yaş uygunluğu incelendi.

### Scoring ve mapping

- [ ] Mapping version doğru bankaya strict eşleşiyor.
- [ ] Server scorer yalnızca canonical question version ve trusted mapping kullanıyor.
- [ ] C `EVIDENCE_RELATION`, INFERENCE'ın tekrarı olarak sayılmıyor.
- [ ] B'de dört boyut, D'de üç boyut ayrı kanıtlanıyor.
- [ ] Client payload, Training/WPM veya tek aggregate score route selector'a girmiyor.
- [ ] Null, incomplete, ambiguous, conflicting veya yanlış sürümlü sonuç `REVIEW_REQUIRED` üretiyor.

### Akademik calibration

- [ ] Uzman inceleme formu tamamlandı.
- [ ] Pilot protokolü uygulandı ve veri kimliklendirme/saklama kuralları sağlandı.
- [ ] Her dimension için yeterli coverage, ölçüm belirsizliği ve classification stability değerlendirildi.
- [ ] Threshold/decision rule uzman ve veriyle gerekçelendirildi; ürün tarafından icat edilmedi.
- [ ] C relation için bağımsız kanıt gösterildi.
- [ ] B transfer ve meaning preservation, doğruluk/response time yerine geçirilmedi.
- [ ] D domain context, genel kelime puanına indirgenmedi.

### Product/release güvenliği

- [ ] `calibrationStatus=CALIBRATED` yalnızca onaylı karar kaydıyla ayarlandı.
- [ ] `productionAssignmentEnabled=true` yalnızca aynı sürüm seti için açıldı.
- [ ] P0 tamamlanmadan P1 assignment mümkün değil.
- [ ] Aynı anda tek aktif P1 ve assignment idempotency korunuyor.
- [ ] Teacher override yetki ve audit izi korunuyor.
- [ ] Tenant isolation, path/step scoped progress ve P0 22-step regresyonları yeşil.
- [ ] Geri alma planı yeni assignment'ları durduruyor; geçmiş sonuçları yeniden yazmıyor.
- [ ] Protected provisioning/migration/release akışı kullanıldı; manuel SQL/seed/write yok.

## 3. Route karar kartları

### P1-B — Akıcılık ve Anlam

**Gerekli:** `FLUENCY`, `ACCURACY`, `MEANING_PRESERVATION`, `TRANSFER`.

Mevcut 36 maddelik placement bankasında bunları ayrı ve güvenilir üreten kontrollü okuma, anlam korunumu veya transfer görevleri bulunmuyor. Bu nedenle doğru/yanlış cevap, response time veya Training/WPM üzerinden B açılmaz.

**Karar: `REVIEW_REQUIRED` / production kapalı.**

### P1-C — Çıkarım ve Kanıt

**Gerekli:** `INFERENCE`, `EVIDENCE_FINDING`, `EVIDENCE_RELATION`.

Mevcut bankada C aday mapping'leri var. Bu durum teknik kanıt üretilebildiğini gösterir; ancak mapping label'ları, relation construct'ının bağımsızlığını ve route kararının akademik kalibrasyonunu kanıtlamaz.

**Karar: Teknik aday / akademik calibration bekliyor / production kapalı.**

### P1-D — Kelime, Bağlam ve Alan Bilgisi

**Gerekli:** `CONTEXTUAL_MEANING`, `LEXICAL_RELATION`, `DOMAIN_CONTEXT`.

Mevcut bankada bu üç dimension için trusted item mapping ve ayrı scorer kanıtı yok. Genel detail/inference sorularından D skoru türetilemez.

**Karar: `REVIEW_REQUIRED` / production kapalı.**

## 4. Fail-closed davranışın korunması

Aşağıdaki durumlar otomatik route assignment'ı engeller ve `REVIEW_REQUIRED` olarak kalır:

- `NOT_CALIBRATED` scoring contract;
- `productionAssignmentEnabled=false`;
- eksik required dimension;
- yanlış veya eski item mapping sürümü;
- tamamlanmamış assessment/session;
- null/ambiguous/çelişkili server score;
- route selection kararının yalnızca client, Training veya WPM sinyaline dayanması;
- aynı anda başka aktif P1 olması;
- P0 tamamlanmamış olması.

Bu kapılar P1-A fallback'ini, P0 history'sini, P0 22-step linear davranışını veya mevcut Training/Assignment/Measurement ayrımını gevşetmez.

## 5. Kalan gerçek dış bağımlılıklar

Bu belgeyle çözülemeyen ve üretimde uydurulmaması gereken bağımlılıklar:

1. Ölçme-değerlendirme uzmanının item/dimension kararları;
2. Türkçe hedef yaş grubundan pilot veri;
3. B için kontrollü fluency/meaning preservation/transfer görevi ve scorer'ı;
4. D için contextual meaning/lexical relation/domain context item seti ve scorer'ı;
5. C için EVIDENCE_RELATION bağımsızlığını doğrulayacak görev ve calibration;
6. item bankası ile assessment manifestindeki soru türü dağılımı mismatch'inin çözümü;
7. bu kararların protected release kaydına bağlanması.

**Sonuç:** Uzman ve veri kanıtı gelmeden B/C/D'yi seçilebilir göstermek, route need classifier'ı akademik olarak kalibre edilmiş gibi sunmak veya eşik uydurmak güvenli değildir. Mevcut production davranışı fail-closed kalmalıdır.
