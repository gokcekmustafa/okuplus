# OkuPratik — P1 Adaptive Measurement Evidence Matrix v1

**Durum:** Uzman inceleme paketi / kalibrasyon öncesi
**Hazırlanma amacı:** Canonical placement bankasındaki her maddenin P1-B/C/D route-need kanıtı olarak neyi gerçekten desteklediğini izlenebilir biçimde ayırmak.
**Bu belge production calibration onayı değildir.** Aşağıdaki `aday` ifadeleri yalnızca teknik/editorial inceleme adaylığını gösterir; uzman kararı ve pilot veri olmadan route selector açılmaz.

## 1. Kaynak ve değişmezler

| Alan                     | Mevcut canonical değer                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Item bank                | `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1` / `1.0.1`                                                                 |
| Assessment               | `OKU-READING-PLACEMENT-V1` / `1.1.0`                                                                             |
| Assessment yaşam döngüsü | `DESIGN_ONLY`                                                                                                    |
| Measurement durumu       | `NOT_CALIBRATED`                                                                                                 |
| Production assignment    | `false`                                                                                                          |
| Passage / soru           | 12 / 36                                                                                                          |
| Beceri dağılımı          | `RC_MAIN_IDEA` 12, `RC_DETAIL` 12, `RC_INFERENCE` 12                                                             |
| Soru türleri             | Item bankası ve assessment manifesti birlikte: 9 `MULTIPLE_CHOICE`, 9 `TRUE_FALSE`, 9 `MATCHING`, 9 `FILL_BLANK` |
| Scoring                  | sunucu tarafı, ham skor 0–1, exact answer contract, minimum 24 scored item                                       |
| Mevcut mapping           | `P1_ADAPTIVE_ITEM_MAPPING_V1`; yalnızca C ailesine aday dimension etiketleri içeriyor                            |

**Kaynak otoriteleri:** Soru metni, passage, answer key, evidence span ve soru metadata'sı için [`canonical-placement-item-bank.ts`](../src/curriculum/canonical-placement-item-bank.ts); item mapping için [`adaptive-placement-item-mapping.ts`](../src/curriculum/adaptive-placement-item-mapping.ts); puanlama için [`placement-scoring.ts`](../src/modules/assessments/placement-scoring.ts). Bu belgede aynı alanlar yeniden tanımlanmaz; drift oluşursa kod kaynağı geçerlidir.

**Contract düzeltmesi:** Önceki `24/6/6` metadata hatası giderildi. Assessment manifesti artık dağılımı canonical item bankasından türetiyor ve `FILL_BLANK`'ı açıkça içeriyor. Published graph/version kayıtları overwrite edilmedi; eski metadata ile karşılaşan bootstrap planı `CONFLICT` döndürmeye devam ediyor.

## 2. İnceleme kararları

- `C-aday`: Mapping, soru becerisi ve passage içi kanıt birlikte C boyutuna adaylık sağlıyor; doğrudan ölçme iddiası ve route seçimi için uzman incelemesi gerekir.
- `C-relation-review`: `EVIDENCE_RELATION` mapping'i var; ancak çıkarım ile kanıt-sonuç ilişkisinin ayrı bir construct olarak gerçekten ölçüldüğü henüz kabul edilmemiştir.
- `C-desteklenmiyor`: Teknik mapping yok veya soru mevcut haliyle gerekli C boyutunu ayırt etmiyor.
- `B-desteklenmiyor`: Bu bankada kontrollü okuma akıcılığı, doğruluk, anlamın korunumu ve transferi ayrı ayrı üretilemez. Doğru/yanlış cevabı B'nin tamamı sayılmaz.
- `D-desteklenmiyor`: Bu bankada bağlamsal anlam, sözcük ilişkisi ve alan bağlamı için güvenilir, ayrı mapping ve scorer yoktur.
- `uzman + pilot`: C adayları dahil tüm kararlar; madde-construct uyumu, çeldirici kalitesi, dil/yaş uygunluğu ve ölçüm güvenirliği incelenmeden production kanıtı değildir.

## 3. 36 maddelik izlenebilir matris

`Cevap anahtarı` kod manifestindeki answer key'in kısa gösterimidir: `b` option id, `D/Y` true/false, `metin` kabul edilen fill-blank yanıtı, `l→r` matching çiftleridir. Scorer her zaman canonical answer contract'ını kullanır; bu tablo yeni bir answer key değildir.

| ID   | Passage                                | Skill / bilişsel talep | Tür / doğru cevap                 | Soru özeti                                          | Mevcut mapping                | Kanıt ve scorer yorumu                                                                                        | Karar             |
| ---- | -------------------------------------- | ---------------------- | --------------------------------- | --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------- |
| Q001 | C001 Filtrede Kalan Lifler             | MAIN_IDEA / UNDERSTAND | MC / `b`                          | Metnin ana düşüncesi                                | —                             | Ana fikir seçimi; C'nin üç resmi boyutundan birini doğrudan ayırt etmiyor.                                    | C-desteklenmiyor  |
| Q002 | C001                                   | DETAIL / RECALL        | TF / `D`                          | Aynı miktar suyla filtre karşılaştırması            | EVIDENCE_FINDING              | Passage içindeki açık ayrıntı; server exact-match doğru/yanlış. Kanıt bulma adayı, uzman doğrulaması gerekir. | C-aday            |
| Q003 | C001                                   | INFERENCE / INFER      | FB / `sınamak`                    | Tek denemeyi yeterli görmeme nedeni                 | INFERENCE                     | Gerekçeli sonuç çıkarma adayı; fill-blank eşdeğer cevap ve passage kanıtı uzman tarafından kontrol edilmeli.  | C-aday            |
| Q004 | C002 Kütüphanede Sessiz Bir Yol        | MAIN_IDEA / UNDERSTAND | TF / `D`                          | Düzenlemenin iki alanı ayırma amacı                 | —                             | Ana fikir/amaç; mevcut C mapping yok.                                                                         | C-desteklenmiyor  |
| Q005 | C002                                   | DETAIL / RECALL        | FB / `duvar kenarına`             | Kitap arabalarının konumu                           | EVIDENCE_FINDING              | Açık metin ayrıntısı; kanıt bulma adayı, tek başına inference değildir.                                       | C-aday            |
| Q006 | C002                                   | INFERENCE / INFER      | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Düzenlemeleri amaçlarıyla eşleştirme                | INFERENCE + EVIDENCE_RELATION | Çıkarım adayıdır; relation etiketi var ama bağımsız relation construct'ı henüz kanıtlanmış değildir.          | C-relation-review |
| Q007 | C003 Bahçedeki Ziyaretçiler            | MAIN_IDEA / UNDERSTAND | FB / `araştırma`                  | Kanıta dayalı çalışma                               | —                             | Genel yaklaşım/özet; mevcut C mapping yok.                                                                    | C-desteklenmiyor  |
| Q008 | C003                                   | DETAIL / UNDERSTAND    | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Gözlem kayıtlarının kullanım amacı                  | EVIDENCE_FINDING              | Metinde açıkça bulunan kayıtları amaçla eşleştirir; mapping adayı.                                            | C-aday            |
| Q009 | C003                                   | INFERENCE / INFER      | MC / `b`                          | Çalışmayı tekrarlama nedeni                         | INFERENCE                     | Sınırlılıkları birleştiren çıkarım adayı; scorer doğru/yanlış kanıtı verir, construct kalibrasyonu eksik.     | C-aday            |
| Q010 | C004 Bulut Günlüğü                     | MAIN_IDEA / UNDERSTAND | MC / `b`                          | Gözlem çalışmasının özeti                           | —                             | Özetleme; mevcut C mapping yok.                                                                               | C-desteklenmiyor  |
| Q011 | C004                                   | DETAIL / RECALL        | FB / `yönünü/yonunu`              | Rüzgâr bilgisi                                      | EVIDENCE_FINDING              | Açık ayrıntı; kanıt bulma adayı, imla kabul listesi ayrıca uzman incelemesi ister.                            | C-aday            |
| Q012 | C004                                   | INFERENCE / INFER      | TF / `D`                          | Sabah-akşam kayıtlarının güvenilirlik katkısı       | INFERENCE                     | Yöntemsel çıkarım adayı; tek TF item ile route kararı verilmez.                                               | C-aday            |
| Q013 | C005 Bisiklet İstasyonlarının Haritası | MAIN_IDEA / UNDERSTAND | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Bulguları sonuçlarıyla eşleştirme                   | EVIDENCE_RELATION             | Relation adayı; çıkarım boyutundan bağımsız ölçüldüğü uzman tarafından doğrulanmalı.                          | C-relation-review |
| Q014 | C005                                   | DETAIL / RECALL        | TF / `Y`                          | Yalnızca toplam sayının kaydedilmesi                | EVIDENCE_FINDING              | Açık ayrıntı/negatif ifade; kanıt bulma adayı, çeldirici analizi gerekir.                                     | C-aday            |
| Q015 | C005                                   | INFERENCE / INFER      | MC / `b`                          | Saatlere göre bisiklet dağıtımı                     | INFERENCE                     | Veri deseninden uygulama çıkarma adayı; server skorundan akademik eşik üretilemez.                            | C-aday            |
| Q016 | C006 Kıyının Altındaki Çayır           | MAIN_IDEA / UNDERSTAND | TF / `D`                          | Başka çevresel etkenleri dikkate alma               | —                             | Ana yaklaşım/özet; mapping yok.                                                                               | C-desteklenmiyor  |
| Q017 | C006                                   | DETAIL / RECALL        | MC / `b`                          | Her alanda aynı tutulan değişken                    | EVIDENCE_FINDING              | Açık yöntem ayrıntısı; kanıt bulma adayı.                                                                     | C-aday            |
| Q018 | C006                                   | INFERENCE / INFER      | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Bulguları temkinli yorumla eşleştirme               | INFERENCE + EVIDENCE_RELATION | İki label var; relation'ın çıkarımdan bağımsızlığı gösterilmeden C relation kanıtı sayılmaz.                  | C-relation-review |
| Q019 | C007 Müzede Sesli Rehber               | MAIN_IDEA / UNDERSTAND | FB / `düzenlemiştir`              | Geri bildirimle uygulamayı değiştirme               | —                             | Ana fikir/uyarlama; mapping yok.                                                                              | C-desteklenmiyor  |
| Q020 | C007                                   | DETAIL / UNDERSTAND    | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Rehber özellikleri ve işlevleri                     | EVIDENCE_FINDING              | Açık bilgi eşleştirme adayı; item construct review gerekli.                                                   | C-aday            |
| Q021 | C007                                   | INFERENCE / INFER      | MC / `b`                          | Fiziksel incelemeyi kaldırmama nedeni               | INFERENCE                     | Metin amacı ve sonuçlarını bağlayan çıkarım adayı.                                                            | C-aday            |
| Q022 | C008 Sınıf Bitkileri Deneyi            | MAIN_IDEA / UNDERSTAND | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Deney uygulamalarını amaçlarıyla eşleştirme         | —                             | Yöntem bilgisi; mevcut C mapping yok.                                                                         | C-desteklenmiyor  |
| Q023 | C008                                   | DETAIL / RECALL        | FB / `nemini`                     | Kaydedilen ölçümler                                 | EVIDENCE_FINDING              | Açık ayrıntı; kanıt bulma adayı.                                                                              | C-aday            |
| Q024 | C008                                   | INFERENCE / INFER      | TF / `D`                          | Sonucu tüm bitkilere genellememe                    | INFERENCE                     | Sınırlılık çıkarımı adayı; tek item route kararı veremez.                                                     | C-aday            |
| Q025 | C009 Geceleri Kaydedilen Işık          | MAIN_IDEA / INFER      | MC / `b`                          | Arşiv çalışmasının özeti                            | —                             | Ana fikir/amaç; mapping yok.                                                                                  | C-desteklenmiyor  |
| Q026 | C009                                   | DETAIL / UNDERSTAND    | TF / `D`                          | Farklı kayıtları ve araç hassasiyetini dikkate alma | EVIDENCE_FINDING              | Metodolojik ayrıntı adayı; doğrudan kanıt bulma.                                                              | C-aday            |
| Q027 | C009                                   | INFERENCE / INFER      | FB / `kesin kanıtı`               | Kayıt neden kesin keşif sayılamaz                   | INFERENCE                     | Sınırlılık ve kanıt gücü çıkarımı adayı; accepted answer yorumu uzman kontrolü ister.                         | C-aday            |
| Q028 | C010 Mahalle Sözcüklerinin Haritası    | MAIN_IDEA / INFER      | TF / `D`                          | Belirsizlikleriyle belgelemek                       | —                             | Ana yaklaşım; mapping yok.                                                                                    | C-desteklenmiyor  |
| Q029 | C010                                   | DETAIL / UNDERSTAND    | MC / `b`                          | Yaygınlık iddiasının iki dayanağı                   | EVIDENCE_FINDING              | İki metin dayanağını birleştirme adayı; çeldirici ve kanıt seçimi review ister.                               | C-aday            |
| Q030 | C010                                   | INFERENCE / INFER      | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Bulguları izin verilen yorumlarla eşleştirme        | INFERENCE + EVIDENCE_RELATION | Relation adayı; relation ve inference bağımsızlığı kalibrasyonla gösterilmeli.                                | C-relation-review |
| Q031 | C011 Kumulların Gece Işığı             | MAIN_IDEA / INFER      | FB / `benimsemiştir`              | Güvenlik ve canlı davranışını birlikte gözetme      | —                             | Ana sonuç/özet; mapping yok.                                                                                  | C-desteklenmiyor  |
| Q032 | C011                                   | DETAIL / UNDERSTAND    | MATCH / `l1→r2,l2→r4,l3→r1,l4→r3` | Ayrıntıları işlevleriyle eşleştirme                 | EVIDENCE_FINDING              | Açık ayrıntı eşleştirme adayı; item review gerekli.                                                           | C-aday            |
| Q033 | C011                                   | INFERENCE / INFER      | MC / `b`                          | Lambaları tamamen kaldırmama nedeni                 | INFERENCE                     | Trade-off çıkarımı adayı; scorer yalnızca cevap doğruluğu üretir.                                             | C-aday            |
| Q034 | C012 Haritadaki Görünmeyen Ayrıntı     | MAIN_IDEA / INFER      | MATCH / `l1→r2,l2→r3,l3→r1,l4→r4` | Harita seçimi ve sonuçları                          | —                             | Amaç-koşul ilişkisi; mevcut C mapping yok.                                                                    | C-desteklenmiyor  |
| Q035 | C012                                   | DETAIL / UNDERSTAND    | FB / `dar geçitlerin`             | Acil rota için kontrol edilmesi gereken ayrıntı     | EVIDENCE_FINDING              | Açık metin ayrıntısı; kanıt bulma adayı.                                                                      | C-aday            |
| Q036 | C012                                   | INFERENCE / INFER      | TF / `Y`                          | Ayrıntı eksikliği her kullanımda hata mı            | INFERENCE                     | Amaç ve ayrıntı düzeyini birleştiren çıkarım adayı.                                                           | C-aday            |

## 4. Boyut bazında mevcut iddia sınırı

| Route | Gerekli boyut          | Bu bankada doğrudan güvenilir kanıt                                                      | Mevcut karar                      |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| P1-B  | `FLUENCY`              | Kontrollü bağlı okuma, akıcılık/prozodi veya zamanın metin koşullarıyla yorumlanması yok | Desteklenmiyor; route kapalı      |
| P1-B  | `ACCURACY`             | Soru cevabı doğruluğu var; bu tek başına okuma doğruluğu construct'ı değildir            | Ayrı ölçüm olmadan desteklenmiyor |
| P1-B  | `MEANING_PRESERVATION` | Cevap doğruluğu ve passage soruları var; anlamın korunumu bağımsız tasarlanmamış         | Desteklenmiyor                    |
| P1-B  | `TRANSFER`             | Yeni metne/bağlama gecikmeli veya transfer görevi yok                                    | Desteklenmiyor                    |
| P1-C  | `INFERENCE`            | Mapping'li adaylar + server raw score; calibration yok                                   | Teknik aday, production kapalı    |
| P1-C  | `EVIDENCE_FINDING`     | Açık passage ayrıntısı isteyen adaylar + server raw score; construct review yok          | Teknik aday, production kapalı    |
| P1-C  | `EVIDENCE_RELATION`    | Q006/Q013/Q018/Q030 etiketli; bağımsız relation kanıtı henüz doğrulanmadı                | Review gerekli, production kapalı |
| P1-D  | `CONTEXTUAL_MEANING`   | Kelimeyi bağlamda anlamlandıran özel item/mapping yok                                    | Desteklenmiyor; route kapalı      |
| P1-D  | `LEXICAL_RELATION`     | Sözcük/ifade ilişkisini ayrı ölçen item seti yok                                         | Desteklenmiyor; route kapalı      |
| P1-D  | `DOMAIN_CONTEXT`       | Alan bilgisi transferini ölçen item seti yok                                             | Desteklenmiyor; route kapalı      |

## 5. Ürün ve scorer kararı

1. Bu 36 madde, C için teknik/editorial adaylar üretir; mapping label'ı akademik kanıt değildir.
2. C `EVIDENCE_RELATION`, yalnızca `INFERENCE` ile aynı maddede etiketlendiği için bağımsız kanıt kabul edilmemelidir. Ayrı relation görevi veya uzman kararı gerekir.
3. B ve D için mevcut item bankasından dolaylı skor türetmek yasaktır.
4. Eksik, çelişkili, yanlış sürümlü veya tamamlanmamış kanıt `REVIEW_REQUIRED` kalır.
5. `calibrationStatus=NOT_CALIBRATED` veya `productionAssignmentEnabled=false` iken hiçbir B/C/D route'u otomatik atanamaz. P1-A fallback'i ve P0 22-step davranışı bu belgeyle değişmez.
6. Yeni item/mapping üretilecekse mevcut bankaya sessizce ekleme yapılmaz; yeni manifest/mapping sürümü, answer key, scorer contract, uzman incelemesi ve pilot kararı gerekir.

## 6. İnceleme kayıt alanı

Her satır için uzman aşağıdaki kararı ayrı vermelidir: `approved`, `revise`, `reject`, `not applicable`, `pending`. Karar; construct tanımı, doğru cevap gerekçesi, passage kanıtı, çeldirici analizi, yaş/dil uygunluğu ve olası confound ile birlikte [uzman inceleme formuna](./P1_ADAPTIVE_EXPERT_REVIEW_FORM_V1.md) işlenir.
