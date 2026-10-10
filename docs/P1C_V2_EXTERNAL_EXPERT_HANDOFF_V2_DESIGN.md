# OkuPratik — P1-C V2 Dış Uzman İnceleme Paketi v2

**Belge sürümü:** `P1C_V2_EXTERNAL_EXPERT_HANDOFF_V2_DESIGN`  
**Durum:** `DESIGN_ONLY` — uzman incelemesine hazırlık  
**Kaynak commit:** `f1c8ab90ceec29a4cc129b406d4ab961d6548e31`  
**Önceki paket:** `P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN` korunur; bu belge yeni sürümlü pakettir.

> Bu paket, P1-C V2'nin 12 aday görevini dış uzmana aktarır. Hedef sınıf aralığı bu sürümde belirlenmemiştir. Uzman onayı, pilot tamamlanması, kalibrasyon veya production assignment kararı içermez.

## 1. İncelemenin amacı ve sınırları

Amaç, `INFERENCE`, `EVIDENCE_FINDING` ve `EVIDENCE_RELATION` boyutlarındaki 12 aday görevi madde düzeyinde incelemek; görevlerin hedeflediği yapıyı, Türkçe dil yükünü, yaş/sınıf uygunluğunu, kanıt ve cevap anahtarını ayrı ayrı değerlendirmektir.

İnceleme, ürün sahibinin şu kapsam kararıyla yürütülür:

- hedef sınıf aralığı henüz belirlenmemiştir;
- genel öğrenci kitlesi ile okuma becerisini geliştirmeye ihtiyaç duyan öğrenciler pilotta ayrı analiz grupları olarak incelenecektir;
- grup üyeliği P1-C cevaplarından, WPM'den, Antrenman verisinden, istemci puanından veya tek toplam puandan türetilmeyecektir;
- uzman, pilot, kalibrasyon ve korumalı production açılışı olmadan otomatik atama kapalıdır.

Bu belge V1 item bankasını, scorer'ı, mapping'i, published version'ları veya geçmiş sonuçları değiştirmez. V2 adaylarını production assessment hâline getirmez.

## 2. Sabitlenmiş kaynak manifesti

Uzman kararları aynı commit'teki immutable tasarım kaynaklarına dayanmalıdır:

- [V2 aday havuzu](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [Hedef öğrenci profili ve pilot kapsamı kararı](./P1C_V2_TARGET_POPULATION_DECISION_V1_DESIGN.md)
- [Önceki dış uzman paketi](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN.md)
- [V2 uzman inceleme formu](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN.md)
- [V2 pilot taslağı](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN.md)
- [Genel kalibrasyon protokolü](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1.md)

### 2.1 On iki görev için sabit kaynak bağlantıları

Her bağlantı aynı commit'teki aday havuzuna gider. Uzman, ilgili görev bloğunu kimliğiyle bulmalı; kaynak metni bu paket içine kopyalayıp değiştirmemelidir.

#### `INFERENCE`

- [V2C-INF-01 — Balkon saksılarında su kullanımı](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-02 — Kütüphane çalışma düzeni](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-03 — Mahalle kompost kutusu](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-04 — Bisiklet yolunda görünürlük](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

#### `EVIDENCE_FINDING`

- [V2C-EVF-01 — Okul bahçesinde gölge](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-02 — Otobüs durağında bekleme](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-03 — Mutfak atıklarının ayrılması](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-04 — Mahalle haritası](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

#### `EVIDENCE_RELATION`

- [V2C-REL-01 — Bitkinin ışık yönü](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-02 — Yağmur sonrası yaya yolu](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-03 — Sınıf kitaplığında ödünç alma](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-04 — Meyve kasalarının gölgede tutulması](https://github.com/gokcekmustafa/okuplus/blob/f1c8ab90ceec29a4cc129b406d4ab961d6548e31/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

## 3. Ürün sahibi alanları: hedef öğrenci profili

Bu alanlar uzman incelemesi başlamadan önce ürün sahibi/veri sorumlusu tarafından doldurulmalıdır:

| Alan                           | Değer                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Hedef yaş / sınıf aralığı      | **DOLDURULMADI — uzman önerisi bekleniyor**                                                 |
| Türkçe okuma profili           | **İki grup: genel öğrenci kitlesi; okuma becerisini geliştirmeye ihtiyaç duyan öğrenciler** |
| Grup üyeliği ölçütleri         | **DOLDURULMADI — P1-C cevaplarından bağımsız olmalı**                                       |
| Grup kodları ve anonimleştirme | **DOLDURULMADI**                                                                            |
| Etik/onam sorumlusu            | **DOLDURULMADI**                                                                            |

## 4. Uzmandan beklenen sınıf aralığı önerisi

Uzman, aralık önerisini karar, gerekçe ve belirsizlik olarak ayrı kaydetmelidir. Aşağıdaki sorular zorunlu inceleme başlıklarıdır:

- Maddelerin dil, cümle yapısı, çıkarım gereksinimi ve kanıt-iddia ilişkisi hangi yaş/sınıf aralığına uygun olabilir?
- Önerilen alt ve üst sınıf sınırlarının her biri hangi metin ve görev kanıtına dayanıyor?
- Daha geniş aralık kelime bilgisi, okuma gelişimi veya yönerge anlama bakımından hangi riskleri doğurur?
- Pilot tek bir sınıf bandında mı başlamalı, yoksa birden fazla sınıf bandına mı tabakalanmalı?
- Bu kararı güçlendirmek için hangi bilişsel görüşme veya pilot kanıtı gerekir?

Uzman kendi yaş/sınıf varsayımını ürün kararı gibi yazmamalı; kanıt yetersizse `PENDING_DATA` veya `PENDING_EXPERT_DECISION` kullanmalıdır.

## 5. Madde bazlı inceleme yönergesi

Her görev için mevcut form kullanılarak aşağıdaki kararlar ayrı verilir:

- `KEEP`, `REVISE`, `REJECT`, `PENDING_DATA` veya `PENDING_EXPERT_DECISION`;
- construct uygunluğu ve boyutlar arası bağımsızlık;
- Türkçe dil yükü, yaş/sınıf uygunluğu ve ön bilgi riski;
- metin, yönerge, seçenek, cevap anahtarı ve kanıt sürümünün tutarlılığı;
- çeldirici, ipucu, görev sırası ve cevap biçimi etkisi;
- eksik/belirsiz/çelişkili yanıtların runtime'da `REVIEW_REQUIRED` kalması.

### `INFERENCE`

Sonuç metinde açıkça verilmemeli, ancak metindeki bilgilerle desteklenmelidir. Uzman, dört seçenekli yapıdaki tek anlamlılığı, çeldirici makullüğünü ve kanıt cümlesinin cevabı doğrudan ele verip vermediğini inceler.

### `EVIDENCE_FINDING`

Claim sabit tutulmalı; görev öğrenciden claim'i yeniden üretmesini istememelidir. Doğru kanıtın tekil olup olmadığı, alternatif cümlelerin makullüğü ve cümle uzunluğu/kelime yükünün construct'ı gölgeleyip gölgelemediği incelenir.

### `EVIDENCE_RELATION`

Kanıt seçimi ile kanıtın claim'i destekleme biçimi ayrı tutulur. `LIMITED_SUPPORT` gözlem veya kısmi ilişkiyi ifade eder; doğrudan destek, karşılaştırma veya nedensellik varsayımla eklenmez. `evidenceCandidateId` ve `relationType` sözleşmesi sessizce çoğaltılamaz.

## 6. Dört `LIMITED_SUPPORT` maddesi

`V2C-REL-01`, `V2C-REL-02`, `V2C-REL-03` ve `V2C-REL-04` için mevcut tasarım hedefi `LIMITED_SUPPORT` olarak korunur. Her biri için uzman:

- seçilen adayın claim'in yalnızca izin verilen kapsamını destekleyip desteklemediğini;
- tek bir kanıt adayının yeterli olup olmadığını;
- `CAUSAL_SUPPORT` veya `DIRECT_SUPPORT` ipucunun istemeden oluşup oluşmadığını;
- relation etiketinin seçenek metniyle önceden ele verilip verilmediğini;
- görev iki ayrı response alanı gerektiriyorsa yeni sürüm ihtiyacını

ayrı gerekçelendirmelidir. Bu maddeler için bu belgede olumlu karar verilmemiştir.

## 7. İki pilot grubunun incelenmesi

Pilot planındaki gruplar:

1. `GENERAL_STUDENT_POPULATION`
2. `STUDENTS_NEEDING_READING_DEVELOPMENT`

Bu kodlar yalnız çalışma kodudur; öğrenciye görünen etiket değildir. Grup üyeliği P1-C cevapları, WPM, Antrenman, istemci puanı veya tek toplam skorla belirlenemez. Bağımsız ölçütler ve etik/onam onayı olmadan gerçek katılımcı verisi toplanmaz.

Uzman ve veri sorumlusu ayrıca şunları yazmalıdır:

- grupların birbirini dışlayıp dışlamadığı;
- grup ölçütlerinin kaynağı ve onay sahibi;
- her sınıf/yaş tabakasında iki grubun karşılaştırılabilirliği;
- örneklem dengesizliği veya eksik hücrelerin nasıl raporlanacağı;
- damgalayıcı yorumları ve gereksiz tanımlayıcı veriyi nasıl önleyecekleri.

Örneklem büyüklüğü, grup başına kişi sayısı ve istatistiksel eşik bu pakette belirlenmez.

## 8. Bağımsız inceleme ve anlaşmazlık kaydı

İki uzman önce birbirinden bağımsız olarak 12 görevi inceler. Her kayıt kaynak commit'i, task ID'sini, form sürümünü, kararı ve gerekçeyi taşır. Sonra yalnız anlaşmazlıklar için adjudication yapılır; ilk kararlar silinmez.

| Task ID                     | Rater A          | Rater B          | Fark türü        | Adjudication     | Gerekçe/sorumlu  |
| --------------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| 12 görev için tekrar edilir | **DOLDURULMADI** | **DOLDURULMADI** | **DOLDURULMADI** | **DOLDURULMADI** | **DOLDURULMADI** |

## 9. Etik, onam, veri güvenliği ve silme

Pilot öncesinde katılımcı/veli onamı, geri çekilme yolu, erişim rolleri, anonim `pilotParticipantId`, güvenli aktarım, saklama süresi, yedek kapsamı ve doğrulanabilir silme yöntemi yazılı olarak onaylanmalıdır. Production DB kullanılmaz; öğrenci veya tenant kimlikleri pakete alınmaz.

Pilot verisi route, level, progress veya production assignment üretmez. Üretken yapay zekâ nihai akademik puan veya kalibrasyon kararı yerine kullanılamaz.

## 10. Üç ayrı karar kapısı

### Kapı 1 — Uzman incelemesi

12 görev, hedef kitle soruları, iki rater kaydı, anlaşmazlık/adjudication kaydı ve uzman gerekçeleri tamamlanmalıdır.

**Durum:** `NOT_COMPLETED` — bu belge onay vermez.

### Kapı 2 — Pilot

Kapı 1, grup üyeliği ölçütleri, etik/onam, veri güvenliği, saklama/silme ve yaş/sınıf tabakalama planı tamamlanmadan pilot başlatılamaz.

**Durum:** `NOT_COMPLETED` — bu belge pilot başlatmaz.

### Kapı 3 — Kalibrasyon ve production release

Pilot analizi, rater anlaşması, sürüm manifesti, uzman kararı, veri sorumlusu kararı ve ayrı korumalı release onayı gerekir. Akademik kalibrasyon tamamlanmadan otomatik atama açılmaz.

**Durum:** `NOT_CALIBRATED` — bu belge kalibrasyon tamamlamaz.

## 11. Değişmez güvenlik durumu

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B, P1-C ve P1-D otomatik atamaları kapalı
- P0 22 adım, P1-A fallback, tenant isolation, tek aktif P1 ve teacher override audit korunur

Bu doküman ve testleri yalnız doküman bütünlüğünü doğrular; akademik geçerlilik veya kalibrasyon kanıtlamaz.
