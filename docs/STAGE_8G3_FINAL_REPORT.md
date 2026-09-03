# OKU+ — AŞAMA 8G-3 FINAL RAPOR

Tarih: 2026-09-01  
Kapsam: Reading Content Standard / editorial + pedagogical + technical readiness  
Ana çıktı: [READING_CONTENT_STANDARD.md](D:/oku-plus/docs/READING_CONTENT_STANDARD.md)

Bu aşamada gerçek production content, curriculum seed, toplu question, AI pipeline, adaptive engine veya spaced repetition yapılmamıştır. Amaç, üretilecek içeriklerin publish öncesi standardını tanımlamaktır.

## 1. Repository discovery

Durum: PASS

- İlk kontroller çalıştırıldı: `git status --short` ve `git diff --name-only`.
- Başlangıç çalışma ağacında commit'e alınmış dosya bulunmuyor; tüm proje dosyaları untracked durumundaydı ve diff boştu. Mevcut dosyalar korunmuştur.
- `docs/CURRICULUM_ARCHITECTURE.md`, `docs/CURRICULUM_TAXONOMY.md`, `docs/STAGE_8G1_FINAL_REPORT.md`, `docs/STAGE_8G2_FINAL_REPORT.md` tamamen okundu.
- `prisma/schema.prisma`, manual RLS/trigger dosyaları, content/question/template/assessment/media servisleri ve validation schema'ları incelendi.

## 2. Reading content definition

Durum: PASS

Reading content, öğrencinin okuyacağı; belirli bir Grade Level'a uygun, en az bir Skill learning outcome hedefleyen, bir Topic/Domain bağlamına oturan ve anlamlı soru üretimine elverişli temel metindir.

Content yalnızca metin gövdesi değildir; objective, evidence, age/grade appropriateness, language quality, factual/copyright/provenance ve accessibility kontrollerinden geçen editorial bir üründür.

## 3. Target users

Durum: PASS

Hedef kitle ortaokul + lise, özellikle 13–17 yaş grubudur. Standard; çocukça olmayan, aşırı akademikleşmeyen, doğal Türkçe kullanan, merak uyandıran, sınav uyumlu ve bireysel/kurumsal kullanıma uygun içerik hedefler.

## 4. Grade

Durum: PASS

Grade ile reading proficiency ayrıldı. OKU+ için hedef grade kapsamı 5, 6, 7, 8, 9, 10, 11 ve 12. sınıftır.

Gerçek schema'da Level global katalogdur; `gradeBand` nullable serbest metindir ve Content/ContentVersion'a bağlı değildir. Bu aşamada grade enum'u, Content.grade alanı veya Level seed'i eklenmedi.

## 5. Reading proficiency

Durum: PASS

Reading proficiency öğrencinin metni bağımsız okuyup anlamlandırma kapasitesidir; grade değildir. Mevcut schema'da proficiency model/alan yoktur.

`Content.difficulty`, `QuestionVersion.difficulty`, `ContentVersion.readabilityScore`, `Level.difficultyMin/max` ve `StudentProgress.masteryScore` proficiency yerine kullanılmayacaktır. Gelecek rubric/alignment extension'ı olarak raporlandı.

## 6. Age appropriateness

Durum: PASS

Grade curriculum anchor, age band ise editorial safety/selection guard'ıdır. `13–14`, `15–16`, `17+` gibi bantlar ileride yararlı olabilir; ancak yaş tek başına reading capability değildir ve dar bantlar içerik tekrarını artırabilir.

Öneri: grade-based + age-appropriate yaklaşımı; age metadata/schema extension olabilir fakat bu aşamada eklenmedi ve erişim kontrolü yapılmadı.

## 7. Content types

Durum: PASS

Mevcut teknik `ContentType`: `PASSAGE`, `STORY`, `POEM`, `ARTICLE`, `DIALOGUE`.

Standard editorial olarak bilgilendirici, öyküleyici, açıklayıcı, görüş/argüman, biyografi, röportaj, deneme ve popular science türlerini öneriyor. Bunlar mevcut enum'a eklenmedi; gerektiğinde future genre/metadata taxonomy olarak teknikleştirilecek.

## 8. Topic/domain

Durum: PASS

Topic/Domain, metnin bağlamıdır; Skill değildir. Bilim, Teknoloji, Doğa ve çevre, Tarih, Kültür, Sanat, Toplum, Spor ve iyi yaşam, Psikoloji, Günlük yaşam, Kariyer ve gelecek aday domain vocabulary'sidir.

Bir content birden fazla domain'e bağlanabilmelidir. Topic modeli veya seed bu aşamada oluşturulmadı.

## 9. Skills

Durum: PASS

Mevcut SkillCategory değerleri `MAIN_IDEA`, `DETAIL`, `INFERENCE`, `VOCABULARY`, `FACTUAL`, `COMPREHENSION` olarak korunur. Öğrenci dili: Ana fikri bul, Detayları yakala, Çıkarım yap, Kelime hazinesi, Bilgiyi bul, Metni anla.

Skill globaldir; status, Level, Topic ve primary/secondary role alanı yoktur. ContentSkill many-to-many relation'ı content'in birden fazla skill'e bağlanmasını sağlar; Question yalnızca optional tek `skillId` taşır.

## 10. Reading length

Durum: PASS

Başlangıç önerisi: Mini 100–180, Kısa 180–300, Orta 300–500, Uzun 500–800+ kelime.

Bu aralıklar katı otomatik red kuralı değildir. Grade, Skill, `SPEED` goal, inference ihtiyacı, question mix ve assessment bağlamıyla birlikte değerlendirilir. Uzunluk tek başına difficulty değildir.

## 11. Word count

Durum: PASS

Gerçek schema'da `ContentVersion.wordCount` vardır ve content service body'den otomatik hesaplar; manuel girilmemelidir. Bu değer reading time, WPM/fluency, sizing ve length band için ham sinyaldir.

Canlı fixture incelemesinde 11 published ContentVersion'ın word count'ı 2–60 aralığındadır; bu değerler production content standardı değil, mevcut fixture kısalığının kanıtıdır.

## 12. Reading time

Durum: PASS

İleride kavramsal hesap `wordCount / expected reading speed × 60` olabilir. Bu aşamada sabit veya sahte WPM formülü kodlanmadı.

`ContentVersion` üzerinde estimated reading time alanı yoktur. Runtime `timeSpentMs`, öğrencinin gerçek session/attempt süresidir; editorial tahminle karıştırılmamalıdır.

## 13. Language quality

Durum: PASS

Standard; Türkçe imla/noktalama, doğal cümle, anlamsal tutarlılık, gereksiz tekrarın yokluğu, yaşa uygun kelime seçimi, akıcı geçişler ve robotik/translationese dilden uzaklığı zorunlu editorial gate olarak tanımlar.

## 14. Vocabulary

Durum: PASS

Gerektiğinde yeni kelime/terim, context sentence, bağlamdan anlam, zorluk sinyali ve kısa yaşa uygun gloss annotation'ı yapılabilir. Her kelime açıklanarak vocabulary hedefi yok edilmemelidir.

Mevcut schema'da Vocabulary entity/annotation yoktur. `SkillCategory.VOCABULARY`, QuestionVersion hint/explanation ve options kullanılabilir; structured vocabulary extension sonraya bırakıldı.

## 15. Content structure

Durum: PASS

Varsayılan passage yapısı: title → hook/opening → main body → coherent paragraphs → conclusion/closure. Tür gerektiriyorsa röportaj soru-cevap, şiir stanza, diyalog turn-taking, görüş yazısı iddia-gerekçe-kanıt-sonuç yapısını kullanabilir.

Yapı türden bağımsız olarak learning objective ve questionability'yi desteklemelidir.

## 16. Hook

Durum: PASS

İlk 1–2 cümle merak uyandırmalı; metnin gerçek sorusunu açmalı ve devamında karşılığını bulmalıdır. Clickbait, korkutma, yapay şaşırtma ve aşırı çocukça sloganlar kullanılmamalıdır.

## 17. Paragraph design

Durum: PASS

Mobile reading için bir paragrafta baskın fikir, kısa/orta uzunluk, açık geçiş ve yeterli spacing önerilir. Başlangıç referansı 2–5 cümle veya yaklaşık 40–90 kelimedir; bu katı limit değildir.

“Small chunks” yaklaşımı metnin anlam bütünlüğünü bozacak kadar parçalanmamalıdır.

## 18. Difficulty

Durum: PASS

Editorial difficulty şu boyutlarda ayrı incelenir: language complexity, conceptual complexity, sentence complexity, vocabulary difficulty, inferential demand ve question difficulty.

Schema'da `Content.difficulty` 0..1 Float, `QuestionVersion.difficulty` nullable Float ve `ContentVersion.readabilityScore` nullable'dır; bunların semantiği tam standardize edilmemiştir. Attempt calibration alanları authoring difficulty değildir. Standard tek sayı yerine sözel gerekçe ister.

## 19. Questionability

Durum: PASS

İyi content açık bilgi, baskın ana fikir, metin kanıtı, anlamlı çıkarım, neden-sonuç/karşılaştırma/yapı ilişkisi ve gerektiğinde context clue sağlamalıdır.

Soru cevabı metinle desteklenmeli; dışarıdan bilgi, belirsiz ifade veya iki doğru cevaba açık yapı bulunmamalıdır. Metin yapay soru doldurmak için bilgi yığınına dönüştürülmemelidir.

## 20. Factual accuracy

Durum: PASS

Gerçek bilgi içeren content'te yanlış bilgi, uydurma istatistik/kaynak, doğrulanamayan kesin iddia veya kanıtsız kişi/kurum isnadı bulunmamalıdır. Factual claims editorial provenance ile doğrulanmalıdır.

Kurgu metin açıkça kurgu olarak sınıflandırılmalı; kurgu unsuru gerçek bilgi iddiası gibi sunulmamalıdır.

## 21. Sensitive content

Durum: PASS

Nefret, graphic violence, sexual content, siyasi propaganda, tehlikeli davranış özendirmesi, self-harm, madde kullanımı, suç veya yeme bozukluğu romantizasyonu özel/senior review gerektirir.

Eğitimsel olarak gerekli konu varsa grafik ayrıntı, talimat, yüceltme ve manipülasyondan kaçınılır. Policy engine bu aşamada yapılmadı; yalnızca editorial policy tanımlandı.

## 22. Copyright

Durum: PASS

Kitap, web sayfası veya sınav kitabından izinsiz kopyalama yasaktır. İçerik original veya uygun lisanslı/adapte edilmiş olmalı; lisans belirsizse publish edilmemelidir.

Mevcut `ContentVersion.license` alanı nullable'dır ve provenance'ın tamamı değildir. Copyright kontrolü factual/pedagogical kaliteyi otomatik garanti etmez.

## 23. Provenance

Durum: PASS

Production content için author, source, source type, license, adaptation note, reviewer, reviewedAt, factual verification ve varsa AI involvement izlenebilir olmalıdır.

Mevcut schema'da Content/ContentVersion `createdById`, ContentVersion `license/changelog`, publication dates ve QuestionVersion `generationMetadata` vardır. Source, editorial author, reviewer ve review decision first-class değildir; future extension olarak raporlandı.

## 24. Learning objective

Durum: PASS

Her content için “Öğrenci bunu okuduktan sonra neyi yapabilecek?” sorusuna tek, gözlenebilir cümleyle yanıt verilmelidir. `Belirler`, `bulur`, `karşılaştırır`, `çıkarır`, `kanıtlar` gibi fiiller tercih edilir.

Örnek: “Öğrenci metindeki örtük nedensellik ilişkisini metin kanıtıyla çıkarabilir.” Objective bugün schema alanı değildir; authoring brief standardıdır.

## 25. Skill alignment

Durum: PASS

Her content Primary Skill, gerektiğinde Secondary Skill ve her skill için kanıt/role taşımalıdır. Mevcut `ContentSkill` many-to-many'dir, primary/secondary role saklamaz; Question'da tek optional skill bulunur.

Primary/secondary ve version-aware alignment 8G-4 Question Blueprint + future schema ADR'sinde kesinleştirilecektir.

## 26. Question mix

Durum: PASS

Başlangıç örneği 5 soru için 2 comprehension, 1 detail, 1 inference, 1 vocabulary/context clue'dur. Bu production zorunluluğu değil, Question Blueprint girdisidir.

Mevcut Content → Question → QuestionVersion → TemplateVersion → Session zinciri Content'in birden fazla exercise template içinde yeniden kullanılmasını destekler. `Assessment` passage-based olduğunda ContentVersion + QuestionVersion, template composition üzerinden gelir.

## 27. Exam compatibility

Durum: PASS

`EXAM` generic `EXAM_PREPARATION` lens'idir; LGS/TYT/AYT bu aşamada schema'ya gömülmez. Exam-compatible content net paragraf yapısı, süreyle uyumlu hacim, kanıtlanabilir soru kökü ve makul distractor'larla hazırlanır.

Zaman baskısı content'e zorunlu metadata olarak değil, exercise/assessment layer'ında uygulanmalıdır. Assessment bugün Level'e optional bağlanır; template seçimi JSON config/service validation içindedir.

## 28. Versioning

Durum: PASS

Metin düzeltmesi yeni `ContentVersion` oluşturmalıdır. `ContentVersion(contentId, version)` unique'tir; body/title version'dadır, wordCount yeniden hesaplanır, published version immutable'dır ve Content.currentVersionId pointer'ı güncellenir.

QuestionVersion ve Attempt history korunmalıdır. Factual/pedagogical değişiklik soruları etkiliyorsa yeni QuestionVersion ve gerektiğinde TemplateVersion gerekir. Taxonomy/editorial alignment published history'yi geriye dönük değiştirmemelidir.

## 29. Publication

Durum: PASS

Gerçek ContentVersion lifecycle'ı `DRAFT → REVIEW → PUBLISHED → ARCHIVED`'dır. `APPROVED` schema status'i yoktur; bu aşamada icat edilmedi. Root Content lifecycle'ı `DRAFT/PUBLISHED/ARCHIVED`'dır.

Teknik REVIEW status'ı ReviewRecord değildir. Editorial checklist ve human decision ayrı future review domain'iyle izlenmelidir.

## 30. Quality gates

Durum: PASS

Publish öncesi standard gate'leri: language QA, factual QA, age/grade QA, skill alignment, difficulty, questionability, copyright/provenance, accessibility, mobile readability, sensitive content/bias ve editorial integrity.

Bu aşamada sayısal content quality/mastery score formülü uydurulmadı. Gate'ler checklist + reviewer note olarak tanımlandı; tek sayı bir failed gate'i gizlememelidir.

## 31. Accessibility

Durum: PASS

Content semantic title/paragraph/headings kullanmalı; anlam yalnızca renk/görsel konumla taşınmamalı; screen reader sıralı okumalı; medya varsa alt text/caption/transcript/role sağlanmalıdır.

Mevcut QuestionMedia altText/caption taşır fakat ContentVersion'a direct media relation yoktur. Content-level media future extension'dır.

## 32. Mobile readability

Durum: PASS

390×844 hedefinde tiny text, horizontal overflow ve aşırı uzun satırlardan kaçınılmalı; yeterli line-height/spacing, rahat scroll, paragraph hierarchy ve ragged-right okunabilirlik korunmalıdır. Justified text zorunlu değildir.

Bu aşama UI kodu değiştirmedi; gerçek cihaz/browser visual QA ayrı test kapsamıdır.

## 33. AI content policy

Durum: PASS

AI draft doğrudan PUBLISHED olamaz. Önerilen akış: AI draft → human editorial review → pedagogical QA → factual/copyright/bias check → approved version → publish.

Mevcut QuestionGenerationJob future queue başlangıcıdır; content generation worker/safety/provenance pipeline'ı değildir. Bu aşamada AI content veya toplu question üretilmedi.

## 34. Human review

Durum: PASS

İnsan reviewer pedagogy, Türkçe, factual accuracy, age/grade, questionability, bias/sensitive content, copyright/provenance, accessibility ve mobile readability boyutlarını kontrol etmelidir.

Schema'da Review/ReviewRecord, reviewer, decision, rejection reason, rubric version ve reviewedAt bulunmadığı için bu alanlar future extension'dır.

## 35. Metadata matrix

Durum: PASS

| Metadata               | Mevcut schema                                         | Gerekli                           | Aşama                                        |
| ---------------------- | ----------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Title                  | Content + ContentVersion                              | Evet                              | Şimdi kullan; version QA                     |
| Body                   | ContentVersion                                        | Evet                              | Şimdi kullan; published immutable            |
| WordCount              | ContentVersion; service otomatik hesaplar             | Evet                              | Şimdi kullan; manuel girme                   |
| Skill                  | ContentSkill; Question tek optional skill             | Evet                              | Şimdi brief; 8G-4/future role-aware relation |
| Grade                  | Level global, Content alignment yok                   | Evet                              | Grade 5–12 contract; future alignment        |
| Reading Proficiency    | Yok                                                   | Evet, ayrı kavram                 | Future rubric/alignment                      |
| Topic/Domain           | Yok                                                   | Evet                              | Future global controlled vocabulary          |
| Unit                   | Yok                                                   | Curriculum için evet              | Gerçek örneklerden sonra                     |
| Age band               | Yok                                                   | Editorial guard olarak yararlı    | Future nullable metadata                     |
| Difficulty             | Content 0..1; QV optional; semantics eksik            | Evet                              | Şimdi sözel rubric; future dimensions        |
| TextType/Genre         | ContentType sınırlı enum                              | Evet                              | Şimdi brief; future genre metadata           |
| LearningGoal           | StudentProfile String allowlist                       | Lens olarak evet                  | Şimdi brief etkisi                           |
| Source                 | Yok                                                   | Evet                              | Future provenance                            |
| License                | ContentVersion nullable                               | Evet                              | Şimdi publish gate                           |
| Author                 | createdById var; editorial author ayrımı yok          | Evet                              | Future provenance                            |
| ReviewStatus           | VersionStatus REVIEW var; Review entity yok           | Evet                              | Lifecycle şimdi; evidence future             |
| Reviewer/reviewedAt    | Yok                                                   | Evet                              | Future ReviewRecord                          |
| Locale                 | Yok                                                   | Evet                              | Content expansion öncesi                     |
| Readability score      | Nullable var; 11/11 published fixture null            | Yararlı, tek başına yeterli değil | Method/version future                        |
| Estimated reading time | Yok                                                   | Yararlı                           | WPM contract sonrası                         |
| Vocabulary annotations | Yok                                                   | Gerektiğinde                      | Future structured annotation                 |
| Accessibility review   | Yok                                                   | Evet                              | Checklist şimdi; record future               |
| Media                  | QuestionVersionMedia var; ContentVersion relation yok | Türüne göre                       | Content media future                         |
| Provenance/AI          | QV generationMetadata var; content provenance yok     | Evet                              | Future provenance                            |

Canlı gap kanıtı: 11 published ContentVersion'ın tamamında `readabilityScore` ve `license` null; 31 published QuestionVersion'ın tamamında difficulty, explanation ve hint null; QuestionMedia ve QuestionGenerationJob sayısı 0'dır. Bunlar fixture durumudur, standardın production'a uygulandığı anlamına gelmez.

## 36. Schema decision

Durum: PASS

Karar: **B — MINIMUM SCHEMA EXTENSION GEREKLİ; PLANLANDI, BU AŞAMADA UYGULANMADI.**

Mevcut schema editorial standardın yaklaşık %60–70'lik teknik çekirdeğini taşır: title/body/type, wordCount, difficulty placeholder, Skill, question, versioning, publication, creator, license ve exercise/assessment composition. Grade/domain/proficiency/provenance/review/accessibility katmanı tamamlanmış değildir.

Minimum future extension adayları: Content/ContentVersion metadata alignment, Unit/CurriculumNode, Topic/Domain alignment, version-aware primary/secondary skill alignment, source/provenance, ReviewRecord, content-level media ve difficulty/readability method contract.

## 37. Documentation

Durum: PASS

Ana çıktı oluşturuldu: [READING_CONTENT_STANDARD.md](D:/oku-plus/docs/READING_CONTENT_STANDARD.md).

Belge purpose, target users, grade, proficiency, age, text types, domains, skills, length, word count, reading time, language, vocabulary, structure, hook, paragraph, difficulty, questionability, factual/sensitive/copyright/provenance, objective, alignment, question mix, exam, versioning, publication, gates, accessibility, mobile, AI, human review, metadata, schema ve editorial checklist bölümlerini içerir.

## 38. Tests

Durum: PASS

Docs-only kapsamına uygun Markdown validation çalıştırıldı:

- `npx prettier --check docs/CURRICULUM_ARCHITECTURE.md docs/CURRICULUM_TAXONOMY.md docs/STAGE_8G1_FINAL_REPORT.md docs/STAGE_8G2_FINAL_REPORT.md docs/READING_CONTENT_STANDARD.md docs/STAGE_8G3_FINAL_REPORT.md`: PASS.
- Final report 47 numbered section ve ayrı son karar bölümünü içerir.
- Her report maddesi izin verilen durum etiketlerinden biriyle işaretlenmiştir.

## 39. Regression

Durum: ÇALIŞTIRILMADI

Kod/schema değişikliği olmadığı için browser regression script'leri bu fazda yeniden çalıştırılmadı. Önceki faz sonuçları bu rapora kopyalanmadı.

## 40. npm test

Durum: ÇALIŞTIRILMADI

Kod/schema değişikliği olmadığı için `npm test` bu fazda çalıştırılmadı.

## 41. Quality gates

Durum: ÇALIŞTIRILMADI

`node --check public/app.js`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` bu docs-only fazda yeniden çalıştırılmadı. Markdown Prettier check çalıştırıldı.

## 42. Localhost

Durum: ÇALIŞTIRILMADI

Runtime/source/schema değişikliği olmadığı için localhost health/browser smoke check bu fazda yeniden çalıştırılmadı.

## 43. Demo data

Durum: PASS

Canlı database yalnızca read-only sorgularla incelendi. 11 global published Content, 31 published QuestionVersion, 12 published Template ve 0 Assessment doğrulandı; demo/test tenant/content üzerinde write/delete yapılmadı.

## 44. Cleanup

Durum: PASS

Bu faz content/seed/fixture üretmedi; cleanup yapılmadı. `TRUNCATE`, broad delete veya mevcut E2E/orphan fixture'ları silme işlemi yapılmadı.

## 45. Changed files

Durum: PASS

Bu fazda eklenen dosyalar:

- `D:/oku-plus/docs/READING_CONTENT_STANDARD.md`
- `D:/oku-plus/docs/STAGE_8G3_FINAL_REPORT.md`

`prisma/schema.prisma`, migration, production source, test source ve seed dosyaları değiştirilmedi. Başlangıç repository'sinin tamamen untracked olması nedeniyle phase scope bu iki documentation dosyasıyla raporlanmıştır.

## 46. Known limitations

Durum: PASS

- Gerçek production content, 5–12 curriculum seed'i ve editorial sample yayınlanmadı.
- Grade, age, reading proficiency, Topic, Unit, locale ve content provenance first-class değildir.
- `readabilityScore`, license, question difficulty/explanation/hint canlı fixture'larda boştur.
- ReviewRecord, teacher authoring, accessibility record, adaptive/mastery/review engine yoktur.
- Fiziksel cihaz, ekran okuyucu, production CDN/media ve dış provider testleri yapılmadı.

## 47. Next recommended phase

Durum: PASS

Önerilen sonraki faz **Aşama 8G-4 — Question Blueprint + Assessment Item Standard**:

1. Skill/objective başına soru blueprint'i.
2. Question mix ve distractor rubric'i.
3. Açık uçlu rubric/scoring ve explanation/hint standardı.
4. Generic exam compatibility ve assessment blueprint'i.
5. ContentVersion/QuestionVersion alignment ve review gate'lerinin teknik ADR'si.

Gerçek content production ancak bu blueprint ve editorial checklist onaylandıktan sonra başlamalıdır.

## KRİTİK KALİTE KURALI

Durum: PASS

Bu çıktı AI ile güzel metin üretme rehberi değil; pedagojik, dilsel, teknik, telif, yaş uygunluğu, erişilebilirlik ve ölçme boyutlarını birlikte kontrol eden production editorial standarddır.

## SON KARAR

Durum: PASS

**AŞAMA 8G-3 TAMAMLANDI — SCHEMA EXTENSION PLANNED**

Reading Content Standard hazırdır. Schema extension gereksinimi tanımlanmış, ancak gerçek curriculum örnekleri ve Question Blueprint kesinleşmeden migration uygulanmamıştır. Büyük architecture blocker yoktur.
