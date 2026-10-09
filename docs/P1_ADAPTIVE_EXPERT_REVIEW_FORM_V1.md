# OkuPratik — P1 Adaptive Measurement Uzman İnceleme Formu v1

**Amaç:** Placement item'larının P1-B/C/D construct'larını ölçüp ölçmediğini, doğru cevap ve çeldiricilerin eğitimsel olarak savunulabilirliğini ve scorer/mapping sözleşmesine uygunluğunu uzman görüşüyle kaydetmek.

**Kullanım kuralı:** Bu form boş bir inceleme aracıdır. Önceden `approved` veya `production-ready` kararı içermez. Formun doldurulması tek başına calibration değildir; kararlar pilot/calibration protokolündeki veriyle birlikte değerlendirilir.

## 1. İnceleme kimliği

| Alan                     | Değer                                            |
| ------------------------ | ------------------------------------------------ |
| İnceleme paketi          | `P1_ADAPTIVE_MEASUREMENT_EVIDENCE_MATRIX_V1`     |
| Item bank                | `OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1` / `1.0.1` |
| Assessment               | `OKU-READING-PLACEMENT-V1` / `1.1.0`             |
| Mapping                  | `P1_ADAPTIVE_ITEM_MAPPING_V1`                    |
| Scoring contract         | `PLACEMENT_SCORING_CONTRACT_V1`                  |
| Uzman adı / kodu         | **Boş bırakılacak**                              |
| Uzmanlık alanı           | **Boş bırakılacak**                              |
| Dil / yaş grubu deneyimi | **Boş bırakılacak**                              |
| İnceleme tarihi          | **Boş bırakılacak**                              |
| Çıkar çatışması beyanı   | **Boş bırakılacak**                              |
| İnceleme sürümü          | **Boş bırakılacak**                              |

## 2. Karar kodları

Her item ve her evidence dimension için yalnızca bir karar seçilir:

- `APPROVE_AS_CANDIDATE`: teknik olarak aday; production kanıtı değildir.
- `REVISE`: construct veya madde/scorer/mapping revizyonu gerekli.
- `REJECT`: construct'ı ölçmüyor veya ciddi confound var.
- `NOT_APPLICABLE`: bu dimension için uygun değil.
- `PENDING_DATA`: uzman kararı için pilot/kalibrasyon verisi gerekli.

Uzman `APPROVE_AS_CANDIDATE` seçse bile route otomatik açılmaz. `CALIBRATED` ve `productionAssignmentEnabled=true` kararı ayrı bir release gate'tir.

## 3. Item-level inceleme

Her soru için [evidence matrix](./P1_ADAPTIVE_MEASUREMENT_EVIDENCE_MATRIX_V1.md) satırı esas alınır.

| Alan                                                                | Uzman notu                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable question ID                                                  |                                                                                                                                                                                      |
| Passage / içerik ID ve sürümü                                       |                                                                                                                                                                                      |
| Birincil Skill                                                      |                                                                                                                                                                                      |
| İncelenen P1 dimension                                              | `FLUENCY` / `ACCURACY` / `MEANING_PRESERVATION` / `TRANSFER` / `INFERENCE` / `EVIDENCE_FINDING` / `EVIDENCE_RELATION` / `CONTEXTUAL_MEANING` / `LEXICAL_RELATION` / `DOMAIN_CONTEXT` |
| Construct tanımı                                                    |                                                                                                                                                                                      |
| Soru construct ile gerçekten hizalı mı?                             | `APPROVE_AS_CANDIDATE` / `REVISE` / `REJECT` / `NOT_APPLICABLE` / `PENDING_DATA`                                                                                                     |
| Doğru cevap                                                         |                                                                                                                                                                                      |
| Doğru cevabın passage içindeki kanıtı                               |                                                                                                                                                                                      |
| Cevap anahtarı doğru ve tek anlamlı mı?                             |                                                                                                                                                                                      |
| Çeldiriciler makul, birbirinden ayrılabilir ve hatayı açıklıyor mu? |                                                                                                                                                                                      |
| Soru dili, yaş ve Türkçe uygunluğu                                  |                                                                                                                                                                                      |
| Soru türü confound'u                                                |                                                                                                                                                                                      |
| Tahmin/ezber/okuma becerisi dışı yük                                |                                                                                                                                                                                      |
| Evidence span doğrudan mı, dolaylı mı?                              |                                                                                                                                                                                      |
| Server scorer'ın ürettiği kanıt                                     |                                                                                                                                                                                      |
| Editorial mapping doğru mu?                                         |                                                                                                                                                                                      |
| Önerilen değişiklik                                                 |                                                                                                                                                                                      |
| Uzman gerekçesi                                                     |                                                                                                                                                                                      |
| Uzman kararı                                                        |                                                                                                                                                                                      |

### Item-level minimum kontrol listesi

- [ ] Stable ID, passage, question version ve mapping version birlikte kontrol edildi.
- [ ] Doğru cevap passage içinde gerçekten destekleniyor.
- [ ] Birden fazla seçeneğin savunulabilir olması engellendi.
- [ ] Çeldiriciler rastgele değil, anlamlı hata kaynaklarını temsil ediyor.
- [ ] `EVIDENCE_RELATION`, yalnızca `INFERENCE` etiketi tekrar edilerek verilmedi.
- [ ] B için doğru cevap, akıcılık/transfer/meaning preservation gibi ölçülmeyen boyutları varsaymıyor.
- [ ] D için genel kelime bilgisi, domain context yerine geçirilmedi.
- [ ] `timeSpentMs`, WPM veya Training sinyali tek başına akademik evidence olarak kullanılmıyor.

## 4. Dimension-level karar

### P1-B — Akıcılık ve Anlam

| Dimension              | Gerekli gerçek kanıt                                                                   | Mevcut item/scorer kanıtı                                            | Uzman kararı | Eksik veri / öneri |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ | ------------------ |
| `FLUENCY`              | Kontrollü metin okuma; hız, doğruluk ve metin koşulu birlikte; gerekiyorsa ses/prozodi | **Boş bırakılacak; mevcut placement cevapları bunu doğrudan ölçmez** |              |                    |
| `ACCURACY`             | Okuma sırasında doğru kelime/ifade işleme veya doğruluk görevi                         | **Boş bırakılacak; soru cevabı doğruluğu ile eşitlenemez**           |              |                    |
| `MEANING_PRESERVATION` | Tempo/okuma koşulu değişirken anlamın korunmasını gösteren ayrı görev                  | **Boş bırakılacak**                                                  |              |                    |
| `TRANSFER`             | Yeni metin/bağlamda hedef davranışın gecikmeli veya transfer göreviyle gösterimi       | **Boş bırakılacak**                                                  |              |                    |

**B kararı:** Dört boyutun tamamı ayrı ve güvenilir biçimde üretilmeden P1-B otomatik seçilemez.

### P1-C — Çıkarım ve Kanıt

| Dimension           | Gerekli gerçek kanıt                                           | Mevcut item/scorer kanıtı                                                         | Uzman kararı | Eksik veri / öneri |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------ | ------------------ |
| `INFERENCE`         | Passage kanıtından desteklenen sonucu seçme/kurma              | Mapping'li aday item'lar mevcut; calibration yok                                  |              |                    |
| `EVIDENCE_FINDING`  | Sonucu destekleyen metin parçasını bulma/eşleştirme            | Mapping'li detail/evidence adayları mevcut; doğrudanlık item bazında doğrulanmalı |              |                    |
| `EVIDENCE_RELATION` | Seçilen kanıtın seçilen sonucu neden desteklediğini ayrı kurma | Q006/Q013/Q018/Q030 mapping adayı; çıkarımdan bağımsızlığı kanıtlanmış değil      |              |                    |

**C özel kontrolü:** Aynı sorunun hem `INFERENCE` hem `EVIDENCE_RELATION` olarak etiketlenmesi, relation kanıtı için yeterli değildir. Uzman, öğrencinin kanıtı bulup sonucu seçmesinden ayrı olarak kanıt-sonuç bağını gerçekten kurup kurmadığını açıklamalıdır.

### P1-D — Kelime, Bağlam ve Alan Bilgisi

| Dimension            | Gerekli gerçek kanıt                                                        | Mevcut item/scorer kanıtı                             | Uzman kararı | Eksik veri / öneri |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ | ------------------ |
| `CONTEXTUAL_MEANING` | Bilinmeyen sözcük/ifadenin passage bağlamındaki anlamı                      | Mevcut placement bankası bu amaçla tasarlanmamış      |              |                    |
| `LEXICAL_RELATION`   | Sözcük/ifade ilişkisi, yapı veya anlam ilişkisini ayırt eden ayrı item seti | Mevcut mapping yok                                    |              |                    |
| `DOMAIN_CONTEXT`     | Alan bağlamında ön bilgi/terim kullanımının transferi                       | Mevcut mapping yok; genel kelime sorusu yerine geçmez |              |                    |

**D kararı:** Üç boyutun her biri için ayrı mapping, gerçek item kanıtı ve server scoring olmadan P1-D otomatik seçilemez.

## 5. Assessment-level inceleme

| Soru                                                                                | Uzman cevabı                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 36 maddelik form her dimension için yeterli coverage sağlıyor mu?                   |                                                                                  |
| Madde sırası/skill dağılımı construct'ı bozuyor mu?                                 |                                                                                  |
| Fiili item bankası tür dağılımı ile assessment manifest dağılımı uyumlu mu?         |                                                                                  |
| Minimum scored count ve eksik cevap policy'si eğitimsel olarak kabul edilebilir mi? |                                                                                  |
| Güvenirlik / standart hata / classification stability için hangi veri gerekli?      |                                                                                  |
| Dil, yaş, grade ve domain bias riski nedir?                                         |                                                                                  |
| Birden fazla dimension'da aynı item kullanımı geçerli mi?                           |                                                                                  |
| Route selection için hangi kanıtlar zorunlu, hangileri yardımcı?                    |                                                                                  |
| Calibration için önerilen karar                                                     | `NOT_READY` / `PILOT_REQUIRED` / `CALIBRATION_REVIEW` / `READY_FOR_GATED_REVIEW` |
| Genel gerekçe                                                                       |                                                                                  |

## 6. İmzalı sonuç

| Alan                            | Değer               |
| ------------------------------- | ------------------- |
| Uzman sonucu                    | **Boş bırakılacak** |
| İkinci uzman sonucu             | **Boş bırakılacak** |
| Anlaşmazlık çözümü              | **Boş bırakılacak** |
| Veri sorumlusu onayı            | **Boş bırakılacak** |
| Product/engineering gate kararı | **Boş bırakılacak** |
| Tarih ve sürüm                  | **Boş bırakılacak** |
