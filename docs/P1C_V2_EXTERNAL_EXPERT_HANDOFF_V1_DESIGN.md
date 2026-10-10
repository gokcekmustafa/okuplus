# OkuPratik — P1-C V2 Dış Uzman İnceleme Paketi

**Belge sürümü:** `P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN`  
**Durum:** `DESIGN_ONLY` — dış uzman incelemesine hazırlık  
**Kaynak commit:** `573d22aa03ae5957588dbf0581f96695f70a88c5`  
**Repository:** `gokcekmustafa/okuplus`  
**Kapsam:** P1-C V2 aday görevlerinin uzman incelemesine kontrollü ve izlenebilir biçimde aktarılması

> Bu belge dış uzmana teslim edilecek inceleme paketinin taslağıdır. Uzman onayı, pilot tamamlanma kararı, kalibrasyon sonucu veya production'a açılma kararı içermez. Hedef yaş/sınıf ve Türkçe okuma profili ürün sahibi tarafından doldurulmadan akademik uygunluk iddiası kurulamaz.

## 1. Amaç ve kapsam sınırları

Bu paketin amacı, `INFERENCE`, `EVIDENCE_FINDING` ve `EVIDENCE_RELATION` boyutları için hazırlanmış 12 V2 aday görevinin madde, metin, kanıt, yanıt anahtarı, yönerge ve puanlama tasarımını bağımsız uzman incelemesine sunmaktır.

İnceleme şunları kapsar:

- Her aday görevin hedeflediği yapının açık ve tekil olup olmadığı.
- Metin, görev yönergesi, cevap seçenekleri ve beklenen kanıt arasındaki tutarlılık.
- Boyutların birbirinden ayrışması ve bir görevin başka bir boyutun yanıtını istemeden ele verip vermemesi.
- Türkçe dil yükü, hedef kullanıcı profiline uygunluk ve construct dışı yükler.
- `EVIDENCE_RELATION` için ilişki etiketlerinin ve tek `evidenceCandidateId` sözleşmesinin açıklığı.
- Eksik, belirsiz veya çelişkili yanıtların güvenli biçimde insan incelemesine bırakılması.

Bu paket şunları yapmaz:

- V1 item bankasını, mapping'i, scorer'ı veya geçmiş assessment sonuçlarını değiştirmez.
- V2 adaylarını doğrulanmış ölçme aracı, yayımlanmış içerik veya production assessment hâline getirmez.
- Uzman onayı, pilot sonucu, kalibrasyon sonucu veya otomatik rota atama kararı vermez.
- Hedef yaş/sınıf aralığını ya da Türkçe okuma profilini kendisi belirlemez.
- Production DB'ye yazmaz; migration, seed, provisioning, publish veya deploy çalıştırmaz.

Bu pakete eşlik eden testler yalnızca doküman bütünlüğünü, sürüm referanslarını ve güvenlik işaretlerini kontrol eder; akademik geçerliliği kanıtlamaz.

## 2. Sabitlenmiş kaynak manifesti

İnceleme sırasında kullanılan içeriklerin değişmemesi için bütün kaynaklar aynı commit'e sabitlenmiştir. Dış uzman, inceleme formundaki kararlarını bu commit'teki metin ve metadata üzerinden vermelidir.

### 2.1 Paket kaynakları

- [V2 aday soru havuzu](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2 uzman inceleme formu](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_EXPERT_REVIEW_V2_DESIGN.md)
- [V2 pilot uygulama taslağı](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_PILOT_V2_DESIGN.md)
- [Genel pilot ve kalibrasyon protokolü](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1_ADAPTIVE_PILOT_CALIBRATION_PROTOCOL_V1.md)
- [P1-C ölçüm tasarımı ve kanıt ilişkisi çerçevesi](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_DESIGN_V2.md)

### 2.2 On iki aday görevin doğrudan kaynakları

Aşağıdaki bağlantıların her biri aynı sabit commit'teki aday havuzuna gider. Başlıktaki görev kimliği, uzmanın ilgili madde bloğunu bulmasını sağlar.

#### INFERENCE

- [V2C-INF-01 — Balkon saksılarında su kullanımı](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-02 — Kütüphane çalışma düzeni](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-03 — Mahalle kompost kutusu](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-INF-04 — Bisiklet yolunda görünürlük](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

#### EVIDENCE_FINDING

- [V2C-EVF-01 — Okul bahçesinde gölge](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-02 — Otobüs durağında bekleme](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-03 — Mutfak atıklarının ayrılması](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-EVF-04 — Mahalle haritası](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

#### EVIDENCE_RELATION

- [V2C-REL-01 — Bitkinin ışık yönü](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-02 — Yağmur sonrası yaya yolu](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-03 — Sınıf kitaplığında ödünç alma](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)
- [V2C-REL-04 — Meyve kasalarının gölgede tutulması](https://github.com/gokcekmustafa/okuplus/blob/573d22aa03ae5957588dbf0581f96695f70a88c5/docs/P1C_EVIDENCE_RELATION_ITEM_POOL_V2_DESIGN.md)

> Bağlantıların hepsi `573d22aa03ae5957588dbf0581f96695f70a88c5` commit'ini içerir. Bu paket içindeki görev kimlikleri, aday havuzundaki tekil bloklarla eşleştirilmelidir; görev metni veya cevap seçenekleri bağlantıdaki sabit kaynak dışında kopyalanıp değiştirilmemelidir.

## 3. Ürün sahibinin inceleme öncesi dolduracağı alanlar

Bu alanlar boş bırakılmıştır. Ürün sahibi ve ilgili eğitim/ölçme sorumlusu doldurmadan uzmanlardan hedef kitle uygunluğu hakkında nihai karar istenmemelidir.

| Alan                           | Değer            | Açıklama                                                                       |
| ------------------------------ | ---------------- | ------------------------------------------------------------------------------ |
| Hedef yaş / sınıf aralığı      | **DOLDURULMADI** | Bu belge hedef yaş veya sınıf belirlemez.                                      |
| Türkçe okuma profili           | **DOLDURULMADI** | Beklenen akıcılık, kelime bilgisi, metin uzunluğu ve ön bilgi tanımlanmalıdır. |
| Amaçlanan kullanım             | **DOLDURULMADI** | Placement, gelişimsel izleme veya araştırma kullanımı ayrıştırılmalıdır.       |
| Erişilebilirlik gereksinimleri | **DOLDURULMADI** | Görsel, işitsel, motor ve dilsel destekler belirtilmelidir.                    |
| Gerekli ön bilgi               | **DOLDURULMADI** | Metinlerin gerektirdiği alan bilgisi ve kültürel bağlam yazılmalıdır.          |
| Pilot dili ve uygulama koşulu  | **DOLDURULMADI** | Uygulama ortamı, süre politikası ve yönerge desteği açıklanmalıdır.            |

Uzman, bu alanlardan biri boşsa karar formunda eksikliği işaretlemeli; kendi varsayımıyla yaş, sınıf veya okuma profili atamamalıdır.

## 4. Dış uzman çalışma yöntemi

1. Uzman önce sabit commit'i, paket kaynaklarını ve kendi inceleme kimliğini kaydeder.
2. Her uzman 12 görevi bağımsız olarak, diğer uzmanın kararını görmeden inceler.
3. Uzman her madde için `KEEP`, `REVISE`, `REJECT`, `PENDING_DATA` veya `PENDING_EXPERT_DECISION` kararlarından birini seçer ve kısa gerekçe yazar.
4. Karar, yalnızca görev bloğundaki metin, seçenekler, metadata ve kaynak sürümleri üzerinden verilir. Eksik hedef kitle bilgisini varsayımla tamamlamak yerine karar `PENDING_DATA` olabilir.
5. Bir görevin teknik olarak tutarlı olması, akademik olarak doğrulanmış olduğu anlamına gelmez. Akademik uygunluk kararı ayrı bir kapıda tutulur.
6. Uzmanlar bağımsız formları tamamladıktan sonra yalnızca anlaşmazlıklar için kontrollü adjudication oturumu yapılır. İlk kararlar silinmez veya sessizce üzerine yazılmaz.

### 4.1 Madde bazlı karar yönergesi

Her madde için aşağıdaki sorular yanıtlanmalıdır:

- Kimlik, passage version, design/mapping version ve evidence reference sabit ve birbiriyle uyumlu mu?
- Görev yönergesi tek bir beceriyi mi istiyor, yoksa başka bir boyuttan ek işlem mi talep ediyor?
- Beklenen cevap veya cevap anahtarı metinden savunulabilir mi?
- Çeldiriciler metne dayalı ve makul mü; biçim, uzunluk veya kelime seçimi doğru cevabı ele veriyor mu?
- Yanlış yanıt hangi hata türünü yansıtıyor? Yanlışlık yalnızca dil yükünden kaynaklanabilir mi?
- Görev hedef yaş/sınıf ve Türkçe okuma profiline uygun mu? Bu bilgi yoksa eksikliği kaydet.
- Cevap biçimi construct dışı okuma, çalışma belleği, yazma veya yönerge yükü oluşturuyor mu?
- Scoring metadata'sı gözlenebilir cevapla sınırlı mı; akademik olarak doğrulanmamış bir çıkarım içeriyor mu?
- Eksik, belirsiz, çelişkili veya sürümü doğrulanamayan bir cevap için güvenli karar `REVIEW_REQUIRED` olarak korunuyor mu?

## 5. Boyutların ayrı değerlendirilmesi

### 5.1 `INFERENCE`

Uzman, öğrencinin metinde açıkça yazmayan ancak metinle desteklenen sonucu belirleyip belirlemediğini inceler. Doğru seçenek, metindeki birden fazla bilgiyi uygun biçimde birleştirmeli; yalnızca tek bir kelimeyi tanımayı veya genel dünya bilgisini ölçmemelidir.

Özellikle kontrol edin:

- Dört seçenek aynı türde ve benzer dil yükünde mi?
- Doğru cevap tek anlamlı mı; seçeneklerden biri diğerini kapsamıyor mu?
- Çeldiriciler metinde olmayan, aşırı genelleyen veya metinle çelişen sonuçları dengeli biçimde temsil ediyor mu?
- `INFERENCE` yanıtı, öğrenciden kanıt cümlesini ayrıca seçmesini istemeden de savunulabilir mi?

### 5.2 `EVIDENCE_FINDING`

Uzman, öğrencinin önceden verilen veya seçtiği sonucu destekleyen cümle/ifadeyi bulup bulamadığını inceler. Bu görev, sonucu kendisinin çıkarılmasından ayrı değerlendirilmelidir.

Özellikle kontrol edin:

- Sonuç görev içinde açıkça tanımlı mı; öğrenci yeniden çıkarım yapmak zorunda kalıyor mu?
- Aday kanıtlar metindeki aynı iddiaya gerçekten karşılık geliyor mu?
- Birden fazla cümle makul biçimde aynı desteği veriyorsa görev tek doğru iddia ediyor mu?
- Cümle uzunluğu, sözdizimi veya kelime yoğunluğu kanıt bulma becerisini gölgeliyor mu?

### 5.3 `EVIDENCE_RELATION`

Uzman, seçilen kanıtın iddiayı neden desteklediğini ve destek düzeyinin kapsamını değerlendirmelidir. Bu boyut `INFERENCE` veya `EVIDENCE_FINDING` ile aynı değildir: doğru sonucu seçmek ya da doğru cümleyi bulmak, kanıt-sonuç ilişkisinin niteliğini tek başına göstermez.

İlişki etiketleri arasında ayrım yapılırken:

- `LIMITED_SUPPORT`, gözlem veya kısmi ilişkiyi gösterir; kesin neden-sonuç çıkarımı içermez.
- `DIRECT_SUPPORT`, iddianın kapsamını değiştirmeden doğrudan metinsel desteği gerektirir.
- `COMPARISON`, iki tanımlı koşul/nesne arasındaki fark veya benzerliği açıkça gerektirir.
- `CAUSAL_SUPPORT`, yalnızca metnin açık bir müdahale-sonuç ilişkisi kurduğu durumda düşünülebilir.
- Desteklenmeyen veya çelişen adaylar `NOT_SUPPORTED_OR_CONTRADICTS` olarak ayrılır.

Etiketler eşit derecede savunulabiliyorsa uzman zorla seçim yapmamalı, belirsizliği ve gerekçesini `PENDING_EXPERT_DECISION` ile kaydetmelidir. Runtime'da eksik, çelişkili veya sürümü doğrulanamayan yanıt `REVIEW_REQUIRED` kalır.

## 6. Dört `LIMITED_SUPPORT` maddesi için özel inceleme

Mevcut havuzdaki aşağıdaki dört maddenin tasarım hedefi `LIMITED_SUPPORT` olarak işaretlenmiştir. Bu hedef, uzman onayı veya kalibrasyon sonucu değildir. Maddeler sırf etiket dağılımı eşit olsun diye başka bir ilişki türüne taşınmamalıdır.

| Görev        | Tasarım hedefi                | Uzmanın özellikle kontrol edeceği nokta                                                                            | Karar            |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `V2C-REL-01` | `CAND-01` + `LIMITED_SUPPORT` | Gözlem ilişkiyi düşündürüyor mu; metin kesin nedensellik iddiasına istemeden kapı açıyor mu?                       | **DOLDURULMADI** |
| `V2C-REL-02` | `CAND-02` + `LIMITED_SUPPORT` | Tek aday cümlesi hem gözlemi hem sınırlı ilişkiyi taşıyor mu; bileşik yapı okuma yükünü artırıyor mu?              | **DOLDURULMADI** |
| `V2C-REL-03` | `CAND-01` + `LIMITED_SUPPORT` | Aynı dönem gözlemi ile tek neden iddiası ayrışıyor mu; tablo/çizelge bilgisi construct dışı yük yaratıyor mu?      | **DOLDURULMADI** |
| `V2C-REL-04` | `CAND-02` + `LIMITED_SUPPORT` | Gölgeye taşınma ile gözlenen sonuç arasındaki sınırlılık açık mı; ikinci kanıt adayı gerekip gerekmediği belli mi? | **DOLDURULMADI** |

Bu dört maddeden biri tek kanıt seçimiyle savunulabilir değilse cevap alanı sessizce çoğaltılmamalıdır. Bunun yerine gerekçe yazılmalı ve sözleşme değişikliği gerekiyorsa yeni bir item/mapping sürümü kararı açılmalıdır.

## 7. Bağımsız inceleme, anlaşmazlık ve adjudication

Her uzman ayrı bir inceleme kaydı tutar:

| Alan               | Uzman 1                                    | Uzman 2                                    |
| ------------------ | ------------------------------------------ | ------------------------------------------ |
| İnceleme kimliği   | **DOLDURULMADI**                           | **DOLDURULMADI**                           |
| Kaynak commit      | `573d22aa03ae5957588dbf0581f96695f70a88c5` | `573d22aa03ae5957588dbf0581f96695f70a88c5` |
| İnceleme tarihi    | **DOLDURULMADI**                           | **DOLDURULMADI**                           |
| Karar formu sürümü | **DOLDURULMADI**                           | **DOLDURULMADI**                           |

Anlaşmazlık tablosu ilk kararlar alındıktan sonra doldurulur:

| Görev                       | Uzman 1 kararı/gerekçesi | Uzman 2 kararı/gerekçesi | Anlaşmazlık türü | Adjudication kararı | Gerekçe ve karar sahibi |
| --------------------------- | ------------------------ | ------------------------ | ---------------- | ------------------- | ----------------------- |
| 12 görev için tekrar edilir | **DOLDURULMADI**         | **DOLDURULMADI**         | **DOLDURULMADI** | **DOLDURULMADI**    | **DOLDURULMADI**        |

Adjudication, ilk bağımsız kararları geriye dönük silmez. Uzlaşma sağlanamayan maddeler `PENDING_EXPERT_DECISION` veya ürünün güvenli çalışma sözleşmesine göre `REVIEW_REQUIRED` olarak bırakılır; otomatik route seçimi için kullanılmaz.

## 8. Pilot öncesi etik ve veri güvenliği koşulları

Uzman incelemesi tamamlanmış olsa bile pilot ayrı bir kapıdır. Pilot başlamadan önce aşağıdaki koşullar yazılı olarak onaylanmalıdır:

- Katılımcı grubu, gönüllü/onam süreci, yaş küçüklüğü durumunda veli/onam gereği ve geri çekilme yöntemi tanımlanmalıdır.
- Katılımcı kimliği aday görev cevaplarından ayrılmalı; mümkünse anonim veya takma kimlik kullanılmalıdır.
- Ham cevaplar, uzman notları ve rater kimlikleri erişim kontrollü ortamda tutulmalıdır.
- Veri aktarımında güvenli kanal ve en az ayrıcalık ilkesi uygulanmalıdır; production DB kullanılmamalıdır.
- Saklama süresi, erişebilecek roller, yedekleme kapsamı ve silme yöntemi pilot öncesinde belirlenmelidir.
- Saklama süresi bittiğinde ham cevaplar, ilişkilendirici anahtarlar ve gereksiz kopyalar doğrulanabilir biçimde silinmelidir.
- Pilot verisi öğrenci seviyesini, route seçimini veya P1 atamasını otomatik olarak değiştirmemelidir.
- Üretken yapay zekâ veya otomatik sınıflandırıcı, uzman ve akademik kalibrasyon kararının yerine konulmamalıdır.
- Hassas öğrenci verileri, sırlar, bağlantı bilgileri ve production kimlikleri uzman paketine alınmamalıdır.

Eksik etik, onam veya veri yönetimi bilgisi varsa pilot kapısı açılmaz; bu eksiklik uzman incelemesinin olumlu kararını geçersiz kılmasa da pilot için bloklayıcıdır.

## 9. Ayrı karar kapıları

### Kapı 1 — Uzman incelemesi

Bu kapının açılması için 12 görevin her biri için bağımsız inceleme, gerekçe, boyut kararı, anlaşmazlık kaydı ve adjudication sonucu bulunmalıdır. Hedef kitle alanları boşsa bunlar tamamlanmadan nihai uygunluk kararı verilmez.

**Durum:** `NOT_COMPLETED`  
**Bu belgenin kararı:** Yok.

### Kapı 2 — Pilot hazırlığı ve pilot

Bu kapı, Kapı 1'de incelenen ve pilot için seçilen sürümlerin ayrı bir ortamda, onam ve veri güvenliği planıyla uygulanmasını kapsar. Pilot katılımcı sayısı, kabul eşiği veya seviye sınırı bu belgede icat edilmez; uzman, veri sorumlusu ve ürün sahibi tarafından ayrıca belirlenmelidir.

**Durum:** `NOT_COMPLETED`  
**Bu belgenin kararı:** Yok.

### Kapı 3 — Kalibrasyon ve release

Bu kapı, pilot analizinin, rater anlaşmasının, item/construct incelemesinin, sürüm manifestinin ve yetkili akademik kararın tamamlanmasını gerektirir. Bu kapı geçilmeden `P1-C` otomatik ataması, production assignment veya `READY` durumu etkinleştirilemez.

**Durum:** `NOT_CALIBRATED`  
**Bu belgenin kararı:** Yok.

## 10. Sürüm, eksik veri ve güvenli runtime davranışı

- Uzman paketi `P1C_V2_EXTERNAL_EXPERT_HANDOFF_V1_DESIGN` sürümüne aittir; aday havuzundaki item, passage, mapping, scoring ve rubric sürümleri aynen kaydedilmelidir.
- Kaynak commit, item kimliği veya version eşleşmesi doğrulanamazsa inceleme sonucu `PENDING_DATA` olur.
- Pilot veya runtime cevapları eksik, belirsiz, çelişkili veya manuel değerlendirme gerektiriyorsa güvenli durum `REVIEW_REQUIRED` olarak korunur.
- `PARTIAL_REVIEW`, yalnızca insan incelemesi/pilot iş akışı için geçici bir disposition'dır; runtime'da otomatik `READY` anlamına gelmez.
- V1 sonuçları yeniden yazılmaz; V2 adayları V1 item bankasına veya geçmiş sonuçlara bağlanarak geriye dönük değişiklik üretmez.

Değişmez güvenlik durumu:

- `canonicalActive=false`
- `calibrationStatus=NOT_CALIBRATED`
- `productionAssignmentEnabled=false`
- `reviewRequired=true`
- `resultLevelId=null`
- P1-B, P1-C ve P1-D otomatik atamaları kapalı

## 11. Uzman teslim ve imza alanları

| Alan                    | Değer                                      |
| ----------------------- | ------------------------------------------ |
| Uzman adı/kodu          | **DOLDURULMADI**                           |
| Uzmanlık ve kurum       | **DOLDURULMADI**                           |
| İncelenen kaynak commit | `573d22aa03ae5957588dbf0581f96695f70a88c5` |
| İnceleme formu sürümü   | **DOLDURULMADI**                           |
| Uzman incelemesi kararı | **DOLDURULMADI**                           |
| Adjudication durumu     | **DOLDURULMADI**                           |
| Pilot için öneri        | **DOLDURULMADI**                           |
| Kalibrasyon kararı      | **DOLDURULMADI**                           |
| Tarih / imza            | **DOLDURULMADI**                           |

Bu alanlar özellikle boş bırakılmıştır. Bu belge uzman onayı veya tamamlanmış kalibrasyon olarak kullanılamaz.
