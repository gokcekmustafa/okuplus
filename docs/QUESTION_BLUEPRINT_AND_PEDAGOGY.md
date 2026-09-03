# OKU+ Question Blueprint and Pedagogy

Tarih: 2026-09-01  
Kapsam: Reading question design standard / pedagogy + item quality + technical fit  
Hedef: 13–17 yaş, ortaokul + lise  
Kaynaklar: `docs/CURRICULUM_ARCHITECTURE.md`, `docs/CURRICULUM_TAXONOMY.md`, `docs/READING_CONTENT_STANDARD.md`, gerçek `prisma/schema.prisma`, question schemas/services ve `oku_plus_test` read-only incelemesi

Bu belge soru bankası değildir. Bir sorunun hangi öğrenme hedefini ölçtüğünü, hangi türün neden seçildiğini, nasıl cevaplanabilir ve öğretici olması gerektiğini, nasıl puanlanacağını ve yayın öncesi nasıl kontrol edileceğini tanımlar.

## 1. Purpose

Her question blueprint şu soruya net cevap vermelidir:

> Bu soru öğrencinin neyi yapabildiğini ölçüyor?

Zayıf amaç: “Öğrencinin metni anlayıp anlamadığını ölçer.”  
Güçlü amaç: “Öğrenci metnin ana düşüncesini belirleyebilir.”

Soru; Content/ContentVersion'dan kanıt alan, bir Skill learning outcome'a bağlanan, seçilmiş QuestionType ile bu outcome'u gözlemleyen ve öğrenciye doğru/yanlış düşünmesini geliştirecek feedback sağlayan bir ölçme maddesidir.

## 2. Pedagogical principles

### 2.1 Pedagojik ve teknik katman ayrımı

| Teknik katman       | Pedagojik katman                     |
| ------------------- | ------------------------------------ |
| QuestionType        | Learning objective ve Skill          |
| prompt/options JSON | Cognitive demand ve answerability    |
| correctAnswer JSON  | Doğru cevabın metinsel kanıtı        |
| rawScore/isCorrect  | Öğrenme kanıtının yorumlanması       |
| Attempt/timeSpentMs | Feedback ve sonraki öğretim kararı   |
| version/status      | Editorial güven ve tarihsel doğruluk |

Bir type'ın teknik olarak puanlanabilmesi, pedagojik olarak iyi soru olduğu anlamına gelmez. Bir sorunun doğru cevabı hesaplanabiliyor olsa bile metin dışı bilgi istiyorsa OKU+ reading standardını karşılamaz.

### 2.2 Temel kurallar

- Her sorunun tek bir Primary Skill'i ve tek cümlelik objective'i olmalı.
- Gerekmedikçe bir soruya birden fazla learning outcome yüklenmemeli.
- Cevap metin içinde açıkça bulunmalı veya metin kanıtından makul biçimde çıkarılmalı.
- Soru kökü kısa, tek anlamlı ve yaşa uygun olmalı.
- Yanlış cevaplar metinle ilgili, makul ve belirli bir yanlış okumaya dayalı olmalı.
- Explanation cevabı tekrar etmek yerine düşünme yolunu göstermeli.
- Hint cevabı söylemeden doğru kanıta yönlendirmeli.
- Soru diğer soruların cevabına bağımlı olmamalı.
- Zorluk yalnızca zor kelime sayısı değildir.
- Objective, difficulty ve cognitive demand teknik JSON'da yoksa varmış gibi raporlanmamalı.

## 3. Skill alignment

### 3.1 Mevcut skill vocabulary

Mevcut `SkillCategory` enum'u:

| Teknik          | Öğrenci dili     | Soru objective örneği                                    |
| --------------- | ---------------- | -------------------------------------------------------- |
| `MAIN_IDEA`     | Ana fikri bul    | Metnin merkez düşüncesini belirleyebilir                 |
| `DETAIL`        | Detayları yakala | Metinde verilen belirli kanıtı bulabilir                 |
| `INFERENCE`     | Çıkarım yap      | Metindeki ipuçlarından desteklenen sonucu çıkarabilir    |
| `VOCABULARY`    | Kelime hazinesi  | Bir kelimenin bağlamdaki anlamını belirleyebilir         |
| `FACTUAL`       | Bilgiyi bul      | Metinde doğrudan verilen olguyu seçebilir/doğrulayabilir |
| `COMPREHENSION` | Metni anla       | Metnin genel anlamını ve temel ilişkilerini kurabilir    |

### 3.2 Teknik gerçeklik

`Question.skillId` optional tek Skill relation'ıdır. `ContentSkill` content için many-to-many'dir; primary/secondary rolü saklamaz. `QuestionVersion` içinde objective, secondarySkill, cognitiveDemand veya taxonomy alignment alanı yoktur.

Bu nedenle blueprint'te Primary Skill/Secondary Skill zorunluluğu editorial contract'tır; mevcut schema alanı değildir. 8G-4'te yeni alan veya enum eklenmemiştir.

## 4. Question types

Mevcut beş teknik type:

- `MULTIPLE_CHOICE`
- `TRUE_FALSE`
- `OPEN_ENDED`
- `MATCHING`
- `FILL_BLANK`

Type seçimi “hangi kontrolü UI destekliyor?” sorusundan önce “hangi learning outcome'u en iyi gözlemliyor?” sorusuyla yapılmalıdır.

| Type            | En uygun kullanım                                 | Ana risk                                    |
| --------------- | ------------------------------------------------- | ------------------------------------------- |
| Multiple choice | Ana fikir, detail, inference, vocabulary, factual | Kötü distractor doğru cevabı ele verir      |
| True/False      | Tek ve açık bir metin iddiası                     | Belirsiz/çift olumsuz cümle                 |
| Open ended      | Gerekçe, yorum, kısa çıkarım                      | Otomatik scoring yok; değerlendirme pending |
| Matching        | Anlamlı iki set ilişkisi                          | Rastgele eşleştirme ve aşırı yük            |
| Fill blank      | Vocabulary, terim, factual recall                 | Eş anlam/çekim/çoklu doğru cevabı           |

Her type her grade'de kullanılabilir; cümle yoğunluğu, metin hacmi, input yükü ve bağımsız cevap verebilme yaşı/proficiency'ye göre ayarlanmalıdır.

## 5. MULTIPLE_CHOICE

### Uygun olduğu durumlar

- ana fikir ve kapsam;
- doğrudan detail;
- metin kanıtına dayalı inference;
- context vocabulary;
- factual recall.

### Standart

- Tercih edilen seçenek sayısı 3–5'tir.
- Tek seçimli soruda tek net en iyi doğru cevap vardır.
- Çoklu seçim yalnızca objective gerçekten birden fazla doğru gerektiriyorsa kullanılır.
- Doğru cevap uzunluk, dilbilgisi, noktalama veya aşırı ayrıntı ile belli olmaz.
- Tüm seçenekler aynı dilbilgisel yapıda ve karşılaştırılabilir kapsamda olur.
- Distractor'lar saçma, metin dışı veya açıkça alakasız olmaz.
- Doğru cevap ContentVersion kanıtıyla desteklenir.

### Uygun olmadığı durumlar

- iki seçenek de metne göre savunulabiliyorsa;
- objective öğrencinin gerekçesini görmekse ve seçenekler düşünmeyi gizliyorsa;
- doğru cevap yalnızca genel kültürle bulunuyorsa.

Mevcut teknik schema `options` JSON ve `correctAnswer.correctOptionIds` taşır; `allowMultiple` ve `partialCredit` type-specific olarak tanımlıdır.

## 6. TRUE_FALSE

### Standart

- İfade tek anlamlı, kısa ve metne dayalıdır.
- İfade açık bir iddiayı test eder; belirsiz “çoğunlukla/genellikle” kullanımı ancak metin bunu gerçekten destekliyorsa yapılır.
- Double negative kullanılmaz.
- Sadece bir kelimeyi değiştirerek mekanik tuzak kurulmaz.
- Doğru/yanlış kararını belirleyen kanıt metinde bulunur.
- İfade yanlışsa hangi kısmın yanlış olduğu açıklanabilir.

### Dikkat

True/False; inference, nüanslı yorum veya birden çok koşullu ilişki için çoğu zaman zayıftır. Grade yükseldikçe cümle karmaşıklığını artırmak yerine kanıt ve kavram doğruluğu artırılmalıdır.

Mevcut scorer boolean cevap alır ve doğruysa 1, yanlışsa 0 rawScore döndürür.

## 7. OPEN_ENDED

### Uygun olduğu durumlar

- gerekçe açıklama;
- metin kanıtı kullanma;
- çıkarım;
- kısa yorum veya karşılaştırma;
- öğrencinin kendi cümlesini kurması.

### Standart

- Prompt öğrenciden beklenen cevap kapsamını açıklar.
- “Neden?” sorusuna yalnızca tek kelimelik factual cevap bekleniyorsa open-ended seçilmez.
- Beklenen answer ve kabul edilebilir varyantlar önceden yazılır.
- Gerekliyse rubric kriterleri answer metadata'sında belgelenir.
- Otomatik değerlendirme yoksa cevap doğru/yanlış olarak işaretlenmez; pending/human review kabul edilir.

Mevcut `correctAnswer` JSON'u `expectedAnswer`, `acceptableVariants`, optional `rubric` ve `caseSensitive` taşıyabilir. Mevcut scorer `isCorrect=null`, `rawScore=null` ve “Manuel değerlendirme gerekli” feedback'i döndürür.

## 8. MATCHING

İki set arasındaki ilişki doğal ve anlamlı olmalıdır:

- kavram → açıklama;
- sebep → sonuç;
- kelime → bağlam/anlam;
- kişi → katkı;
- süreç adımı → işlev.

Standart:

- Her left item için tek ve savunulabilir right karşılığı bulunur.
- Sağ taraftaki seçenekler aynı semantic sınıfta olur.
- Rastgele veya yüzeysel kelime eşleştirmesi yapılmaz.
- Liste büyüdükçe öğrenciye gereksiz working-memory yükü bindirilmez.
- Eşleştirme sorusu metindeki ilişkiyi ölçer; dış bilgiye dayanmaz.

Mevcut technical schema `options` JSON, `matchGroup`, `position` ve `correctAnswer.pairs` taşır; partial credit desteklenir.

## 9. FILL_BLANK

Vocabulary, terminology ve factual recall için kullanılabilir.

Standart:

- Boşluk, objective için kritik bilgi olmalı; her cümlede mekanik boşluk açılmamalı.
- Cümle, doğru cevabı grammar ile gereksiz biçimde ele vermemeli.
- Eş anlamlı, farklı yazım, ek/çekim ve case riskleri önceden analiz edilmeli.
- Birden fazla kabul edilebilir cevap varsa `acceptedAnswers` veya açık rubric tanımlanmalı.
- Regex yalnızca gerçekten gerekli ve güvenli olduğunda kullanılmalı.

Mevcut scorer case-insensitive varsayılan eşleşme, optional regex ve partial credit desteği verir. Bu teknik davranış, pedagojik olarak kabul edilmesi gereken tüm varyantların önceden yazılması gereğini ortadan kaldırmaz.

## 10. Main Idea

Ana fikir sorusu:

- metnin tamamını kapsayan tek bir best answer ister;
- yalnızca ilk paragrafı veya tek detayı özetlemez;
- konu başlığı ile ana düşünceyi karıştırmaz;
- aşırı genel (“metin bilgi veriyor”) veya aşırı spesifik olmaz;
- diğer seçenekleri metin kapsamı, amaç veya ana mesaj bakımından geride bırakır.

Ana fikir için `MAIN_IDEA` primary skill, gerektiğinde `COMPREHENSION` destek skill olabilir; current question schema'da bu secondary role saklanmaz.

## 11. Detail

Detail cevabı metinde doğrudan bulunmalıdır; ancak soru basit keyword kopyalama olmamalıdır.

- Paraphrase ve kısa bağlam kullanımı tercih edilir.
- Kanıtın hangi cümle/olay/ayrıntıda olduğu bellidir.
- Dışarıdan genel kültür gerektirilmez.
- Birbirine benzeyen iki detay arasında belirsizlik oluşturulmaz.

Uygun primary skill `DETAIL` veya factual objective'te `FACTUAL` olabilir.

## 12. Inference

Inference, metinde birebir yazmayan fakat metin kanıtından desteklenen sonuçtur.

- “Metinde yok ama doğru olabilir” kabul edilmez.
- Sonuç, metin içi ipucu/ipuçlarıyla savunulabilir olmalıdır.
- Aynı kanıttan birden fazla eşit derecede güçlü sonuç çıkıyorsa soru revize edilir.
- Hard inference; daha fazla bağ kurabilir, fakat dış bilgi istememelidir.
- Explanation, sonucu ve supporting evidence'i göstermelidir.

Uygun primary skill `INFERENCE`'dir. Soru, öğrencinin kişisel görüşünü değil metnin izin verdiği çıkarımı puanlamalıdır.

## 13. Vocabulary

Reading vocabulary sorusu kelime ezberini değil, kelimenin **bu bağlamdaki** anlamını ölçmelidir.

- Kelime anlamı cümle ve komşu bağlamdan çıkarılabilir olmalı.
- Seçenekler aynı anlam sınıfında olmalı.
- Sözlükte mümkün olan fakat metin bağlamında çalışmayan cevaplar doğru sayılmamalı.
- Çok nadir/alan terimi kullanılıyorsa Content standardındaki vocabulary annotation ve hint ihtiyacı değerlendirilmelidir.

Uygun primary skill `VOCABULARY`; `FILL_BLANK` ve `MULTIPLE_CHOICE` en sık uygun type'lardır.

## 14. Difficulty

Editorial question difficulty şu beş boyutta ayrı değerlendirilir:

1. Linguistic complexity — soru kökü ve seçeneklerin dil yoğunluğu.
2. Content complexity — metnin kavramsal yükü ve gereken ön bilgi.
3. Inference demand — açık cevap ile örtük ilişki arasındaki mesafe.
4. Distractor similarity — yanlış seçeneklerin doğru cevaba yakınlığı.
5. Cognitive load — aynı anda tutulması, karşılaştırılması veya sıralanması gereken bilgi.

Önerilen editorial bandlar `Kolay`, `Orta`, `Zor`dur; bunlar bu aşamada DB enum'u değildir.

Mevcut schema `QuestionVersion.difficulty` nullable Float'tur ve Zod validation 0..1 aralığını kabul eder; ancak 0/1'in pedagojik anlamı veya band mapping'i tanımlı değildir. Bu yüzden sayısal alan tek başına publish kararı vermez.

## 15. Distractors

Kaliteli distractor:

- plausible;
- text-related;
- tek clear best answer düzeni içinde;
- öğrencinin muhtemel yanlış okumasına/misconception'ına dayalı;
- doğru cevapla aynı kapsam ve grammar'da

olur.

Kötü distractor:

- soruyla ilgisiz;
- açıkça saçma;
- metinde hiç karşılığı olmayan genel kültür bilgisi;
- uzunluk veya dilbilgisiyle kendini ele veren;
- iki doğru cevap oluşturan

seçenektir.

Örneğin iklim değişikliği sorusuna Ay'ın Dünya'nın uydusu olduğunu söyleyen seçenek, text-related olmadığı için geçerli distractor değildir.

## 16. Answer balance

Doğru cevap sürekli A veya C konumunda olmamalıdır. Ancak cevap dağılımı tamamen rastgele bırakılmamalıdır.

- Blueprint seviyesinde set boyunca dengeli dağılım yapılır.
- Aynı passage'da arka arkaya aynı pozisyon kalıbı tekrarlanmaz.
- Dağılım, doğru cevabın niteliğini bozmak için zorlanmaz.
- Seçenekler yeniden sıralandığında explanation/correctAnswer ID'leri birlikte korunur.

Mevcut schema `options.position` taşır; answer-position distribution için ayrı constraint yoktur. Bu kural editorial QA'dır.

## 17. Question order

Bir passage'da genel akış kolaydan daha yüksek bilişsel talebe gidebilir:

```text
direct detail → general comprehension/main idea → inference → synthesis/justification
```

Bu pattern her passage için zorunlu değildir. Öğrencinin metne yeniden dönmesini kolaylaştıracak order, objective ve exercise context ile birlikte seçilir. Sırf “zor soru sona” kalıbı için zayıf sorular eklenmez.

Teknik olarak Question.position ve TemplateVersion join position'ı vardır; bu order metadata'sıdır, pedagojik progression policy'si değildir.

## 18. Question count

Reading Content Standard'daki başlangıç aralıkları:

| Content length       | Önerilen soru sayısı |
| -------------------- | -------------------- |
| Mini 100–180 kelime  | 2–3                  |
| Kısa 180–300 kelime  | 3–4                  |
| Orta 300–500 kelime  | 4–6                  |
| Uzun 500–800+ kelime | 5–8                  |

Grade, Skill, learning goal, questionability, assessment ve cognitive load'a göre ayarlanabilir. Bunlar DB rule, hard validation veya her passage için kota değildir.

## 19. Question mix

Beş soruluk comprehension exercise için başlangıç örneği:

- 2 detail/comprehension;
- 1 main idea;
- 1 inference;
- 1 vocabulary/context clue.

Bu örnek, her content'e mekanik olarak uygulanmaz. Primary Skill ve objective, type/count kararından önceliklidir. `SPEED` daha kısa set, `COMPREHENSION` dengeli coverage, `EXAM` ise blueprint/assessment bağlamına uygun mix isteyebilir; yeni adaptive logic yazılmamıştır.

## 20. Dependencies

Bir soru başka bir sorunun cevabına bağlı olmamalıdır.

Yasak örnek: “1. soruda bulduğun cevaba göre 2. soruyu yanıtla.”

Her soru:

- aynı ContentVersion üzerinden bağımsız cevaplanabilmeli;
- önceki sorunun seçimini gerektirmemeli;
- option/order değişse bile anlamını korumalı;
- explanation'ı kendi kanıtını göstermeli.

Birden fazla soru aynı kanıtı ölçebilir; bu durumda duplicate measurement riski QA'da kontrol edilir.

## 21. Explanation

Her puanlanabilir objective question için explanation bulunması standarddır; teknik schema'da `QuestionVersion.explanation` nullable olsa da publish öncesi editorial gate bunu istemelidir.

Explanation:

- kısa ve öğrenciye yönelik;
- doğru cevabı sadece tekrar etmeyen;
- metindeki kanıtı veya düşünme adımını gösteren;
- inference'ta supporting cue'yu açıklayan;
- distractor'ın neden uygun olmadığını gerektiğinde kısaca belirten

olmalıdır.

Explanation öğrenci cevap vermeden önce görünür hint yerine geçmez; cevap sonrası feedback içindir.

## 22. Hint

Hint cevabı söylemeden doğru düşünme yönünü gösterir.

İyi hint:

- metnin tamamını veya ilgili paragrafı yeniden okumaya yönlendirir;
- “hangi kanıtı aramalısın?” sorusuna yardımcı olur;
- ana fikirde kapsamı, inference'ta ipucunu, vocabulary'de komşu cümleyi işaret eder;
- doğru option text'ini kopyalamaz;
- çözümü adım adım ifşa etmez.

Mevcut `QuestionVersion.hint` nullable String'tir; `QuestionMedia` HINT rolünü destekler. Hint zorunluluğu ve kullanım sayısı mevcut runtime'da enforce edilmemektedir.

## 23. Feedback

Feedback üç durumda farklı davranmalıdır:

- Correct: pozitif, öğrencinin doğru düşünme adımını adlandıran.
- Wrong: yapıcı, kanıta geri döndüren, küçük düşürmeyen.
- Pending: dürüst; insan değerlendirmesi gerektiğini açıkça belirten.

“Yanlış, tekrar dene” tek başına öğretici feedback değildir. Feedback, explanation/hint ile çelişmemeli ve metin dışı bilgi eklememelidir.

Mevcut scorer yalnızca OPEN_ENDED için “Manuel değerlendirme gerekli” feedback'i döndürür; objective type'larda explanation'ın otomatik feedback'e bağlanması bu aşamada yapılmadı.

## 24. Scoring

### 24.1 Mevcut teknik scoring

`scoreAttempt` deterministic olarak `isCorrect`, `rawScore` ve gerektiğinde feedback döndürür. `rawScore` 0–1 aralığındadır.

- Multiple choice single: doğru tek option ise 1, değilse 0.
- Multiple choice multiple + partial: seçilen doğru sayısı / doğru seti sayısı.
- Multiple choice multiple + no partial: exact set match.
- True/False: boolean exact match.
- Matching + partial: doğru pair sayısı / toplam pair.
- Fill blank + partial: kabul edilen doğru blank sayısı / toplam blank.
- Open ended: null score, manual evaluation pending.

Mevcut partial scoring davranışı extra yanlış seçimleri ayrıca cezalandırmaz; blueprint bu teknik sonucu bilerek soru tasarlamalıdır. Bu aşamada scorer değiştirilmedi.

### 24.2 Pedagojik scoring

Bu aşamada yeni scoring algorithm veya item weight uygulanmayacaktır. Farklı soruların pedagojik önemi olabilir; ancak `Question` veya `QuestionVersion` üzerinde `points` alanı yoktur. `Attempt.rawScore` normalize evidence'tir; gamification PointEvent assessment points ile aynı şey değildir.

İleride ağırlık gerekiyorsa blueprint düzeyinde objective/skill/demand ağırlığı ve assessment aggregation contract'ı ayrıca tanımlanmalıdır; mevcut raw score geçmişi rewrite edilmemelidir.

## 25. Open-ended evaluation

Open-ended automatic correct/incorrect iddiası şu an yapılamaz. Mevcut doğru model:

```text
submitted → pending → human/AI review → graded evidence
```

Schema'da Attempt için `manualScore`, `gradedById`, `gradedAt`, `aiScore`, `aiFeedback`, `aiModelVersion`, `aiEvaluatedAt` alanları vardır. Bunlar future review capability'si için yüzey sağlar; aktif AI grading pipeline'ı değildir.

Rubric:

- objective ile doğrudan ilişkili kriterler;
- metin kanıtı kullanımı;
- gerekçe/çıkarım doğruluğu;
- kısmi başarıya izin veriyorsa açık sınırlar

taşımalıdır. Puanlama rubric'i QuestionVersion correctAnswer JSON içine gömülebilir, fakat first-class review workflow değildir.

## 26. Media

`QuestionMedia` IMAGE, AUDIO, VIDEO ve DOCUMENT destekler; QuestionVersionMedia ile `MAIN`, `OPTION`, `EXPLANATION`, `HINT` rolünde bağlanır. Options JSON'da optional mediaId vardır.

Media şu amaçlarda anlamlıdır:

- görsel: görsel kanıt/diagram/harita/infografik yorumlama;
- audio: dinleme destekli veya multimodal anlamlandırma;
- video: sequence/kanıt bağlamı, yalnızca gerçekten ölçüme katkı veriyorsa;
- document: ek kaynak veya erişilebilir alternatif.

Decorative media soruya gereksiz bilişsel yük getirmemelidir. AltText, caption/transcript ve role accessibility için kontrol edilir. ContentVersion'a direct media relation yoktur; reading content için content-level media future extension'dır.

## 27. Exam

`EXAM` learning goal generic `EXAM_PREPARATION` lens'idir. LGS/TYT/AYT bu aşamada schema'ya zorla gömülmez.

Exam-compatible soru:

- açık ve hızlı taranabilir soru kökü;
- passage'a uygun süre/hacim;
- kaliteli, text-related distractor;
- tek clear best answer;
- inference/detail/main idea coverage;
- gerekirse sınav tipine uygun ama kurumdan bağımsız blueprint

taşır.

Time pressure Exercise/Assessment layer'ında yönetilir; soru modeline sınav adı veya sabit süre eklemek bu aşamanın işi değildir.

## 28. Accessibility

Question standardı:

- kısa ve semantik question stem;
- okunabilir option text;
- anlamı yalnızca renk veya ikonla taşımama;
- accessible labels ve focus order;
- screen reader'ın option/selection durumunu anlayabilmesi;
- matching için ilişki ve drag/drop alternatifi;
- fill blank için label, input purpose ve hata mesajı;
- media için alt text/caption/transcript.

Doğru cevabın görsel renk, pozisyon veya disabled state ile önceden anlaşılması engellenmelidir.

## 29. Mobile

390×844 hedefinde:

- question stem satırları okunabilir;
- options yeterli touch target ve spacing ile gösterilir;
- uzun option'lar horizontal overflow oluşturmaz;
- matching iki seti ekranda karşılaştırılabilir veya alternatif seçim akışı sunar;
- fill blank input keyboard ile kullanılabilir;
- explanation/hint metni answer area'yı boğmaz;
- tablo/çok kolonlu layout yerine responsive bloklar kullanılır.

Bu belge UI kodu değiştirmez; gerçek mobile visual QA ayrı test aşamasıdır.

## 30. Age

13–17 yaş için:

- vocabulary ne çocukça ne de gereksiz akademik olmalı;
- soru kökü tek anlamlı ve saygılı olmalı;
- mature topic gerekiyorsa sensitive content policy uygulanmalı;
- öğrencinin yaşını küçümseyen şaka/ton kullanılmamalı;
- abstract demand grade/proficiency ile ayarlanmalı;
- dış dünya ön bilgisi yerine passage evidence tercih edilmeli.

Age appropriateness, QuestionType seçimi ve cognitive load ile birlikte değerlendirilmeli; yaş grade veya proficiency yerine geçmemelidir.

## 31. Bias

Question ve seçeneklerde:

- gender stereotype;
- kültürel, sınıfsal veya bölgesel stereotype;
- siyasi/partizan ikna;
- dini persuasion;
- bir grup hakkında kanıtsız genelleme;
- öğrencinin ekonomik/kültürel deneyimini doğru cevabın ön koşulu yapan bağlam

olmamalıdır.

Factual/educational neutrality korunmalı; seçenekler öğrencinin dünya görüşünü değil, metin kanıtını ölçmelidir.

## 32. Safety

Minor audience nedeniyle sexual content, self-harm, dangerous instructions ve graphic violence içeren soru/content özel senior review gerektirir.

- Zararlı davranış talimatı veya yüceltmesi yapılmaz.
- Graphic ayrıntı ölçme için gerekli değildir.
- Sensitive konu eğitimsel olarak gerekli olsa bile age, tone, context ve safety review kaydı gerekir.
- Soru, öğrenciyi kişisel deneyimini açıklamaya zorlamamalıdır.

Bu aşamada safety engine/classifier/automatic policy enforcement yapılmamıştır.

## 33. Copyright

Questions:

- original veya uygun lisanslı passage'a özel olmalı;
- telifli sınav sorusunun kopyası olmamalı;
- web/book source'tan aynen alınmamalı;
- yalnızca birkaç kelime değiştirilerek türetilmiş görünmemeli;
- option ve explanation da özgün olmalı.

Question'ın source/provenance bilgisi mevcut QuestionVersion schema'sında first-class değildir. ContentVersion license alanı yardımcıdır ancak question provenance ve copyright clearance yerine geçmez.

## 34. QA checklist

Her soru için gelecekteki editorial checklist:

- [ ] Primary Skill ve objective açık.
- [ ] QuestionType objective için uygun.
- [ ] Cevap ContentVersion'dan çıkarılabilir.
- [ ] Question dependency yok.
- [ ] Tek clear best answer veya açık rubric var.
- [ ] Distractor'lar plausible ve text-related.
- [ ] Difficulty band ve demand gerekçeli.
- [ ] Dilbilgisi, imla ve Türkçe doğallık kontrol edildi.
- [ ] Explanation kısa, doğru ve öğretici.
- [ ] Hint cevabı ele vermiyor.
- [ ] Age 13–17 ve grade/proficiency uygun.
- [ ] Bias ve sensitive content kontrol edildi.
- [ ] Accessibility ve mobile kullanım kontrol edildi.
- [ ] Copyright/provenance kontrol edildi.
- [ ] Exam goal varsa generic exam compatibility değerlendirildi.
- [ ] Version/publish history korunuyor.

## 35. Blueprint matrix

| Skill           | Question type                           | Suitable                                 | Not suitable                     | Difficulty notes                                | Explanation                                         | Hint                                                  |
| --------------- | --------------------------------------- | ---------------------------------------- | -------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `MAIN_IDEA`     | Multiple choice                         | Metnin tamamını kapsayan tek best answer | True/False ile nüanslı ana mesaj | Kapsam + sentez talebi arttıkça zorlaşır        | Seçeneğin metnin tamamını neden kapsadığını açıklar | İlk paragraf yerine bütün metni düşünmeye yönlendirir |
| `DETAIL`        | Multiple choice, True/False             | Doğrudan kanıt ve paraphrase             | Dış bilgi isteyen soru           | Kanıt yakınsa kolay, benzer detaylar varsa orta | İlgili metin kanıtını gösterir                      | İlgili paragrafı yeniden okumaya yönlendirir          |
| `INFERENCE`     | Multiple choice, Open ended             | Kanıttan desteklenen örtük sonuç         | “Olabilir” türü kanıtsız yorum   | İpucu mesafesi ve bilişsel yük artarsa zor      | İpucu → sonuç zincirini açıklar                     | İki anlamlı ipucunu karşılaştırmaya yönlendirir       |
| `VOCABULARY`    | Multiple choice, Fill blank             | Bağlam içi anlam ve kullanım             | Salt sözlük ezberi               | Context clue azaldıkça zorlaşır                 | Komşu cümlelerin anlamı nasıl verdiğini açıklar     | Kelimenin geçtiği cümleye dönmeyi söyler              |
| `FACTUAL`       | Multiple choice, True/False, Fill blank | Metindeki açık olgu                      | Genel kültür/ansiklopedi sorusu  | Benzer olgu ve paraphrase talebi etkiler        | Olgunun metindeki yerini gösterir                   | Cevabı metinde nerede arayacağını söyler              |
| `COMPREHENSION` | Multiple choice, Matching, Open ended   | Genel anlam, ilişki ve kısa açıklama     | Tek keyword'e indirgenen item    | Birden fazla paragraf ilişkisi zorlaştırır      | Genel anlamı ve ana ilişkileri bağlar               | Metnin bütününü özetlemeye yönlendirir                |

`STRUCTURE`, `CRITICAL_READING`, `ARGUMENT` ve `SYNTHESIS` bu matrix'e mevcut skill olarak eklenmemiştir; schema'da yoktur ve future skill candidate'dir.

## 36. Content integration

Content standard ile question blueprint bağlantısı:

```text
Content brief:
  Grade / Age / Topic / TextType / Primary Skill / Objective / Difficulty
    ↓
Question blueprint:
  Skill / Objective / QuestionType / Demand / Answer / Distractors / Explanation / Hint
```

Bir content'in soruları:

- aynı ContentVersion kanıtına bağlı;
- primary objective coverage'ını tamamlayan;
- farklı ama anlamlı demand seviyeleri taşıyan;
- passage'ın doğal anlamını bozmayan

bir set oluşturmalıdır.

`Question.contentId` Content root'una bağlıdır; QuestionVersion prompt/answer history'sini taşır. ContentVersion-specific historical alignment gelecek schema kararıdır.

## 37. Exercise integration

Mevcut teknik model:

```text
Content → Question → QuestionVersion
                       ↓
             ExerciseTemplateVersionQuestion
                       ↓
             ExerciseTemplateVersion
                       ↓
                 ExerciseSession
```

ExerciseTemplate type'ları `COMPREHENSION`, `FLUENCY`, `INFERENCE`, `VOCABULARY`, `MIXED`'tir. Reading comprehension template'i bir ContentVersion ve N QuestionVersion paketleyebilir; aynı content farklı template version'larda yeniden kullanılabilir.

Template type, SkillCategory değildir. Question blueprint primary objective'ı korurken exercise template sıralama, süre ve interaction bağlamını belirler.

## 38. Assessment integration

Assessment `PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK` type'larına sahiptir; optional Level relation'ı vardır. Template/templateVersion bağlantısı JSON config/service validation içindedir; relational FK değildir.

Assessment blueprint:

- question mix;
- skill coverage;
- difficulty/demand distribution;
- content block/passages;
- estimated time;
- generic `EXAM_PREPARATION` context

olarak tanımlanabilir. Bu aşamada scoring aggregation algorithm yazılmayacaktır.

Bir assessment passage-based olabilir; ContentVersion + QuestionVersion seti TemplateVersion composition'dan gelir. Assessment birden fazla content block içerebilir. ResultLevel, skill evidence veya topic coverage bugün first-class değildir.

## 39. AI policy

AI soru taslağı doğrudan production publish olamaz:

```text
AI draft → human review → pedagogy review → factual/copyright/bias review → publish
```

AI çıktısı için prompt, model/version, source, generated draft, human edits, evaluation ve safety/provenance izlenmelidir. `QuestionGenerationJob` gelecekteki async queue için başlangıç modelidir; worker, provider, evaluator, cost/retry veya publish gate değildir.

Bu aşamada AI generation, bulk question üretimi veya seed çalıştırılmadı.

## 40. Human review

İnsan reviewer her production question'ı şu açılardan kontrol etmelidir:

- objective/skill alignment;
- type appropriateness;
- answerability ve passage evidence;
- answer/distractor quality;
- explanation/hint accuracy;
- language/age/grade;
- bias/sensitive content/safety;
- accessibility/mobile;
- copyright/provenance;
- version/publish readiness.

Mevcut `VersionStatus.REVIEW` yalnızca lifecycle durumudur; reviewer kararını ve gerekçesini taşıyan ReviewRecord yoktur.

## 41. Schema analysis

### Mevcut alanlar

`Question`:

- `contentId`, `position`, `type`, optional `skillId`;
- `status`, `createdById`, timestamps, `deletedAt`;
- Content, Skill, QuestionVersion, Attempt ve TemplateVersion relations.

`QuestionVersion`:

- `questionId`, `version`, `prompt`, `options` JSON, `correctAnswer` JSON;
- optional `explanation`, `hint`, `difficulty`;
- `VersionStatus`, `publishedAt`, creator, `partialCreditEnabled`, `generationMetadata`;
- QuestionMedia and TemplateVersion relations.

`Attempt`:

- answer, `isCorrect`, `rawScore`, `timeSpentMs`, response order, feedback;
- manual/AI grading alanları ve item calibration alanları;
- session/question version relations, idempotent client key.

### Eksik alanlar

- primarySkill/secondarySkill role;
- learning objective;
- cognitiveDemand;
- explicit points/maxPoints/weight;
- source/provenance/copyright clearance;
- reviewer/review decision/rubric version;
- content/version-specific topic/unit/grade/proficiency alignment;
- first-class distractor rationale;
- first-class explanation/hint requirement status;
- question quality score (formül bu aşamada önerilmez).

`options`, `correctAnswer`, `feedback` ve `generationMetadata` JSON'dur; type-specific shape service/Zod ile doğrulanır. `points` Question/QuestionVersion'da yoktur.

## 42. Schema decision

Durum: **B — MINIMUM SCHEMA EXTENSION GEREKLİ; PLANLANDI, BU AŞAMADA UYGULANMADI.**

Mevcut schema blueprint'in teknik çekirdeğinin yaklaşık %60–70'ini taşıyabilir: type, prompt, options, correctAnswer, answer formatı, difficulty placeholder, explanation/hint alanı, Skill/Content relation, versioning, media, template composition ve deterministic scorer.

Production-grade pedagogy için minimum extension adayları:

1. version-aware Skill/objective alignment ve primary/secondary role;
2. cognitive demand ve controlled difficulty/readability contract;
3. rubric/points/weight veya assessment item blueprint relation;
4. provenance/copyright/source ve reviewer decision;
5. ContentVersion'a bağlı question evidence/alignment;
6. gerekirse structured distractor rationale ve hint/explanation QA state.

Bu adaylar migration öncesi ADR ile kesinleştirilmeli; mevcut QuestionVersion/Attempt history rewrite edilmemelidir.

## 43. Future recommendations

### Şimdi

- Bu blueprint'i 8G-5 kontrollü content pilotunun zorunlu contract'ı yap.
- Gerçek 5–12 grade örnekleriyle her skill için en az bir objective/question pattern doğrula.
- Explanation, hint, answerability ve distractor QA checklist'ini manuel review sürecine al.
- `OPEN_ENDED` için pending/human evaluation sınırını üründe açık göster.

### Sonra

- Question Blueprint implementation ADR'si: objective, cognitiveDemand, primary/secondary skill, provenance, points/weight.
- Version-aware ContentVersion/QuestionVersion alignment.
- Assessment blueprint ve generic exam profile.
- ReviewRecord ve reviewer workflow.

### Daha sonra

- AI-assisted authoring, evaluation, safety ve cost/provenance.
- Calibrated difficulty ile authoring difficulty ayrımını kullanan adaptive selection.
- Spaced repetition ve mastery evidence.

## 44. Implementation boundary

Bu aşamada yapılmayanlar:

- question bankası veya toplu soru üretimi;
- schema.prisma değişikliği;
- migration;
- yeni SkillCategory/QuestionType enum'u;
- scorer değişikliği;
- AI generation pipeline;
- adaptive veya spaced repetition engine;
- production seed ve demo/test data değişikliği;
- temporary debug.

Ana çıktı bu standard dokümanıdır; sample question eklenmemiştir.
