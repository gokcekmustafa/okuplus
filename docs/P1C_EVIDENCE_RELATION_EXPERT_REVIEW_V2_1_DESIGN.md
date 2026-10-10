# OkuPratik — P1-C V2.1 Dış Uzman İnceleme Formu

**Belge sürümü:** `P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_1_DESIGN`  
**Durum:** `DESIGN_ONLY` — boş inceleme formu  
**Kaynak commit:** `f1c8ab90ceec29a4cc129b406d4ab961d6548e31`  
**Aday görev kapsamı:** 12 görev; dört `INFERENCE`, dört `EVIDENCE_FINDING`, dört `EVIDENCE_RELATION`

> Bu form, önceki `P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN` belgesinin yeni sürümlü devamıdır; önceki belge değiştirilmez. Formun doldurulması uzman onayı veya kalibrasyon tamamlanması değildir.

## 1. İnceleme kimliği ve kaynak bütünlüğü

| Alan                           | Değer                                             |
| ------------------------------ | ------------------------------------------------- |
| Uzman kodu                     | **DOLDURULMADI**                                  |
| Kurum/uzmanlık                 | **DOLDURULMADI**                                  |
| İnceleme tarihi                | **DOLDURULMADI**                                  |
| İncelenen kaynak commit'i      | `f1c8ab90ceec29a4cc129b406d4ab961d6548e31`        |
| Hedef popülasyon belgesi       | `P1C_V2_TARGET_POPULATION_DECISION_V1_DESIGN`     |
| Handoff sürümü                 | `P1C_V2_EXTERNAL_EXPERT_HANDOFF_V2_DESIGN`        |
| Bu form sürümü                 | `P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_1_DESIGN` |
| İncelenen item/mapping version | **DOLDURULMADI**                                  |

Kaynak commit, task ID veya version eşleşmesi doğrulanamıyorsa karar `PENDING_DATA` olmalıdır.

## 2. Karar sözlüğü

Her task için bir ana karar ve gerekçe girilir:

- `KEEP`: Tasarım düzeyinde açık bir düzeltme ihtiyacı görülmedi.
- `REVISE`: Sorun var; yeni sürüm ve gerekçeli revizyon gerekir.
- `REJECT`: Görev construct veya güvenlik açısından bu havuzda tutulmamalı.
- `PENDING_DATA`: Hedef popülasyon, dil profili, kanıt veya sürüm bilgisi eksik.
- `PENDING_EXPERT_DECISION`: Uzmanlar arası veya akademik yorum kararı bekliyor.

Bu kararlar runtime `READY` sonucu değildir. Eksik, belirsiz, çelişkili veya sürümü doğrulanamayan cevaplar için güvenli runtime sonucu `REVIEW_REQUIRED` kalır.

## 3. Ürün sahibi ve hedef öğrenci alanları

Uzman kendi varsayımıyla doldurmaz; eksikliği işaretler ve gerekçeli önerisini ayrı yazar.

| Alan                            | Ürün sahibi/veri sorumlusu | Uzman önerisi    | Gerekçe ve belirsizlik |
| ------------------------------- | -------------------------- | ---------------- | ---------------------- |
| Hedef alt sınıf sınırı          | **DOLDURULMADI**           | **DOLDURULMADI** | **DOLDURULMADI**       |
| Hedef üst sınıf sınırı          | **DOLDURULMADI**           | **DOLDURULMADI** | **DOLDURULMADI**       |
| Türkçe okuma profili            | İki analiz grubu           | **DOLDURULMADI** | **DOLDURULMADI**       |
| Grup üyeliği bağımsız ölçütleri | **DOLDURULMADI**           | **DOLDURULMADI** | **DOLDURULMADI**       |
| Gerekli ön bilgi                | **DOLDURULMADI**           | **DOLDURULMADI** | **DOLDURULMADI**       |

### 3.1 Zorunlu sınıf aralığı soruları

1. Maddelerin dil, cümle yapısı, çıkarım gereksinimi ve kanıt-iddia ilişkisi hangi yaş/sınıf aralığına uygun olabilir?
2. Önerilen alt ve üst sınıf sınırlarının metin ve görev bazlı gerekçesi nedir?
3. Daha geniş yaş aralığı kelime bilgisi, okuma gelişimi veya yönerge anlama bakımından hangi riskleri doğurur?
4. Pilot tek bir sınıf bandında mı başlamalı, yoksa birden fazla bandı tabakalı olarak mı incelemelidir?
5. Öneriyi güçlendirmek için hangi bilişsel görüşme veya pilot kanıtı gerekir?

**Uzman önerisi:** **DOLDURULMADI**  
**Gerekçe:** **DOLDURULMADI**  
**Belirsizlik/alternatifler:** **DOLDURULMADI**

## 4. Madde düzeyi form

Bu bölüm 12 task ID'nin her biri için ayrı doldurulur.

| Alan                                | Kayıt                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Task ID                             | **DOLDURULMADI**                                                          |
| Boyut                               | `INFERENCE` / `EVIDENCE_FINDING` / `EVIDENCE_RELATION`                    |
| Passage version                     | **DOLDURULMADI**                                                          |
| Item/mapping/scoring version        | **DOLDURULMADI**                                                          |
| Ana karar                           | `KEEP` / `REVISE` / `REJECT` / `PENDING_DATA` / `PENDING_EXPERT_DECISION` |
| Construct gerekçesi                 | **DOLDURULMADI**                                                          |
| Kanıt ve cevap anahtarı gerekçesi   | **DOLDURULMADI**                                                          |
| Dil/yaş/sınıf gerekçesi             | **DOLDURULMADI**                                                          |
| Ön bilgi ve erişilebilirlik riski   | **DOLDURULMADI**                                                          |
| Çeldirici/ipucu riski               | **DOLDURULMADI**                                                          |
| Revizyon veya yeni version ihtiyacı | **DOLDURULMADI**                                                          |

Her görev için şu sorular yanıtlanır:

- Yönerge tek bir construct'ı mı istiyor?
- Doğru cevap metinden savunulabilir ve tek anlamlı mı?
- Çeldiriciler makul mi; biçimsel ipucu var mı?
- Cevap biçimi gereksiz yazma, çalışma belleği veya dil yükü ekliyor mu?
- Görev, hedef yaş/sınıf ve Türkçe profil için hangi kanıta dayanıyor?
- Eksik veya belirsiz yanıt güvenli biçimde `REVIEW_REQUIRED` kalıyor mu?

## 5. Boyut bazlı kontrol

### 5.1 `INFERENCE`

- Metinde açıkça bulunmayan fakat metinle desteklenen sonuç isteniyor mu?
- Dört seçenek aynı dil ve uzunluk yükünde mi?
- Birden çok seçenek aynı çıkarımı savunulabilir biçimde ifade ediyor mu?
- Kanıt cümlesi doğru çıkarımı doğrudan ele veriyor mu?
- Görev genel dünya bilgisini veya kelime tanımayı asıl construct'ın önüne geçiriyor mu?

**Boyut kararı:** **DOLDURULMADI**  
**Gerekçe:** **DOLDURULMADI**

### 5.2 `EVIDENCE_FINDING`

- Claim görev içinde sabit ve anlaşılır mı?
- Öğrencinin claim'i yeniden çıkarması gerekmiyor mu?
- Tek bir aday kanıt açıkça doğru mu?
- Alternatif cümleler makul görünüyorsa görev bunu kaydediyor mu?
- Cümle uzunluğu veya kelime yükü kanıt bulmadan daha baskın hâle geliyor mu?

**Boyut kararı:** **DOLDURULMADI**  
**Gerekçe:** **DOLDURULMADI**

### 5.3 `EVIDENCE_RELATION`

- `evidenceCandidateId` ile `relationType` ayrı değerlendiriliyor mu?
- `LIMITED_SUPPORT`, gözlem/kısmi ilişki ile kesin nedensellikten ayrılıyor mu?
- `DIRECT_SUPPORT`, `COMPARISON`, `CAUSAL_SUPPORT` veya `NOT_SUPPORTED_OR_CONTRADICTS` için metinsel koşullar gerçekten mevcut mu?
- Tek kanıt adayı yeterli değilse sözleşme sessizce çoğaltılmadan belirsizlik kaydediliyor mu?
- Relation görevindeki açıklama veya seçenekler başka boyutun cevabını ele veriyor mu?

**Boyut kararı:** **DOLDURULMADI**  
**Gerekçe:** **DOLDURULMADI**

## 6. Dört `LIMITED_SUPPORT` maddesi

Aşağıdaki dört görev için özel satır doldurulur. Tasarım hedefi uzman onayı değildir.

| Task         | Mevcut tasarım hedefi         | Kanıt adayının yeterliliği | İlişki etiketi riski | Karar/gerekçe    |
| ------------ | ----------------------------- | -------------------------- | -------------------- | ---------------- |
| `V2C-REL-01` | `CAND-01` + `LIMITED_SUPPORT` | **DOLDURULMADI**           | **DOLDURULMADI**     | **DOLDURULMADI** |
| `V2C-REL-02` | `CAND-02` + `LIMITED_SUPPORT` | **DOLDURULMADI**           | **DOLDURULMADI**     | **DOLDURULMADI** |
| `V2C-REL-03` | `CAND-01` + `LIMITED_SUPPORT` | **DOLDURULMADI**           | **DOLDURULMADI**     | **DOLDURULMADI** |
| `V2C-REL-04` | `CAND-02` + `LIMITED_SUPPORT` | **DOLDURULMADI**           | **DOLDURULMADI**     | **DOLDURULMADI** |

Uzman, bu maddeleri sırf etiketler eşit dağılsın diye başka bir etikete çeviremez. `CAUSAL_SUPPORT` veya `DIRECT_SUPPORT` için açık metinsel koşul yoksa `PENDING_EXPERT_DECISION` yazılmalıdır.

## 7. İki pilot grubuna ilişkin uzman kontrolü

Pilotta incelenecek çalışma grupları `GENERAL_STUDENT_POPULATION` ve `STUDENTS_NEEDING_READING_DEVELOPMENT` olarak tasarlanmıştır. Bu kodlar öğrenciye görünen etiketler değildir.

- Grup üyeliği P1-C V2 yanıtlarından belirlenmemelidir.
- WPM, Antrenman, istemci puanı ve tek toplam skor kullanılmamalıdır.
- Bağımsız dahil etme/dışlama ölçütlerinin kaynağı ve onay sahibi yazılmalıdır.
- Grupların kesişimi, dışlayıcılığı ve anonim kodlama yöntemi açık bırakılmamalıdır.
- Yaş/sınıf etkisi ile grup etkisini ayırmak için tabakalama veya uygun analiz planı gerekçelendirilmelidir.

**Uzman grup tasarımı notu:** **DOLDURULMADI**  
**Bağımsız ölçüt kaynağı:** **DOLDURULMADI**  
**Yaş/sınıf tabakalama önerisi:** **DOLDURULMADI**

## 8. Bağımsız rater ve anlaşmazlık formu

İki rater aynı görevi diğerinin kararını görmeden inceler. İlk kararlar korunur.

| Task ID                     | Rater A kararı/gerekçesi | Rater B kararı/gerekçesi | Fark türü        | Adjudication kararı | Adjudication gerekçesi |
| --------------------------- | ------------------------ | ------------------------ | ---------------- | ------------------- | ---------------------- |
| 12 görev için tekrar edilir | **DOLDURULMADI**         | **DOLDURULMADI**         | **DOLDURULMADI** | **DOLDURULMADI**    | **DOLDURULMADI**       |

Anlaşmazlık türleri: `CONSTRUCT`, `ANSWER_KEY`, `EVIDENCE_SPAN`, `RELATION`, `LANGUAGE`, `AGE_GRADE`, `GROUP_SCOPE`, `SCORING`.

Uzlaşma sağlanamazsa madde `PENDING_EXPERT_DECISION` veya güvenli runtime akışında `REVIEW_REQUIRED` kalır.

## 9. Etik ve veri güvenliği kontrolü

| Kontrol                                    | Durum/not        |
| ------------------------------------------ | ---------------- |
| Katılımcı/veli onamı                       | **DOLDURULMADI** |
| Geri çekilme ve iletişim yolu              | **DOLDURULMADI** |
| Anonim `pilotParticipantId`                | **DOLDURULMADI** |
| Erişim rolleri ve güvenli aktarım          | **DOLDURULMADI** |
| Saklama süresi ve silme yöntemi            | **DOLDURULMADI** |
| Production DB dışında silinebilir ortam    | **DOLDURULMADI** |
| AI nihai akademik puanlamada kullanılmıyor | **DOLDURULMADI** |

Bu kontroller tamamlanmadan pilot başlatılamaz. Öğrenci, tenant, secret veya bağlantı bilgisi inceleme kaydına yazılmaz.

## 10. Sonuç ve ayrı karar kapıları

### Kapı 1 — Uzman incelemesi

12 madde kararı, gerekçeler, bağımsız rater kayıtları ve anlaşmazlık/adjudication kaydı tamamlanmadan geçilmez. **Durum:** `NOT_COMPLETED`.

### Kapı 2 — Pilot

Bağımsız grup ölçütleri, etik/onam, veri planı ve yaş/sınıf tabakalama kararı tamamlanmadan pilot başlatılmaz. **Durum:** `NOT_COMPLETED`.

### Kapı 3 — Kalibrasyon ve release

Pilot analizi, uzman/veri sorumlusu kararı ve korumalı release onayı olmadan otomatik atama açılmaz. **Durum:** `NOT_CALIBRATED`.

| Kapı                | Gerekli kanıt                                                                           | Durum            |
| ------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| Uzman incelemesi    | 12 madde kararı, gerekçeler, bağımsız rater kayıtları, anlaşmazlık/adjudication         | `NOT_COMPLETED`  |
| Pilot               | Grup ölçütleri, etik/onam, veri planı, yaş/sınıf tabakalama ve pilot protokolü          | `NOT_COMPLETED`  |
| Kalibrasyon/release | Pilot analizi, uzman/veri sorumlusu kararı, version manifesti ve korumalı release onayı | `NOT_CALIBRATED` |

## 11. Değişmez güvenlik durumu

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B, P1-C ve P1-D otomatik atamaları kapalı
- V1 item bankası, scorer, mapping, geçmiş sonuçlar, P0 22 adım ve P1-A akışı korunur

Bu formun testleri yalnızca doküman bütünlüğünü kontrol eder; akademik geçerliliği, uzman anlaşmasını veya kalibrasyonu kanıtlamaz.
