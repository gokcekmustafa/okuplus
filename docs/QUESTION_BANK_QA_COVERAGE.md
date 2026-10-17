# Soru Bankası QA Kapsamı ve Sınırları

Bu envanter, `scripts/qa-multiple-choice-source.ts` ve `src/curriculum/multiple-choice-source-catalog.ts` tarafından oluşturulur. Sürüm adayları kaynak sorularla aynı `sourceQuestionId` altında gruplanır; aday sürümleri ayrı benzersiz soru sayılmaz. `--details` seçeneği soru metni, kaynak pasajı, seçenekler, doğru seçenek, açıklama, ipucu ve tanımlı sürüm kimliklerini içeren denetim dökümünü verir.

## Güncel kapsam kaydı — 17 Ekim 2026

Statik QA kataloğu şu anda **1.089 benzersiz soru kimliği**, 1.227 tekilleştirilmiş soru/sürüm girdisi ve 1.200 açık sürüm kimliği içeriyor. Bunların 144'ü mevcut kaynak, 936'sı yayımlanmamış istasyon/şık revizyon adayı, 9'u tasarım adayıdır; tekrarlanan sürüm referansları benzersiz sayımlara eklenmez. Bu sayımlar denetim kapsamını gösterir, 1.089 sorunun tamamının insan tarafından semantik olarak onaylandığını göstermez. 189 eski statik soru kimliği için önceki editoryal inceleme kaydı aşağıda korunmuştur; sonradan hazırlanan 900 genişleme sorusunda otomatik uzunluk/konum ve kaynak bağlantısı kontrolleri var, ancak ayrı editoryal gözden geçirme hâlâ gereklidir.

Bağımsız Antrenman için korumalı salt-okunur envanter workflow'u [Run #39034115550](https://github.com/gokcekmustafa/okuplus/actions/runs/39034115550) üzerinde 17 Ekim 2026'da başarılı oldu. Rapor `productionWrite=NO`, `semanticContentReview=NOT_PERFORMED` ve `INVENTORY_COMPLETE_REVIEW_REQUIRED` bildirdi. Altı bilinen Antrenman etkinliğine 45 yayımlanmış şablon sürümü eşlendi; bunların 42'si konfigürasyon ve çalışma grafiği bakımından öğrenci kullanımına uygundu ve bu kapsamdaki 129 soru bağlantısı incelendi. Eşlenmiş sorularda doğru seçenek konumları A=73, B=34, C=12, D=10; doğru seçeneğin tek başına en uzun olduğu 81, tek başına en kısa olduğu 18 kayıt bulundu. Ayrıca 12 yinelenen soru-sürüm referansı ve 13 normalize metin eşleşmesi belirlendi. Bu sayılar otomatik metadata sinyalleridir; soru kökü, seçenekler ve açıklamalar rapora özellikle alınmadığı için **Antrenman sorularının anlamsal doğruluğu insan tarafından incelenmedi**. Üç eşlenmiş şablon sürümünde çalışma grafiği geçersiz raporlandı; bu kayıtların yayın/erişim nedeni bu envanter raporundan çıkarılamaz. On aileye eşlenemeyen sürüm Antrenman faaliyeti olarak sınıflandırılmadı.

Önceki çalışmada **189 benzersiz statik soru kimliği** soru kökü, kaynak metin, seçenekler, cevap anahtarı, açıklama ve beceri bağlamıyla editoryal masa başı incelemesinden geçirildi. Daha sonra hazırlanan 900 genişleme sorusu ayrı ve yeni kaynak kimlikleridir; bunların kaynak bağlantısı ile mekanik ölçümleri kontrol edilmiştir, ancak editoryal onayları tamamlanmış sayılmaz. Paket tekrarı yeni soru sayılmaz. İlk gerçek içerik paketindeki 27 sorunun soru bazında değişmez sürümü kaynakta tanımlanmamıştır. Aynı soru+sürüm farklı içerikle tekrar kataloglanırsa QA bunu sessizce ezmek yerine hata verir. Masa başı inceleme dış uzman onayı, psikometrik kalibrasyon veya üretimde yayımlanma anlamına gelmez.

## Kataloglanan statik çoktan seçmeli kaynaklar

| Kaynak                                       | Soru sayısı | Durum                                                  |
| -------------------------------------------- | ----------: | ------------------------------------------------------ |
| P0 başlangıç programı                        |          18 | Mevcut kaynak                                          |
| P1-A ilk döngü                               |          22 | Mevcut kaynak                                          |
| P1-A Cycle 2                                 |          22 | Mevcut kaynak                                          |
| P1-A Cycle 3                                 |          16 | Mevcut kaynak; istasyon 43 için kapalı v4 adayı mevcut |
| P1-B ilk döngü                               |          13 | Mevcut kaynak                                          |
| P1-C ilk döngü                               |          13 | Mevcut kaynak                                          |
| P1-D ilk döngü                               |          13 | Mevcut kaynak                                          |
| P1-B/C/D Cycle 2 adayları                    |          36 | Yayımlanmamış aday                                     |
| İlk gerçek içerik paketi                     |          27 | Paket kaynağı; soru bazında sürüm tanımı yok           |
| Yerleştirme bankası çoktan seçmeli maddeleri |           9 | Tasarım kaynağı                                        |
| A/B/C/D yeni genişleme adayları              |         900 | Kaynaklı, yayımlanmamış; editoryal inceleme bekler     |
| **Önceki editoryal inceleme kapsamı**        |     **189** | Tarihsel semantik masa başı inceleme kaydı             |
| **Güncel benzersiz statik MC kimlikleri**    |   **1.089** | Katalog toplamı; 900 genişleme adayı dahil             |

Güncel QA çıktısındaki sürüm sayımı ek açıklama olmadan okunmamalıdır: 1.284 paket içi giriş, 1.227 tekilleştirilmiş soru/sürüm girdisine iner; bunların 1.200'ünde açık sürüm kimliği bulunur, 27 ilk-gerçek-paket girdisinde bulunmaz. Paketler arası tekrarlar benzersiz soru veya sürüm olarak sayılmaz.

Katalog ayrıca mevcut P0, P1-A ilk döngü, B/C/D ilk döngüleri, Cycle 2, Cycle 3 ve yerleştirme revizyon adaylarını listeler. Bu aday satırları yeni benzersiz soru değildir; aynı kaynak kimliğinin farklı sürümleridir. 43. istasyonun yağmur bahçesi v4 adayı, Cycle 3'ün gerçek `p1a-v3-evidence-practice` içeriğine ve aynı anahtarlı alıştırmaya bağlıdır; yayımlanmış v3 sürümü değişmedi.

## Gerçekten bulunan ve sürümlü adaya işlenen düzeltmeler

- **7 doğrulanmış anlam/cevap/beceri kusuru:** P0 `fast-chunking-practice-1` (belirsiz kök ve eksik yer eki), P0 `rc-main-idea-practice-1` (anahtar seçme ölçütünü doğru anlatmıyor), P0 `common-test-3` (çıkarımı zorunlu mantıksal sonuç gibi tanımlayan açıklama), P1-B `p1b-study-1` (zaman grubunu koşul diye adlandırma), P1-C `p1c-study-1` (metnin desteklemediği “kaynakları düzenleme” çıkarımı), P1-C `p1c-practice-1` (çıkarım sorusu doğrudan metin bilgisini tekrar ettiriyordu) ve P1-D `p1d-study-1` (göçün anlamını aşırı genel verme).
- **1 ek uzunluk ipucu:** P0 `fast-recognition-practice-1` doğru seçenek metni doğal biçimde kısaltıldı; anlam ve seçenek kimlikleri korundu.
- P0 ve P1-B/C/D için toplam **35 soruda** yeni içerik sürümü hazırlandı: 8 doğrulanmış düzeltmeye ek olarak 27 maddede çeldiriciler doğal/ayırt edici hâle getirildi. Aynı v3 adaylarında doğru cevap konumları dengelendi; eski seçenek kimlikleri ve puanlama anahtarları korunur.
- Adayların tüm kaynak sürümleri ve yayımlanmış içerikleri değişmeden kalır. P1-A Cycle 2'nin mevcut denge adayı, Cycle 3 adayları ve placement 1.0.2 adayı da kapsama alınmış; yeniden üretilmemiştir. İstasyon 43 yağmur bahçesi v4 içeriği olduğu gibi korunmuştur.
- 43. istasyon v4'te üç soru sırasıyla açık ayrıntıyı bulma, metindeki neden-sonuç bağını anlama ve iki ayrı sonuçtan sınırlı çıkarım yapma amacına göre düzenlendi. V4'ün içerik anahtarı gerçek Cycle 3 içerik anahtarıdır; doğru cevaplar `b/c/a` konumlarında ve mekanik seçenek uzunluğu kontrollerinde belirgin uzunluk ipucu olmadan kalır. Bu aday hâlâ `publicationApproved: false` / `REVIEW_REQUIRED` durumundadır.
- Yerleştirme bankasındaki 27 çoktan seçmeli olmayan madde kendi soru türlerine göre ayrı incelendi: 9 doğru/yanlış, 9 eşleştirme ve 9 boşluk doldurma. Yedi kusur yeni, kapalı **1.0.3** adayında düzeltildi; kaynak 1.0.1 ve önceki 1.0.2 adayı değişmedi. Düzeltilenler: Q003'te cevabı soru kökünde veren çıkarım, Q006'da amacı örtüşen eşleştirmeler, Q007/Q019/Q031'de ana düşünceyi ölçmek yerine cevabı/fiili kökte açığa çıkaran boşluklar, Q022'de daha uzun çalışma önerisini yanlış temsil eden eşleştirme ayrıntısı ve Q024'te metni doğrudan tekrar eden çıkarım maddesi. Diğer 20 maddede bu incelemede cevap/kanıt bakımından somut bir kusur saptanmadı.
- Tüm revizyon adayları `publicationApproved: false` ve `REVIEW_REQUIRED` durumundadır. Bu QA çalışması yayın veya atama yapmaz.

## Bilinçli kapsama dışı / doğrulanamayanlar

- Bağımsız **Antrenman** soruları `src/modules/training/activities.ts` üzerinden yayımlanmış veritabanı şablon/soru sürümlerinden yüklenir. Run #39034115550 bu sürümlerin güvenli metadata envanterini aldı; soru metinleri, seçenekler ve cevap anahtarları loglanmadığı için canlı Antrenman sorularının **semantik denetim sayısı sıfırdır**. Bu alanın semantik incelemesi için içeriğe uygun, erişimi kısıtlı bir inceleme aracı gerekir; log veya genel artefaktlara hassas soru/cevap dökmek uygun değildir.
- Yerleştirme MC dışı 27 madde ayrı tür doğruluğu incelemesinden geçti. Düzeltme adayı 1.0.3'tür; kaynakta veya canlıda yayımlanmadı. Öğrenci ölçüm sonuçları okunmadı/değiştirilmedi.
- İlk gerçek içerik paketindeki **27** MC sorunun kararlı kaynak kimliği var, ancak soru başına değişmez sürüm ID'si tanımlı değil. Sürüm değeri uydurulmadı.
- `academic-reading-p0.ts` soru bankası değil; öğretim hedefi ve uygulama sözleşmeleri tanımlar. İçinde denetlenecek seçenekli soru kayıtları bulunmadığından MC soru sayımına eklenmedi.
- QA uzunluk/şık konumu/tekrar ölçümleri yapısal uyarıdır, anlamsal doğruluğu kanıtlamaz. Raporlanan 6 mevcut kaynak uzunluk aykırılığı ve yayımlanmamış adaylardaki 0 uzunluk aykırılığı, metriklerdir; bunlar tek başına anlam doğruluğunu kanıtlamaz. 189 MC kimliğinin masa başı semantik incelemesi yapılmış olsa da sonradan eklenen 900 sorunun editoryal incelemesi tamamlanmamıştır. Otomatik araçla kesinleştirilemeyen pedagojik uygunluk ve kalibrasyon ayrıca gözden geçirilmeli; hiçbir aday otomatik olarak `VERIFIED` yapılmaz.
- Bu işte üretim grafiği, öğrenci cevapları ve puanlar değiştirilmedi. Canlı Antrenman envanteri yalnızca salt okunur metadata düzeyinde incelendi; soru içeriği/cevap anahtarları alınmadı ve semantik doğruluk hakkında sonuç çıkarılmadı.
