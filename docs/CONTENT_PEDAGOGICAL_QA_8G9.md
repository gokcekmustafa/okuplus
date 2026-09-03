# OKU+ — 8G-9 Content & Pedagogical QA Standardı ve Audit Kaydı

Tarih: 2026-09-02  
Kapsam: `OKU-8G8-FIRST-REAL-CURRICULUM` first-real pack  
Hedef kullanıcı: 13–17 yaş  
Audit kapsamı: repository manifesti ve yalnızca local TEST (`oku_plus_test`)  
Production write: **NO**

## 1. Kaynak ve karar çerçevesi

Bu QA kaydının normatif kaynakları:

- [`docs/READING_CONTENT_STANDARD.md`](READING_CONTENT_STANDARD.md)
- [`docs/QUESTION_BLUEPRINT_AND_PEDAGOGY.md`](QUESTION_BLUEPRINT_AND_PEDAGOGY.md)
- [`docs/CURRICULUM_ARCHITECTURE.md`](CURRICULUM_ARCHITECTURE.md)
- [`docs/CURRICULUM_TAXONOMY.md`](CURRICULUM_TAXONOMY.md)
- [`src/curriculum/first-real-pack.ts`](../src/curriculum/first-real-pack.ts)
- TEST DB'deki published ContentVersion, QuestionVersion ve TemplateVersion kayıtları

Repository standardındaki 100–180 kelimelik `Mini` bandı ve 2–5 cümlelik tipik paragraf önerisi bu pack için editorial hedef olarak kullanıldı. Bu aralıklar genel içeriklerde katı otomatik red kuralı değildir. Otomasyonun cümle yoğunluğu uyarısı da editör inceleme sinyalidir; tek başına yayın kararı değildir.

## 2. Hard-fail politikası

Aşağıdaki bulgulardan biri görülürse ilgili content/question QA geçmez:

- iki doğru cevap veya hiç doğru cevap olmaması;
- metin dışı bilgiye dayalı, metinle çözülemeyen soru;
- metinle çelişen doğru cevap veya açıklama;
- birden fazla makul çeldirici ya da cevap ipucu sızıntısı;
- yaşa/seviyeye uygun olmayan dil, belirgin factual error veya anlaşılmaz Türkçe;
- soru tipi ile cevap/options sözleşmesinin uyuşmaması;
- ContentVersion, QuestionVersion veya template ilişkisinin kopuk olması;
- content objective, primary skill veya soru–metin ölçme bağının eksik olması;
- hint'in doğru cevabı doğrudan söylemesi.

Position bias için 8G-9A otomatik threshold'u `max position ratio <= 0.45` olarak tanımlandı; aşım QA error'dur. Published version'lar immutable olduğu için seçenekler v1 üzerinde overwrite edilmedi, TEST'te yeni QuestionVersion/TemplateVersion ile version-safe olarak dengelendi. TEST fixture katalog adı ise production-candidate validation'da BLOCKED'dır.

## A. Reading content QA kriterleri

Her content için editör şu soruları cevaplar:

| Kriter                | Kabul ölçütü                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Yaş                   | 13–17 yaşa uygun; küçümseyici, çocuklaştırıcı veya gereksiz yetişkin bağlamı yok.                                    |
| Grade / level         | Grade ile reading proficiency birbirine karıştırılmaz. Gerçek grade alignment için production katalog kaydı gerekir. |
| Türkçe                | Güncel, doğal, anlaşılır Türkçe; çeviri kokusu, dolgu, clickbait ve yapay tekrar yok.                                |
| Paragraph integrity   | Başlıkla uyumlu, anlamlı akış; bu pack'te üç dolu paragraf ve paragraf sınırları korunur.                            |
| Ana fikir             | Metnin tamamını taşıyan tek baskın düşünce ve onu destekleyen ayrıntılar vardır.                                     |
| Destekleyici fikirler | Açık bilgi, neden–sonuç, karşılaştırma veya kanıt ilişkisi metin içinde bulunur.                                     |
| Çıkarım               | En az bir makul çıkarım metindeki kanıtlardan kurulabilir; dış dünya bilgisi zorunlu değildir.                       |
| Yük / readability     | Mini bandı, paragraf yoğunluğu, cümle uzunluğu ve kavramsal yük 13–17 için okunabilir.                               |
| Kavramsal doğruluk    | Kaynaklı olgular kaynak claim'iyle uyumludur; özgün anlatım kaynak metni kopyalamaz.                                 |
| Vocabulary            | Terimler bağlamdan anlaşılabilir; kritik kelimeler gereksiz sözlük ezberine dönüşmez.                                |
| Sentence length       | Cümleler anlaşılır ve gereksiz iç içelikten uzaktır; uzun cümle varsa editör gerekçelendirir.                        |
| Objective             | Tek cümlelik, gözlenebilir fiille yazılmış ve metinle gerçekten ölçülebilir.                                         |
| Skill alignment       | Primary skill/track, content amacı ve metindeki kanıt aynı öğrenme çıktısına hizmet eder.                            |

### A.1 Pack sonucu

| İçerik                          | Track       | Kelime | Paragraf | Sonuç |
| ------------------------------- | ----------- | -----: | -------: | ----- |
| Gölgeyi Ölçmek                  | `main-idea` |    142 |        3 | PASS  |
| Yukarıdan Bakınca               | `main-idea` |    141 |        3 | PASS  |
| Kütüphane Rafındaki Harita      | `main-idea` |    138 |        3 | PASS  |
| Akşam Işığı ve Beden Saati      | `detail`    |    143 |        3 | PASS  |
| Çiçeğin Ziyaretçileri           | `detail`    |    124 |        3 | PASS  |
| Toprağın Sünger Gibi Davranması | `detail`    |    132 |        3 | PASS  |
| Haritanın Sessiz Seçimi         | `inference` |    126 |        3 | PASS  |
| Mesajdaki Boşluk                | `inference` |    149 |        3 | PASS  |
| Eski Fotoğrafın Yanındaki Not   | `inference` |    138 |        3 | PASS  |

Toplam: **9 content / 36 question**. Her içerikte 3 paragraf ve en uzun cümlede 23 kelime veya daha az ölçüldü; paragraf yoğunlukları editör incelemesinden geçti. Metinlerde belirgin Türkçe, yaş, akış, ana fikir, destekleyici fikir veya iç tutarlılık hard-fail'i bulunmadı.

## B. Question QA kriterleri

Her soru için aşağıdaki kontrol listesi uygulandı:

1. Tek, açık ve tek cümlelik bir görev var mı?
2. Cevap metinden kesin olarak belirlenebiliyor mu?
3. Doğru cevap sayısı tam bir mi?
4. Çeldiriciler aynı kapsam ve dilbilgisi biçiminde, metinle ilişkili ve makul yanlış anlamalara dayanıyor mu?
5. Seçenek sırası, seçenek uzunluğu veya prompt doğru cevabı mekanik olarak ele vermiyor mu?
6. Soru seviyesi ve bilişsel talep content objective'iyle uyumlu mu?
7. Cevap için metin kanıtı gösterilebilir mi?
8. Explanation doğru sonuca nasıl ulaşıldığını ve kanıtı açıklıyor mu?
9. Hint kanıtı işaret ediyor ancak doğru cevabı söylemiyor mu?
10. Türkçe, noktalama, yaş uygunluğu ve anlam açıklığı geçerli mi?
11. Soru metinden kopuk, belirsiz veya iki yoruma açık mı?

### B.1 Soru bazlı audit sonucu

Her satırdaki `1–4` ilgili content'in dört sorusudur; tüm hücreler yukarıdaki 11 kriterden geçti.

| Content                         | Q1   | Q2   | Q3   | Q4   | Soru mix / ölçülen odak                                                 |
| ------------------------------- | ---- | ---- | ---- | ---- | ----------------------------------------------------------------------- |
| Gölgeyi Ölçmek                  | PASS | PASS | PASS | PASS | MC ana fikir, MC açık detay, MC çıkarım, TF kanıt/tahmin                |
| Yukarıdan Bakınca               | PASS | PASS | PASS | PASS | MC koşullu yorum, MC kullanım, MC uyarı, TF sınırlılık                  |
| Kütüphane Rafındaki Harita      | PASS | PASS | PASS | PASS | MC kaynak sorgusu, MC katalog detayı, MC değerlendirme, TF başlık/kanıt |
| Akşam Işığı ve Beden Saati      | PASS | PASS | PASS | PASS | MC işlev, MC kayıt detayı, MC gözlem sınırı, TF süreç                   |
| Çiçeğin Ziyaretçileri           | PASS | PASS | PASS | PASS | MC süreç, MC gözlem alanı, MC gözlem sınırı, TF genelleme               |
| Toprağın Sünger Gibi Davranması | PASS | PASS | PASS | PASS | MC benzetme, MC özellik detayı, MC kavramsal ayrım, TF genelleme        |
| Haritanın Sessiz Seçimi         | PASS | PASS | PASS | PASS | MC açık tepki, MC neden, MC metin dışı çıkarımı reddetme, TF amaç       |
| Mesajdaki Boşluk                | PASS | PASS | PASS | PASS | MC bağlam, MC açık detay, MC davranış sonucu, TF kanıt/tahmin           |
| Eski Fotoğrafın Yanındaki Not   | PASS | PASS | PASS | PASS | MC kanıt sınırı, MC ipucu işlevi, MC belirsizlik, TF kaynak sınırı      |

### B.2 Dağılım ve bias audit'i

- Soru tipi: `27 MULTIPLE_CHOICE`, `9 TRUE_FALSE`.
- Bilişsel talep: `14 RECALL`, `11 UNDERSTAND`, `11 INFER`.
- Content track: her biri 3 içerik olmak üzere `main-idea`, `detail`, `inference`.
- MC doğru seçenek konumu: `a=7`, `b=7`, `c=6`, `d=7`.

Dağılım dengelidir; `max position ratio = 7/27 = 0.2593`, threshold altındadır. 8G-9A, doğru cevap ID'sini, soru kökünü, distractor metinlerini, explanation/hint'i değiştirmeden yalnızca MC seçenek sırasını permüte etti. Eski published v1 sürümleri korundu; TEST'te 27 QuestionVersion v2 ve 9 TemplateVersion v2 oluşturuldu.

## C. Question type-specific kabul ölçütleri

| Type              | Kabul ölçütü                                                                                                                                               | Bu pack'teki durum                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `MULTIPLE_CHOICE` | 3–5 karşılaştırılabilir seçenek; tam bir doğru seçenek; çeldiriciler metinle ilişkili ve makul; `allowMultiple=false`; açıklama kanıt gösterir.            | 27 adet, 4 seçenekli; PASS, `a=7/b=7/c=6/d=7`. |
| `TRUE_FALSE`      | Tek ve kısa bir metin iddiası; çift olumsuzluk veya mekanik tuzak yok; doğru/yanlış metin kanıtıyla belirlenir.                                            | 9 adet; iki seçenek `Doğru`/`Yanlış`; PASS.    |
| `FILL_BLANK`      | Boşluk objective için kritik; cümle grameri cevabı ele vermez; kabul edilebilir yazım/ifade varyantları tanımlıdır.                                        | Pack'te kullanılmadı; N/A.                     |
| `MATCHING`        | Sol ve sağ öğeler aynı semantik sınıfta; her eşleşme anlamlı ve birebir; rastgele harf/numara eşlemesi yok.                                                | Pack'te kullanılmadı; N/A.                     |
| `OPEN_ENDED`      | Prompt kapsamı, beklenen cevap varyantları ve rubric tanımlı; gerçek auto-grading yoksa sonuç `pending/manual review` olur; otomatik doğru/yanlış atanmaz. | Pack'te kullanılmadı; N/A.                     |

`OPEN_ENDED` için repository sözleşmesi gereği otomatik puan verilmesi bu aşamada kabul edilmez. İleride eklenecek açık uçlu sorular, rubric ve manual-review akışı olmadan publish edilmemelidir.

## D. Content / question alignment

Kontrol edilen zincir:

```text
Content
  → current published ContentVersion
  → Question / current published QuestionVersion
  → TemplateVersion content relation
  → TemplateVersion question relations
  → primary skill / track metadata
```

TEST DB read-only sonucu:

- Her 9 Content'in `currentVersionId` değeri ilgili v1 ContentVersion'a işaret ediyor.
- Her 36 Question, doğru Content'e ve doğru `position` değerine bağlı.
- Her 36 current published QuestionVersion prompt/options/correctAnswer/explanation/hint/difficulty alanı repository manifestiyle eşleşiyor; MC sorularında current version v2, doğru/yanlış sorularında v1 korunuyor.
- Her içerikte ContentSkill, Question.skillId ve Template.skillId aynı TEST skill kaydına bağlanıyor.
- Template config içindeki `primarySkill.role`, manifest `trackId` ile eşleşiyor.
- Her TemplateVersion, doğru ContentVersion'ı ve dört QuestionVersion'ı doğru sırayla taşıyor.
- Pack/source metadata ve `packId` generation metadata içinde korunuyor.

### D.1 Doğrulama sınırı

TEST DB'deki eşleşmeler teknik olarak PASS olsa da hedef değerler gerçek product taxonomy değildir:

- Level: `E2E-A1` / `Başlangıç` TEST fixture'ıdır.
- Skill kayıtları `Ex UX` adında, `COMPREHENSION` kategorisindeki TEST fixture'larıdır.
- Gerçek 13–17 grade/reading-proficiency ve gerçek `MAIN_IDEA` / `DETAIL` / `INFERENCE` production skill sözlüğü TEST DB'de doğrulanamaz.

Bu nedenle teknik relation PASS, fakat production-grade/skill semantics alignment **NOT VERIFIED / BLOCKED** olarak kalır. Yeni schema, migration veya invented skill/level seed'i bu aşamada eklenmemiştir.

## 3. Factual QA ve provenance

Metinler özgün Türkçe anlatımdır; source ID/URL manifestte tutulur. Aşağıdaki resmi/primary kaynaklar ilgili iddialarla karşılaştırıldı:

- [EPA — Benefits of Trees and Vegetation](https://www.epa.gov/heatislands/benefits-trees-and-vegetation): gölge ve evapotranspirasyonun yüzey/hava sıcaklığına katkısı.
- [NASA — Earth Observations](https://www.nasa.gov/wp-content/uploads/2023/03/earth-observations-ngs.pdf): uyduların kara, su ve atmosfer hakkında geniş alanlardan gözlem verisi toplaması.
- [UNESCO — Media and Information Literacy](https://www.unesco.org/en/articles/media-and-information-literacy): bilgiyi bulma, değerlendirme ve üretme becerileri.
- [NHLBI — Your Sleep/Wake Cycle](https://www.nhlbi.nih.gov/health/sleep/sleep-wake-cycle): ışık/karanlık ve yapay ışığın uyku–uyanıklık döngüsüyle ilişkisi.
- [USDA/FSA — Pollinator Activity Book](https://www.fsa.usda.gov/Internet/FSA_File/pollinator_activity_book.pdf): farklı hayvanların polen taşıma/tozlaşmadaki rolü.
- [USDA/NRCS — Role of Organic Matter](https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/role-of-organic-matter): organik madde, su tutma ve sızma ilişkisi.
- [USGS — Generalization](https://www.usgs.gov/centers/cegis/science/generalization): küçük ölçekli haritalarda okunabilirlik için ayrıntıların genellenmesi.

Factual QA sonucu: **PASS**. Kaynakta olmayan dış bilgiye dayalı bir doğru cevap veya source claim'iyle çelişen bir ifade bulunmadı.

## 4. Otomatik kontroller

`src/curriculum/first-real-pack-qa.ts` ortak manifest ve answer-position threshold kontrolünü; `scripts/qa-curriculum-pack.ts` explicit TEST hedefinde read-only pack/version kontrolünü; `scripts/qa-curriculum-catalog.ts` production-candidate catalog kontrolünü çalıştırır. MC sırası için `scripts/rebalance-curriculum-pack.ts` yalnızca explicit TEST hedefinde, yeni immutable version'lar yazar. DB QA şu güvenlik koşulları olmadan çalışmaz:

```powershell
$env:CURRICULUM_PACK_QA_ENVIRONMENT = "TEST"
$env:CURRICULUM_PACK_QA_DATABASE_URL = "<explicit local oku_plus_test URL>"
npm run qa:curriculum-pack
npm run qa:curriculum-catalog # gerçek catalog yoksa BLOCKED / exit 2
npm run rebalance:curriculum-pack # yalnız explicit TEST confirmation ile
```

Pack QA ve catalog QA `DATABASE_URL` fallback'i kullanmaz; yalnızca `127.0.0.1:5432/oku_plus_test` kabul eder ve hiçbir insert/update/delete çalıştırmaz. Rebalance scripti de başka hedefi kabul etmez; mevcut v1 kayıtlarını overwrite/delete etmeden version ekler ve ikinci çalışmada NOOP döner.

Son çalıştırma: **PASS / TEST_READ_ONLY**. MC answer-position: **PASS** (`a=7, b=7, c=6, d=7`, max ratio `0.2593`). Catalog validation: **BLOCKED**; Level/Skill kayıtları E2E/Ex UX fixture ve schema doğrudan Level→Skill/content→Level bağı taşımıyor.

## 5. Audit kararı

İçerik dili, metin yapısı, factual provenance, soru sözleşmesi, dengeli MC position dağılımı ve TEST DB current-version relation bütünlüğü geçti. Ancak TEST fixture Level/Skill kayıtları gerçek grade ve skill alignment kanıtı değildir; catalog validation bu nedenle BLOCKED/NOT VERIFIED'dır. 8G-8 production promotion blocker aynı şekilde açıktır.
