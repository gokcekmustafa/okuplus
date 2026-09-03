# OKU+ Reading Content Standard

Tarih: 2026-09-01  
Kapsam: Gerçek eğitim içeriği için editorial + pedagogical + technical standard  
Hedef kullanıcı: Ortaokul ve lise öğrencileri, özellikle 13–17 yaş  
Kaynaklar: `docs/CURRICULUM_ARCHITECTURE.md`, `docs/CURRICULUM_TAXONOMY.md`, gerçek `prisma/schema.prisma`, content/question servisleri ve `oku_plus_test` read-only incelemesi

Bu belge “AI ile güzel metin yazma rehberi” değildir. OKU+ içeriklerinin production'a alınmadan önce nasıl yazılacağını, hizalanacağını, kontrol edileceğini ve version geçmişi korunarak yayınlanacağını tanımlayan editorial standarddır.

## 1. Purpose

### 1.1 Reading content tanımı

OKU+ reading content, öğrencinin okuyacağı temel metindir. Her metin:

- açık bir learning objective taşır;
- en az bir gözlenebilir reading skill'i hedefler;
- belirli bir Grade Level beklentisine uygundur;
- bir veya daha fazla Topic/Content Domain bağlamına oturur;
- anlamlı soru üretimini destekleyecek açık bilgi, ana fikir, kanıt ve çıkarım fırsatı içerir;
- yaş, dil, telif, doğruluk ve erişilebilirlik açısından publish gate'ten geçer.

Bu pedagojik tanım teknik modelden bağımsızdır. Teknik olarak bugün body, version ve publish lifecycle `ContentVersion` üzerindedir; `Content` katalog kimliğidir.

### 1.2 Content ne değildir?

- Sadece uzun bir paragraf değildir.
- Rastgele soru üretmek için bilgi yığını değildir.
- Skill'in veya Topic'in kendisi değildir.
- Reading difficulty ile learner proficiency'nin aynı sayısı değildir.
- Published olduktan sonra düzenlenen mutable bir doküman değildir.

## 2. Target users

Ana kullanıcı 13–17 yaş aralığındaki ortaokul ve lise öğrencisidir. İçerikler:

- çocukça veya küçümseyici olmamalı;
- gereksiz akademik jargonla ağırlaşmamalı;
- doğal ve güncel Türkçe kullanmalı;
- merak uyandırmalı, ancak clickbait olmamalı;
- sınav hazırlığına uyumlu ölçme noktaları içermeli;
- bireysel kullanımda bağımsız okumayı, kurum kullanımında ortak öğretim hedefini desteklemeli;
- farklı ilgi alanlarını kapsarken öğrenciyi tek bir domain'e hapsetmemeli.

Yaş uygunluğu, metni basitleştirmek değil; konu, dil, soyutluk, bağlam, hassasiyet ve bilişsel yükü hedef öğrenciye göre ayarlamaktır.

## 3. Grade

### 3.1 Grade ve reading proficiency ayrımı

```text
Grade Level        = okul müfredatı / sınıf bağlamı
Reading Proficiency = öğrencinin metni okuyup anlamlandırma kapasitesi
```

OKU+ için hedef grade kapsamı 5, 6, 7, 8, 9, 10, 11 ve 12. sınıftır. Grade, content'in hedeflendiği curriculum bandını gösterir; öğrencinin her reading skill'de aynı derecede iyi olduğunu varsaymaz.

### 3.2 Gerçek mevcut schema

Mevcut `Level` global bir katalogdur ve `code`, `name`, `minScore`, `maxScore`, nullable `gradeBand`, `difficultyMin`, `difficultyMax`, `displayOrder` ve `createdAt` alanlarını taşır. Content veya ContentVersion üzerinde grade relation'ı yoktur. `gradeBand` serbest metindir ve kontrollü 5–12 sözlüğü değildir.

Bu aşamada yeni Level seed'i, grade enum'u veya Content.grade alanı eklenmemiştir.

### 3.3 Editorial grade kuralı

Her production content için editoryal brief'te hedef grade açıkça yazılmalıdır. Bu brief alanı bugün database'de first-class değildir; schema extension tamamlanana kadar authoring manifest/checklist içinde tutulabilir, ancak ContentVersion metadata'sı varmış gibi varsayılamaz.

Grade seçimi şu faktörlerle gerekçelendirilmelidir:

- beklenen ön bilgi;
- cümle ve paragraf yoğunluğu;
- kavramsal soyutluk;
- vocabulary yükü;
- hedef question demand;
- exam/assessment bağlamı.

## 4. Proficiency

Reading proficiency grade değildir. Aynı 8. sınıf öğrencisi farklı skill'lerde farklı proficiency gösterebilir.

Mevcut schema'da reading proficiency alanı/modeli yoktur. Şunlar proficiency olarak kullanılmayacaktır:

- `Content.difficulty`;
- `QuestionVersion.difficulty`;
- `ContentVersion.readabilityScore`;
- `Level.difficultyMin` / `difficultyMax`;
- `StudentProgress.masteryScore`.

İleride proficiency, evidence ve rubric ile tanımlanmış ayrı bir learner/content alignment katmanı olmalıdır. Kavramsal bandlar `Gelişen`, `Gelişiyor`, `Bağımsız`, `İleri` olabilir; bu değerler bu aşamada enum veya seed değildir.

## 5. Age appropriateness

Grade primary curriculum anchor'dır; age band ise content selection ve safety/editing guard'ıdır. İleride `13–14`, `15–16`, `17+` gibi target age band'leri yararlı olabilir.

Avantajlar:

- konu ve ton için daha hassas editoryal karar;
- hassas içerik filtresi;
- ilgi alanı ve örnek bağlamların yaşa göre seçilmesi;
- kurum/personal kullanımında daha güvenli öneri.

Dezavantajlar:

- doğum yılı/yaş kesin pedagojik yeterlilik değildir;
- aynı yaşta büyük okuma farkı olabilir;
- fazla dar bantlar içerik tekrarını ve erişimi artırabilir;
- grade ile çakışan iki ayrı “seviye” üretme riski vardır.

Öneri: grade-based curriculum + age-appropriate editorial review. Age band ileride nullable metadata/alignment olabilir; bu aşamada schema'ya otomatik eklenmez ve erişim kontrolü olarak kullanılmaz.

## 6. Content types

### 6.1 Gerçek teknik ContentType

Schema'daki `ContentType` değerleri:

- `PASSAGE`
- `STORY`
- `POEM`
- `ARTICLE`
- `DIALOGUE`

`Content.type` runtime katalog sınıfıdır; daha ayrıntılı editorial genre sözlüğü değildir.

### 6.2 Önerilen editorial text type/genre vocabulary

| Editorial tür   | Pedagojik amaç                                          | 13–17 uygunluk notu                                |
| --------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Bilgilendirici  | Olgu, açıklama ve ana fikir bulma                       | Grade'e uygun konu yoğunluğu ile uygundur          |
| Öyküleyici      | Olay, karakter, neden-sonuç ve çıkarım                  | Çocukça olmayan kısa/orta anlatılar uygundur       |
| Açıklayıcı      | Bir süreç, kavram veya sistemin nasıl işlediğini kurmak | Fen, teknoloji ve günlük yaşam için uygundur       |
| Görüş/argüman   | İddia, gerekçe, kanıt ve karşılaştırma                  | Tarafsızlık ve kaynak standardı gerektirir         |
| Biyografi       | Kronoloji, seçimler, neden-sonuç ve yaşam bağlamı       | Tarih/kültür/kariyer bağlamında uygundur           |
| Röportaj        | Soru-cevap, perspektif ve bilgi seçimi                  | Gerçek veya açıkça kurgusal olduğu belirtilmelidir |
| Deneme          | Yorum, kişisel düşünce ve yapı farkındalığı             | Soyutluk grade/proficiency ile ayarlanmalıdır      |
| Popular science | Bilimsel fikri erişilebilir dille açıklama              | Uydurma istatistik ve aşırı basitleştirme yasaktır |

Bu editorial türler mevcut enum'a yeni değer olarak eklenmemiştir. Gerekirse ileride `genre`/metadata veya controlled content taxonomy ile teknikleştirilmelidir. Canlı database'de 11 non-deleted published Content'ın tamamı `PASSAGE` tipindedir; bu, tür çeşitliliği standardının henüz uygulanmadığını gösterir.

## 7. Topics

Topic/Content Domain, “metin hangi alana veya bağlama ait?” sorusunu cevaplar. Aşağıdaki vocabulary adaydır:

- Bilim
- Teknoloji
- Doğa ve çevre
- Tarih
- Kültür
- Sanat
- Toplum ve yurttaşlık
- Spor ve iyi yaşam
- Psikoloji
- Günlük yaşam
- Kariyer ve gelecek

Topic skill değildir. `Bilim` topic/domain'dir; `Çıkarım yapma` skill'dir. Bir metin birden fazla domain'e bağlanabilir. Topic için tekil parent varsayımı yapılmamalı; gelecekte controlled global domain + version-aware content alignment tercih edilmelidir.

Bu aşamada Topic modeli veya seed oluşturulmamıştır.

## 8. Skills

### 8.1 Mevcut skill vocabulary

Gerçek `SkillCategory` değerleri ve öğrenci dili:

| Teknik          | Öğrenci dili     | Learning outcome                               |
| --------------- | ---------------- | ---------------------------------------------- |
| `MAIN_IDEA`     | Ana fikri bul    | Metnin merkez düşüncesini belirler             |
| `DETAIL`        | Detayları yakala | Açık bilgi ve kanıtı bulur                     |
| `INFERENCE`     | Çıkarım yap      | Metinden desteklenen örtük sonucu çıkarır      |
| `VOCABULARY`    | Kelime hazinesi  | Kelimeyi bağlam içinde anlamlandırır           |
| `FACTUAL`       | Bilgiyi bul      | Metinde doğrudan verilen olguyu seçer/doğrular |
| `COMPREHENSION` | Metni anla       | Metnin genel anlamını ve ilişkilerini kurar    |

Mevcut `Skill` globaldir; `code` unique, `name`, `category`, optional description, displayOrder ve createdAt taşır. Status, Level relation'ı, primary/secondary role veya Topic relation'ı yoktur.

### 8.2 Content skill alignment

Her content editorial brief'te:

- bir Primary Skill;
- gerektiğinde en fazla birkaç Secondary Skill;
- her skill için gözlenebilir outcome

belirlenmelidir. Mevcut teknik `ContentSkill` many-to-many relation'ı Content'i birden fazla Skill'e bağlayabilir, ancak primary/secondary rolü saklamaz. Bu nedenle primary/secondary ayrımı bugün editorial contract'tır; database alanı değildir.

Question bugün optional tek `skillId` taşır. Çoklu skill ölçümü veya version-aware skill alignment 8G-4/gelecek schema ADR'sinde ele alınmalıdır.

## 9. Reading length

Önerilen başlangıç length band'leri:

| Band | Kelime aralığı | Kullanım                                                |
| ---- | -------------- | ------------------------------------------------------- |
| Mini | 100–180        | Hız, ısınma, kısa açık bilgi/tek hedef                  |
| Kısa | 180–300        | Ana fikir, detay ve kısa inference                      |
| Orta | 300–500        | Çok paragraflı comprehension ve question mix            |
| Uzun | 500–800+       | İleri grade, exam benzeri veya çok adımlı anlamlandırma |

Bu aralıklar başlangıç standardıdır, katı otomatik red kuralı değildir. Aynı kelime sayısı farklı cümle yapısı, vocabulary ve conceptual density nedeniyle farklı zorluk yaratabilir.

Length kararı:

- Grade yükseldikçe orta/uzun band kullanımı artabilir.
- `SPEED` hedefi mini/kısa bandı ve gereksiz tekrarın azaltılmasını destekler.
- `COMPREHENSION` ve `INFERENCE` için yeterli bağlam yoksa metin gereksiz kısaltılmamalıdır.
- `EXAM` için orta/uzun band ve süreli exercise ayrı katmanda ele alınabilir.
- Assessment passages, soru sayısı ve kanıt ihtiyacına göre seçilmelidir.

## 10. Word count

Word count şu amaçlar için önemlidir:

- yaklaşık reading time;
- WPM/fluency ölçümü;
- content sizing ve mobile pacing;
- length band raporlaması;
- difficulty değerlendirmesinde bir sinyal.

Gerçek schema'da `ContentVersion.wordCount` vardır ve service body'den otomatik hesaplar. Mevcut hesap trim + whitespace split yaklaşımıdır; manuel metadata olarak girilmemelidir.

Editorial kural: body değiştiğinde word count yeniden hesaplanmalı; publish edilmiş version'ın word count'ı sonradan elle düzeltilmemelidir. Dilsel tokenization daha hassas hale getirilecekse yeni hesaplama sürümü ve backfill planı ayrıca tanımlanmalıdır.

Canlı fixture verisinde 11 published ContentVersion'ın word count'ı 2–60 aralığındadır. Bu değerler production reading standardını temsil etmemekte, mevcut fixture'ların kısa olduğunu göstermektedir.

## 11. Reading time

İleride tahmini okuma süresi kavramsal olarak:

```text
estimated reading seconds = wordCount / expected reading speed × 60
```

Bu aşamada sabit veya sahte WPM değeri kodlanmayacaktır. Expected reading speed; grade, proficiency, content type, goal ve ölçüm bağlamı ile standardize edilmeden gerçek süre iddiası yapılmamalıdır.

Bugün `ContentVersion` üzerinde estimated reading time alanı yoktur. Word count, süre için ham girdidir; tek başına öğrencinin performans süresi değildir. Gerçek timeSpentMs session/attempt runtime kanıtıdır.

## 12. Language quality

Her Türkçe metin:

- güncel yazım ve noktalama kurallarına uygun;
- doğal, akıcı ve insan yazımı hissi veren;
- gereksiz tekrar ve dolgu cümlelerinden arınmış;
- zamir, zaman, özne ve gönderim bakımından tutarlı;
- yaşa uygun fakat küçümseyici olmayan kelime seçimine sahip;
- paragraf geçişleri anlamlı;
- translationese, robotik kalıp ve yapay SEO dilinden uzak

olmalıdır.

Editoryal okuyucu şu soruyu sormalıdır: “Bu cümle Türkçe düşünen bir yazarın doğal cümlesi mi, yoksa başka dilden çevrilmiş/AI tarafından parlatılmış gibi mi?”

## 13. Vocabulary

Metin başına vocabulary planı zorunlu alan değil, ihtiyaç halinde editorial annotation'dır. İşaretlenebilecek unsurlar:

- hedef yeni kelime/terim;
- metindeki bağlam cümlesi;
- öğrencinin bağlamdan çıkarabileceği anlam;
- kelimenin yaklaşık zorluk sinyali;
- yanlış ama makul anlamlarla karışma riski;
- gerekiyorsa kısa, yaşa uygun gloss.

Kelime anlamı metnin anlamını bozacak kadar kritikse context clue veya gerektiğinde hint sağlanmalıdır. Her bilinmeyen kelimeyi açıklamak metni kolaylaştırıp vocabulary becerisini ortadan kaldırmamalıdır.

Mevcut schema'da Vocabulary entity/annotation yoktur. `SkillCategory.VOCABULARY`, QuestionVersion hint/explanation ve options JSON kullanılabilir; structured vocabulary relation gelecekte extension olarak değerlendirilmelidir.

## 14. Content structure

Standart reading passage için önerilen yapı:

1. Title.
2. Hook/opening.
3. Main body.
4. Coherent paragraphs.
5. Conclusion/closure.

Bu iskelet her tür için zorunlu değildir:

- Röportaj soru-cevap akışı kullanabilir.
- Şiir line/stanza yapısı kullanabilir.
- Diyalog konuşma dönüşleriyle ilerleyebilir.
- Görüş yazısı iddia → gerekçe → kanıt → sonuç yapısı kullanabilir.

Metin, structure değişse bile primary learning objective'i ve questionability'yi korumalıdır.

## 15. Hook

İlk 1–2 cümle öğrencinin dikkatini ve merakını kazanmalıdır. İyi hook:

- metnin gerçek sorusunu veya gerilimini açar;
- somut bir gözlem, kısa soru, şaşırtıcı ama doğrulanabilir bilgi veya durum kullanır;
- metnin devamında karşılığını bulur;
- clickbait, korkutma ve yapay şaşırtma kullanmaz;
- çocukça ünlem ve aşırı basit sloganlara yaslanmaz.

Hook, cevabı baştan vermemeli ve metnin geri kalanıyla ilgisiz bir vaat kurmamalıdır.

## 16. Paragraph design

Mobile reading için:

- bir paragrafta baskın bir fikir bulunmalı;
- kısa/orta paragraf tercih edilmeli;
- paragraf geçişleri açık olmalı;
- uzun bloklar alt fikir veya mantıklı geçişlerle bölünmeli;
- liste/başlık gerekiyorsa semantik olarak anlamlı kullanılmalı;
- “small chunks” yaklaşımı anlam bütünlüğünü bozacak kadar parçalanmamalı.

Başlangıç önerisi: tipik paragraf 2–5 cümle veya yaklaşık 40–90 kelime civarında tutulabilir; bu katı limit değildir. Şiir, diyalog ve kısa açıklama gibi türler kendi yapısına göre değerlendirilir.

## 17. Difficulty

Difficulty tek bir sayı değildir. Editorial review şu bileşenleri ayrı düşünmelidir:

| Boyut                 | Soru                                                       |
| --------------------- | ---------------------------------------------------------- |
| Language complexity   | Cümle ve kelime yapısı ne kadar yoğun?                     |
| Conceptual complexity | Ön bilgi ve soyutlama ihtiyacı ne kadar?                   |
| Sentence complexity   | Cümle uzunluğu, bağlaç ve gömülü yapı yükü ne kadar?       |
| Vocabulary difficulty | Yeni/alan terimi yükü ne kadar?                            |
| Inferential demand    | Cevap için örtük ilişki kurmak gerekiyor mu?               |
| Question difficulty   | Metin kolay olsa bile soru kökü/kanıt talebi ne kadar zor? |

Mevcut schema:

- `Content.difficulty`: tek Float, 0..1 service validation ile sınırlı.
- `QuestionVersion.difficulty`: nullable Float; anlam/aralık contract'ı schema'da açık değildir.
- `ContentVersion.readabilityScore`: nullable; ölçüm yöntemi ve versiyonu yoktur.
- `Level.difficultyMin/max`: var, fakat hangi zorluk boyutunu temsil ettiği net değildir.
- Attempt üzerinde calibrated itemDifficulty gibi teknik ölçüm alanları bulunur; bunlar authoring difficulty ile aynı değildir.

Production standardında editorial difficulty brief'i bu boyutları sözel olarak gerekçelendirmeli; tek sayı bu gerekçenin yerine geçmemelidir.

## 18. Questionability

İyi reading content, yapay biçimde “soru doldurulmuş” değil; doğal biçimde ölçülebilir kanıtlar içeren metindir. Metinde mümkünse:

- açık bilgi ve güvenilir detay;
- tek veya baskın ana fikir;
- metin içi kanıt;
- en az bir anlamlı çıkarım fırsatı;
- neden-sonuç, karşılaştırma veya yapı ilişkisi;
- gerektiğinde bağlamdan kelime anlamı

bulunmalıdır.

Her soru cevabını metinde destekleyen kanıt veya makul çıkarım bulunmalı; dışarıdan bilgi isteyen, belirsiz veya iki doğru cevaba açık soru üretilmemelidir.

## 19. Factual accuracy

Gerçek bilgi içeren metinlerde:

- yanlış bilgi ve uydurma istatistik;
- uydurma kaynak veya sahte alıntı;
- bağlamından koparılmış kesin iddia;
- doğrulanamayan güncel bilgi;
- gerçek kişi/kurum hakkında kanıtsız isnat

bulunmamalıdır.

Factual claim içeren metin için kaynak/provenance editör tarafından kontrol edilmelidir. Kaynak öğrencinin metninde görünmek zorunda değildir, ancak editorial record'da izlenebilir olmalıdır.

Kurgu metin açıkça kurgu olarak sınıflandırılmalı; kurgu içindeki gerçek bilgi iddiası ile anlatı unsuru birbirine karıştırılmamalıdır.

## 20. Sensitive content

13–17 yaş standardı özel içerik politikası gerektirir. Aşağıdaki alanlar senior editorial review olmadan publish edilmemelidir:

- nefret, dehumanization veya hedef gösterme;
- graphic violence veya şiddeti yüceltme;
- sexual content veya sexual exploitation;
- siyasi propaganda, hedefli partizan ikna veya manipülatif mesaj;
- tehlikeli davranışın talimatlı/özendirici sunumu;
- self-harm veya suicide içerikleri;
- yeme bozukluğu, madde kullanımı veya suç davranışının romantize edilmesi.

Konu eğitimsel olarak gerekli ise:

- grafik ayrıntıdan kaçınılmalı;
- davranış talimatı verilmemeli;
- zarar verici davranış yüceltilmemeli;
- dengeli ve bağlamlı anlatım kullanılmalı;
- yaş/grupla uygunluğu ayrıca incelenmeli.

Bu aşamada policy engine, automated classifier veya UI warning sistemi yapılmamıştır; bu belge future editorial policy contract'ıdır.

## 21. Copyright

OKU+ content:

- telifli kitaptan izinsiz kopyalanmamalı;
- web sayfasından aynen alınmamalı;
- sınav kitabı veya ücretli bankadan kopyalanmamalı;
- yalnızca küçük değişikliklerle türetilmiş/plagiarized görünmemeli.

Tercih sırası:

1. Original content.
2. Açıkça uygun lisanslı kaynak.
3. Lisans şartlarına uygun, editoryal olarak dönüştürülmüş/adapte içerik.

Copyright belirsizse içerik publish edilmez. Lisansın varlığı, metnin factual accuracy veya pedagojik kalitesini otomatik garanti etmez.

## 22. Provenance

Her production content için ileride şu provenance bilgileri tutulmalıdır:

- author/creator;
- source;
- source type: original/licensed/adapted gibi controlled vocabulary;
- license;
- adaptation note;
- reviewer/editor;
- reviewedAt;
- factual verification note;
- AI involvement ve model/provenance bilgisi varsa bunun açık kaydı.

Gerçek schema bugün:

- `Content.createdById` ve `ContentVersion.createdById` creator relation'ı;
- `ContentVersion.license`;
- `ContentVersion.changelog`;
- `publishedAt` ve status;
- QuestionVersion için `generationMetadata`.

Source, author, reviewedBy/reviewedAt, provenance ve editorial decision first-class değildir. `createdById` editoryal author veya reviewer kanıtının tamamı olarak yorumlanmayacaktır.

## 23. Learning objective

Her content için tek cümlelik, gözlenebilir bir objective yazılmalıdır:

> Öğrenci bunu okuduktan sonra neyi yapabilecek?

İyi objective:

- tek primary outcome içerir;
- “anlar” gibi ölçülmesi zor fiiller yerine belirler, bulur, karşılaştırır, çıkarır, kanıtlar gibi gözlenebilir fiil kullanır;
- grade ve hedef skill ile uyumludur;
- sonraki Question Blueprint'e doğrudan bağlanabilir.

Örnekler:

- “Öğrenci metnin ana düşüncesini belirleyebilir.”
- “Öğrenci metindeki örtük nedensellik ilişkisini metin kanıtıyla çıkarabilir.”

Objective bugün schema alanı değildir; authoring brief ve future content metadata için zorunlu standarddır.

## 24. Skill alignment

Her content için editorial brief:

- Primary Skill;
- isteğe bağlı Secondary Skill;
- her skill'in objective içindeki rolü;
- bu skill'i ölçmeye uygun cümle/paragraf kanıtı

belirtmelidir.

Teknik mevcut durum: `ContentSkill` Content ↔ Skill many-to-many relation'ıdır; primary/secondary rolü yoktur. Question `skillId` optional tek değerdir. Bu nedenle content'in birden fazla skill'e bağlanması mümkündür, fakat “ana hedef” bugün database'de ayırt edilemez.

Öneri: 8G-4 Question Blueprint ve sonraki schema ADR'si primary/secondary, version-aware alignment ve multi-skill measurement contract'ını birlikte belirlemelidir.

## 25. Question mix

Bir passage'a aynı tipten gereğinden fazla soru yüklenmemelidir. Başlangıçta 5 soruluk örnek mix şu olabilir:

- 2 comprehension/general understanding;
- 1 detail;
- 1 inference;
- 1 vocabulary veya context clue.

Bu bir production zorunluluğu değil, Question Blueprint aşamasına girdi sağlayan örnektir. Text type, skill objective, passage length ve assessment context mix'i değiştirir.

### 25.1 Content → Question → Exercise

Mevcut teknik zincir:

```text
Content
  → Question[]
    → QuestionVersion[]
      → ExerciseTemplateVersionQuestion
        → ExerciseTemplateVersion
          → ExerciseSession
```

Bir Content birden fazla Question taşıyabilir ve farklı ExerciseTemplate/TemplateVersion paketlerinde yeniden kullanılabilir. `ExerciseTemplate.contentId` optional direct relation'a ek olarak versioned content/question join'leri vardır. TemplateVersion published ContentVersion ve QuestionVersion'ları position ile paketler.

Bu nedenle reading content, tek bir exercise'e kilitlenmemelidir. İçerik standardı reusable content identity + immutable versions yaklaşımını korur.

### 25.2 Distractor quality

Yanlış seçenekler:

- saçma veya rastgele olmamalı;
- açıkça yanlış olarak kendini ele vermemeli;
- doğru cevabın uzunluğu/grameriyle ipucu vermemeli;
- metin dışı bilgiye yaslanmamalı;
- öğrencinin muhtemel yanlış okumasını ölçmeli, kavram karmaşası yaratmamalı.

Distractor ve scoring ayrıntıları 8G-4 Question Blueprint'te kesinleştirilecektir.

## 26. Exam compatibility

`EXAM` learning goal, bu aşamada generic `EXAM_PREPARATION` lens'idir. LGS, TYT veya AYT'yi doğrudan schema'ya gömmek için yeterli curriculum evidence yoktur.

Exam-compatible content:

- net paragraf yapısına;
- zaman baskısıyla okunabilir hacme;
- kanıtlanabilir soru köklerine;
- makul distractor'lara;
- gerektiğinde karşılaştırma/çıkarım ve anlam bütünlüğü taleplerine

uygun olmalıdır.

Time pressure Content'in kendisine zorunlu olarak yazılmamalı; exercise/assessment layer'da yönetilmelidir.

### 26.1 Content → Assessment

Mevcut `Assessment` Level'e optional `levelId` ile bağlanabilir ve `PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK` tiplerini taşır. Assessment'ın template/templateVersion seçimi bugün JSON config/service validation içindedir; Content'e doğrudan relation yoktur.

Passage-based assessment, TemplateVersion composition içindeki ContentVersion + QuestionVersion setiyle mümkündür. Standalone assessment ise content olmadan template/question seti kullanabilir. Bir assessment birden fazla passage ve soru içerebilir; bu içerik bağlantısı Assessment modelinde first-class değil, template composition'dadır.

## 27. Versioning

### 27.1 Content version standardı

Metin düzeltildiğinde:

```text
old ContentVersion → new ContentVersion
```

oluşturulmalıdır. Bugünkü schema/service bunu destekler:

- `Content` katalog kimliğini korur;
- `ContentVersion(contentId, version)` unique'tir;
- body ve title version'dadır;
- wordCount body'den yeniden hesaplanır;
- published version immutable'dır;
- `currentVersionId` güncel published pointer'dır;
- eski version ve session snapshot korunur.

### 27.2 Soru ve attempt geçmişi

QuestionVersion da ayrı version history taşır. Attempt, QuestionVersion'a bağlanır; published soru/metin sonradan mutate edilmemelidir. Content body'deki factual/pedagogical değişiklik soruları etkiliyorsa yeni QuestionVersion ve gerektiğinde yeni TemplateVersion üretilmelidir.

Taxonomy veya editorial metadata değişikliği eski published version'ın tarihsel anlamını geriye dönük değiştirmemelidir. ContentSkill ve Question.skillId bugün root seviyesinde olduğu için version-aware alignment gelecek migration riskidir.

## 28. Publication

### 28.1 Gerçek status'ler

Mevcut schema'da ContentVersion için `DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED` vardır. Root Content için `DRAFT`, `PUBLISHED`, `ARCHIVED` vardır. `APPROVED` enum'u yoktur ve bu aşamada icat edilmeyecektir.

Gerçek servis akışı:

```text
DRAFT → REVIEW → PUBLISHED → ARCHIVED
```

Servis bugün DRAFT version'ı REVIEW'e alır; DRAFT/REVIEW version'ı PUBLISHED yapar; published ContentVersion değiştirilemez ve değişiklik yeni version gerektirir.

### 28.2 Editorial anlam

Teknik `REVIEW` status'ı, insan review kaydının kendisi değildir. Publish edilmeden önce bu standardın editorial checklist'i uygulanmalı; reviewer, decision ve evidence ayrı bir future review domain'i ile izlenmelidir.

## 29. Quality gates

Bir content published olmadan önce aşağıdaki gate'lerin tümü PASS veya belgelenmiş waiver olmalıdır:

1. Language QA — Türkçe, yazım, akıcılık, tutarlılık.
2. Factual QA — kaynak, doğruluk, güncellik ve iddia seviyesi.
3. Age QA — 13–17, grade, konu ve hassasiyet uygunluğu.
4. Skill alignment — primary/secondary skill ve objective uyumu.
5. Difficulty QA — language/concept/vocabulary/inference ayrı değerlendirme.
6. Questionability — açık bilgi, ana fikir, detay, çıkarım ve bağlam ipucu.
7. Copyright — original veya uygun license/provenance.
8. Accessibility — semantik yapı, text alternative, okunabilirlik ve media requirements.
9. Editorial integrity — clickbait, bias, manipulation, stereotype ve unsupported claim kontrolü.

### 29.1 Quality score politikası

Bu aşamada mastery/content quality için sayısal formula uydurulmamıştır. Gate sonuçları şimdilik checklist + reviewer note olarak tutulmalıdır. İleride internal QA score tasarlanırsa:

- pedagojik mastery ile karıştırılmamalı;
- score'un rubric version'ı bulunmalı;
- tek sayı failed gate'i gizlememeli;
- published history'yi geriye dönük değiştirmemeli.

## 30. Accessibility

Reading content aşağıdaki erişilebilirlik prensipleriyle yazılmalı ve render edilmelidir:

- başlık ve paragraf semantik olarak ayırt edilebilir;
- anlam yalnızca renk, font weight veya görsel konumla taşınmamalı;
- gereksiz all-caps, dekoratif unicode ve aşırı noktalama kullanılmamalı;
- ekran okuyucu ile sıralı okunabilmeli;
- image/audio/video kullanılıyorsa alt text, caption/transcript ve role bilgisi bulunmalı;
- link veya referans metni bağlamdan anlaşılmalı;
- kontrast, font size ve line height UI katmanında okunabilir olmalı.

Mevcut `QuestionMedia` altText/caption taşır, ancak ContentVersion'a doğrudan media relation'ı yoktur. Content-level media gerektiğinde future extension gerekir.

## 31. Mobile

390×844 viewport için başlangıç reading standardı:

- kısa/orta paragraf ve rahat scroll;
- tiny text kullanılmaması;
- yeterli line-height ve paragraph spacing;
- satırların gereksiz uzun tutulmaması;
- yatay scroll oluşturan tablo/inline içerikten kaçınma;
- justified text zorunluluğu olmaması; ragged-right metin okunabilirliği korunmalı;
- title, heading ve body hiyerarşisinin görünür olması;
- anlamlı bölüm geçişlerinde küçük chunk'lar, ancak metnin doğal bütünlüğünü bozmayacak pacing.

Bu belge kod/UI değişikliği yapmaz; gerçek mobile visual QA ayrı browser/device testlerinde doğrulanmalıdır.

## 32. AI policy

AI kullanılacaksa minimum workflow:

```text
AI draft
  → human editorial review
    → pedagogical QA
      → factual/copyright/bias check
        → approved version
          → publish
```

AI-generated content doğrudan PUBLISHED olamaz. Prompt, model/version, generated draft, human changes, source/provenance ve safety findings mümkün olduğunca izlenmelidir.

Mevcut `QuestionGenerationJob` yalnızca future question-generation queue başlangıcıdır; content generation pipeline, worker, safety gate ve provenance çözümü değildir. Bu aşamada AI content veya bulk question üretimi yapılmamıştır.

## 33. Human review

Gerçek publish öncesi insan kontrolü zorunlu olmalıdır. Reviewer şu boyutları kontrol eder:

- pedagogy ve learning objective;
- Türkçe language quality;
- factual accuracy ve kaynak;
- age/grade appropriateness;
- questionability ve future question quality;
- bias, stereotype ve sensitive content;
- copyright/license/provenance;
- accessibility ve mobile readability.

Mevcut ContentVersion `REVIEW` status'ı bunu gösteren lifecycle durumudur; reviewer, decision, reject reason, rubric version ve reviewedAt için ayrı ReviewRecord yoktur. Bu model future schema extension'dır.

## 34. Metadata matrix

| Metadata               | Mevcut schema                                                          | Bu standarda göre gerekli mi?         | Hangi aşama / karar                                        |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Title                  | Content + ContentVersion var                                           | Evet                                  | Şimdi kullan; version ile birlikte QA                      |
| Body                   | Yalnız ContentVersion'da var                                           | Evet                                  | Şimdi kullan; published immutable                          |
| WordCount              | ContentVersion'da var; service otomatik hesaplar                       | Evet                                  | Şimdi kullan; manuel girme                                 |
| Skill                  | ContentSkill var; Question tek optional skill                          | Evet                                  | Şimdi primary/secondary brief; ileride role-aware relation |
| Level/Grade            | Level global; Content alignment yok                                    | Evet                                  | Grade 5–12 contract şimdi; schema alignment sonra          |
| Reading Proficiency    | Yok                                                                    | Evet, ama ayrı kavram                 | İleride rubric + alignment                                 |
| Topic/Domain           | Yok                                                                    | Evet                                  | İleride global controlled vocabulary + alignment           |
| Unit                   | Yok                                                                    | Curriculum için evet                  | Gerçek örneklerden sonra                                   |
| Age band               | Yok                                                                    | Editorial guard olarak evet           | İleride nullable metadata                                  |
| Difficulty             | Content 0..1; QV optional; semantics eksik                             | Evet                                  | Şimdi sözel rubric; ileride dimensions/contract            |
| TextType/Genre         | ContentType sınırlı enum var                                           | Evet                                  | Şimdi editorial brief; teknik genre sonra                  |
| LearningGoal           | StudentProfile'da `SPEED`, `COMPREHENSION`, `EXAM`, `SELF_IMPROVEMENT` | Lens olarak evet                      | Şimdi content brief etkisi; algorithm sonra                |
| Source                 | Yok                                                                    | Evet                                  | Provenance extension                                       |
| License                | ContentVersion'da nullable var                                         | Evet                                  | Şimdi doldur; publish gate yap                             |
| Author                 | createdById var; editorial author ayrı değil                           | Evet                                  | Provenance extension                                       |
| Reviewer/reviewedAt    | Yok                                                                    | Evet                                  | ReviewRecord extension                                     |
| ReviewStatus           | VersionStatus REVIEW var; review entity yok                            | Evet                                  | Şimdi lifecycle; evidence sonra                            |
| Publication            | status, publishedAt, currentVersionId var                              | Evet                                  | Şimdi kullan                                               |
| Locale                 | Yok                                                                    | Evet                                  | Translation/content expansion öncesi                       |
| Readability score      | Nullable alan var; canlı published fixture'larda 11/11 null            | Yararlı, tek başına yeterli değil     | Method/version contract sonra                              |
| Estimated reading time | Yok                                                                    | Yararlı                               | WPM standardı kesinleşince                                 |
| Vocabulary annotations | Yok                                                                    | Gerektiğinde                          | Future structured annotation                               |
| Accessibility review   | Yok                                                                    | Evet                                  | Checklist şimdi; metadata/review record sonra              |
| Media                  | QuestionVersionMedia var; ContentVersion relation yok                  | Türüne göre                           | Content-level media extension sonra                        |
| Provenance/AI          | QuestionVersion generationMetadata var; content provenance yok         | AI/original/lisanslı içerik için evet | Future provenance contract                                 |
| Question mix           | Template/question composition ile kısmen                               | Evet                                  | 8G-4 blueprint                                             |
| Quality score          | Yok                                                                    | Ayrı rubric olarak                    | Formula bu aşamada yok                                     |

Canlı gap kanıtı: 11 published ContentVersion'ın tamamında `readabilityScore` ve `license` null; 31 published QuestionVersion'ın tamamında difficulty, explanation ve hint null; QuestionMedia ve QuestionGenerationJob sayısı 0. Bunlar mevcut fixture durumudur ve production standardı olarak kabul edilmez.

## 35. Schema recommendations

### 35.1 Karar

Karar: **B — Minimum schema extension gerekli; bu aşamada uygulanmadı.**

Mevcut schema editorial standardın yaklaşık %60–70'lik teknik çekirdeğini taşıyabilir: title, body, type, difficulty placeholder, wordCount, Skill relation, Question relation, versioning, publication, creator, license ve exercise/assessment composition. Grade/content-domain/proficiency/provenance/review/accessibility tarafı tamamlanmış değildir.

### 35.2 Minimum extension adayları

İsimler migration öncesi ADR'de kesinleştirilecektir:

1. Content/ContentVersion metadata alignment: Grade, age band, locale, reading proficiency ve Topic/Domain.
2. Unit/CurriculumNode ve ordered membership.
3. Version-aware ContentAlignment/QuestionAlignment; primary/secondary skill role'ü.
4. Source/provenance/author/editor ve license evidence.
5. ReviewRecord: reviewer, decision, reason, rubric version, reviewedAt.
6. ContentVersion media relation; audio/transcript/illustration gibi content-level assets.
7. Difficulty/readability method + version contract; authoring ve calibrated item difficulty ayrımı.

Bu yapılar normalized/controlled contract olarak tasarlanmalı; belirsiz bir “her şeyi JSON metadata'ya koy” yaklaşımı kullanılmamalıdır.

### 35.3 Migration güvenliği

Migration uygulanmadan önce:

- published ContentVersion/QuestionVersion/Attempt history rewrite edilmemeli;
- deterministic backfill ve null/unknown davranışı belirlenmeli;
- global Skill/Level/Domain ile tenant-scoped content ayrımı korunmalı;
- RLS ve parent-isolation policy'si yazılmalı;
- currentVersion ve session snapshot ilişkileri korunmalı;
- API/mobile DTO'ları additive tasarlanmalı.

## 36. Editorial checklist

Production publish öncesi editor şu checklist'i doldurmalıdır:

### Content brief

- [ ] Title ve text type/genre açık.
- [ ] Hedef Grade 5–12 bandı ve gerekçesi yazılı.
- [ ] Yaş uygunluğu değerlendirildi.
- [ ] Primary Skill ve varsa Secondary Skill açık.
- [ ] Tek cümlelik gözlenebilir Learning Objective yazılı.
- [ ] Topic/Domain bağlamı ve varsa çoklu domain açık.
- [ ] Length band ve word count kontrol edildi.
- [ ] Difficulty bileşenleri sözel olarak gerekçelendirildi.

### Editorial QA

- [ ] Türkçe imla, noktalama ve doğallık kontrol edildi.
- [ ] Hook merak uyandırıyor, clickbait değil.
- [ ] Paragraflar mobile okumaya uygun.
- [ ] Ana fikir, detay, kanıt ve makul çıkarım fırsatı var.
- [ ] Kelime yükü ve context clues değerlendirildi.
- [ ] Factual claims kaynak/provenance ile doğrulandı.
- [ ] Kurgu/gerçek ayrımı açık.
- [ ] Sensitive content, bias ve age safety kontrol edildi.
- [ ] Copyright/license kontrol edildi.
- [ ] Accessibility ve media text alternative gereksinimleri kontrol edildi.

### Question/technical fit

- [ ] Gelecek Question Blueprint için soru mix'i mümkün.
- [ ] Distractor'lar metin kanıtına dayalı ve makul olabilir.
- [ ] Content reusable; tek exercise'e kilitli değil.
- [ ] Version değişikliği gerekiyorsa yeni ContentVersion planlandı.
- [ ] Published version immutable lifecycle'a uyuluyor.
- [ ] Review kararı ve waiver varsa gerekçesi kayıt altına alındı.

### Publish gate

- [ ] DRAFT content version tamamlandı.
- [ ] Human review yapıldı.
- [ ] `REVIEW` lifecycle adımı geçildi.
- [ ] `PUBLISHED` yapılmadan önce tüm zorunlu gate'ler PASS.
- [ ] Yeni version yayımlandığında eski version/attempt history korunuyor.

## 37. Implementation boundary

Bu aşamada:

- `docs/READING_CONTENT_STANDARD.md` oluşturuldu;
- 0 production reading content üretildi;
- 0 curriculum seed üretildi;
- 0 toplu question üretildi;
- schema/migration/source/test dosyası değiştirilmedi;
- AI, adaptive ve spaced repetition pipeline'ı kurulmadı.

Sonraki 8G-4 Question Blueprint bu standardın `Questionability`, `Question mix`, `Distractor quality`, `Skill alignment` ve `Exam compatibility` bölümlerini teknik soru kontratına dönüştürmelidir.
