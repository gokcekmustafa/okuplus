# OKU+ — AŞAMA 8G-4 FINAL RAPOR

Tarih: 2026-09-01  
Kapsam: Question Blueprint & Pedagogy / professional question design standard  
Ana çıktı: [QUESTION_BLUEPRINT_AND_PEDAGOGY.md](D:/oku-plus/docs/QUESTION_BLUEPRINT_AND_PEDAGOGY.md)

Bu aşamada soru bankası, toplu soru, migration, scoring algorithm, AI generation veya production seed oluşturulmamıştır. Amaç “soru nasıl tasarlanmalı?” sorusuna uygulanabilir, editoryal ve pedagojik bir contract vermektir.

## 1. Repository discovery

Durum: PASS

- İlk kontroller çalıştırıldı: `git status --short` ve `git diff --name-only`.
- Başlangıç çalışma ağacında commit'e alınmış dosya yoktu; tüm proje dosyaları untracked, diff boştu. Mevcut dosyalar korunmuştur.
- 8G-1, 8G-2 ve 8G-3 architecture/quality belgeleri ile gerçek `prisma/schema.prisma` okundu.
- Question schemas/service scoring, content/template/assessment ilişkileri, QuestionMedia ve Attempt alanları incelendi.

## 2. Pedagogical principles

Durum: PASS

Teknik type/options/answer/score/attempt ile pedagojik objective/skill/cognitive demand/difficulty/distractor/explanation/feedback ayrıldı.

Her soru; tek bir Primary Skill ve gözlenebilir objective taşımalı, ContentVersion kanıtına dayanmalı, dış bilgi gerektirmemeli, bağımsız cevaplanabilmeli ve öğrenciyi küçük düşürmeyen feedback üretmelidir.

## 3. Skill alignment

Durum: PASS

Mevcut gerçek SkillCategory değerleri `MAIN_IDEA`, `DETAIL`, `INFERENCE`, `VOCABULARY`, `FACTUAL`, `COMPREHENSION`'dır. Öğrenci dili ve outcome'lar blueprint matrix'e bağlandı.

`Question.skillId` yalnızca optional tek skill'dir. Primary/secondary role, objective veya version-aware alignment schema'da yoktur; bunlar editorial contract ve future extension olarak işaretlendi.

## 4. Question types

Durum: PASS

Gerçek beş type incelendi: `MULTIPLE_CHOICE`, `TRUE_FALSE`, `OPEN_ENDED`, `MATCHING`, `FILL_BLANK`.

Her type için uygun hedefler, uygun olmayan durumlar, güçlü/zayıf yönler, skill kullanımı ve grade dikkatleri standarda yazıldı. Type seçimi teknik UI kapasitesinden önce learning objective'e göre yapılır.

## 5. MULTIPLE_CHOICE

Durum: PASS

3–5 seçenek, tek clear best answer, text-related plausible distractor, dengeli grammar/length ve ContentVersion kanıtı standardize edildi. Çoklu seçim yalnızca objective gerçekten birden fazla doğru gerektiriyorsa kullanılmalıdır.

Mevcut `options` JSON ve `correctAnswer.correctOptionIds`, `allowMultiple`, `partialCredit` yapısını destekler; teknik varlık pedagojik kaliteyi otomatik garanti etmez.

## 6. TRUE_FALSE

Durum: PASS

İfade kısa, tek anlamlı ve metne dayalı olmalıdır. Double negative, belirsiz “genellikle/çoğunlukla” ifadeleri ve yalnızca kelime değiştirerek kurulan tuzaklar yasaktır.

Mevcut scorer boolean exact match ile 1/0 rawScore üretir.

## 7. OPEN_ENDED

Durum: PASS

Gerekçe, yorum, çıkarım, kısa açıklama ve karşılaştırma için uygundur. Prompt beklenen kapsamı açıklamalı; expectedAnswer, acceptableVariants ve gerekirse rubric yazılmalıdır.

Mevcut scorer `isCorrect=null`, `rawScore=null` ve manuel değerlendirme feedback'i üretir. Otomatik grading yoksa doğru/yanlış iddiası yapılmayacaktır.

## 8. MATCHING

Durum: PASS

Kavram→açıklama, sebep→sonuç, kelime→anlam gibi anlamlı iki set ilişkileri standardize edildi. Sağ set aynı semantic sınıfta olmalı; rastgele eşleştirme ve gereksiz working-memory yükü olmamalıdır.

Mevcut `correctAnswer.pairs`, option `matchGroup`/`position` ve partial credit desteğiyle uyumludur.

## 9. FILL_BLANK

Durum: PASS

Vocabulary, terminology ve factual recall için uygundur. Boşluk objective açısından anlamlı olmalı; grammar cevabı gereksiz biçimde ele vermemeli; eş anlamlı, çekim, yazım ve case varyantları önceden tanımlanmalıdır.

Mevcut scorer accepted answers, case-insensitive varsayılan eşleşme, optional regex ve partial credit destekler.

## 10. Main Idea

Durum: PASS

Ana fikir sorusu metnin tamamını kapsayan tek best answer istemeli; ilk paragrafı veya tek detayı özetlememeli; konu başlığı ile merkez düşünceyi karıştırmamalı; aşırı genel veya aşırı spesifik olmamalıdır.

## 11. Detail

Durum: PASS

Detail cevabı metinde doğrudan bulunmalı, fakat copy-paste keyword araması olmamalıdır. Paraphrase, açık kanıt ve benzer detaylardan doğan belirsizliğin giderilmesi standardize edildi.

## 12. Inference

Durum: PASS

Inference metinde kelimesi kelimesine bulunmayan fakat metin kanıtından desteklenen sonuçtur. “Metinde yok ama doğru olabilir” yasaktır; birden fazla eşit derecede güçlü sonuç oluşuyorsa soru revize edilir.

## 13. Vocabulary

Durum: PASS

Vocabulary sorusu sözlük ezberini değil, kelimenin bu bağlamdaki anlamını ölçmelidir. Context clue, komşu cümle, semantic seçenekler ve alan terimi yükü dikkate alınır.

## 14. Difficulty

Durum: PASS

Soru zorluğu şu boyutlara ayrıldı: linguistic complexity, content complexity, inference demand, distractor similarity ve cognitive load.

Editorial bandlar `Kolay/Orta/Zor` olarak önerildi; bu yeni DB enum'u değildir. Gerçek `QuestionVersion.difficulty` nullable Float'tur, Zod ile 0–1 kabul edilir, ancak band semantiği tanımlı değildir. Tek sayı publish gate'in yerine geçmez.

## 15. Distractors

Durum: PASS

Distractor'lar plausible, text-related, aynı kapsam/grammar içinde ve muhtemel misconception'a dayalı olmalıdır. Alakasız, saçma, dış bilgiye dayalı, uzunlukla kendini ele veren veya iki doğru oluşturan seçenekler yasaktır.

## 16. Answer balance

Durum: PASS

Doğru cevap sürekli A/C gibi aynı pozisyonda olmamalı, ancak dağılım tamamen rastgele de bırakılmamalıdır. Set boyunca dengeli position dağılımı, aynı pattern'in arka arkaya tekrarlanmaması ve option ID/correctAnswer tutarlılığı tanımlandı.

Mevcut `options.position` vardır; answer distribution DB constraint'i değildir.

## 17. Question order

Durum: PASS

Genel öneri direct detail → comprehension/main idea → inference → synthesis/justification akışıdır. Her passage için zorunlu pattern değildir; soru sırası objective, metin ve exercise bağlamına göre seçilir.

`Question.position` ve TemplateVersion position teknik sıralamadır; otomatik pedagojik progression değildir.

## 18. Question count

Durum: PASS

Başlangıç önerileri: Mini 100–180 kelime için 2–3; Kısa 180–300 için 3–4; Orta 300–500 için 4–6; Uzun 500–800+ için 5–8 soru.

Grade, Skill, goal, assessment, questionability ve cognitive load'a göre değişebilir. Bunlar DB rule veya hard validation değildir.

## 19. Question mix

Durum: PASS

Beş soruluk comprehension exercise için örnek mix: 2 detail/comprehension, 1 main idea, 1 inference, 1 vocabulary/context clue. Bu örnek blueprint girdisidir; her passage'a mekanik kota değildir.

Primary Skill ve objective, type/count kararından önceliklidir.

## 20. Dependencies

Durum: PASS

Bir soru başka bir sorunun cevabına bağlı olmamalıdır. Her soru aynı ContentVersion üzerinden bağımsız yanıtlanabilmeli; önceki selection/order bilgisine ihtiyaç duymamalı ve kendi evidence/explanation'ını taşımalıdır.

## 21. Explanation

Durum: PASS

Puanlanabilir objective sorular için explanation editorial olarak zorunlu önerildi; mevcut schema'da nullable'dır. Explanation kısa, öğrenciye yönelik, metin kanıtını/düşünme yolunu gösteren ve doğru cevabı yalnızca tekrar etmeyen yapıda olmalıdır.

## 22. Hint

Durum: PASS

Hint cevabı söylemeden doğru kanıta yönlendirmeli; ana fikirde kapsamı, inference'ta ipucunu, vocabulary'de komşu cümleyi işaret etmelidir. Mevcut `QuestionVersion.hint` nullable'dır; HINT media role vardır; kullanım gate'i runtime'da enforce edilmez.

## 23. Feedback

Durum: PASS

Correct feedback pozitif ve doğru düşünme adımını adlandırmalı; wrong feedback yapıcı ve kanıta döndürücü olmalı; pending feedback insan değerlendirmesi gerektiğini dürüstçe belirtmelidir.

Mevcut scorer yalnızca OPEN_ENDED için manuel değerlendirme feedback'i üretir; objective feedback/explanation bağlantısı bu aşamada uygulanmadı.

## 24. Scoring

Durum: PASS

Mevcut deterministic scorer analiz edildi: objective type'larda rawScore 0–1; multi-select/matching/fill blank partial credit oranları; True/False exact match; OPEN_ENDED null score.

`Question`/`QuestionVersion` üzerinde `points` yoktur. Yeni scoring algorithm veya item weight eklenmedi. Gamification PointEvent assessment points ile karıştırılmayacaktır.

## 25. Open-ended evaluation

Durum: PASS

Open-ended akışı `submitted → pending → human/AI review → graded evidence` olarak tanımlandı. Attempt'te manual/AI grading alanları mevcut olsa da aktif AI grading pipeline'ı yoktur.

Rubric objective, evidence, gerekçe/çıkarım ve kısmi başarı sınırlarını içermelidir. Otomatik doğru/yanlış iddiası yapılmayacaktır.

## 26. Media

Durum: PASS

QuestionMedia IMAGE/AUDIO/VIDEO/DOCUMENT ve QuestionVersionMedia `MAIN/OPTION/EXPLANATION/HINT` relation'ları incelendi. Media yalnızca soruya ölçme değeri katıyorsa kullanılmalı; altText, caption/transcript ve role accessibility açısından kontrol edilmelidir.

ContentVersion'a doğrudan media relation'ı yoktur; content-level media future extension'dır.

## 27. Exam

Durum: PASS

`EXAM` generic `EXAM_PREPARATION` learning-goal lens'i olarak tanımlandı. LGS/TYT/AYT bu aşamada schema'ya gömülmedi.

Exam-compatible item; taranabilir kök, passage'a uygun süre/hacim, kaliteli distractor, tek best answer ve metin kanıtı taşır. Time pressure exercise/assessment layer'ındadır.

## 28. Accessibility

Durum: PASS

Question stem ve option text screen reader dostu, semantik ve kısa olmalı; anlam yalnızca renk/ikonla taşınmamalı; matching ve fill blank için keyboard/alternative interaction mümkün olmalıdır. Media text alternative taşımalıdır.

## 29. Mobile

Durum: PASS

390×844 hedefinde question stem/options okunabilir, uzun seçenekler horizontal overflow oluşturmayan, matching dokunmatik kullanıma uygun, fill blank keyboard ile erişilebilir ve explanation/hint alanı taşmayan biçimde tasarlanmalıdır.

Bu aşamada UI kodu değiştirilmedi.

## 30. Age

Durum: PASS

13–17 yaş için vocabulary ne çocukça ne gereksiz akademik; soru kökü saygılı ve tek anlamlı; mature topic'ler safety policy ile kontrol edilmelidir. Abstract demand grade/proficiency ile ayarlanmalı, dış ön bilgi yerine passage evidence kullanılmalıdır.

## 31. Bias

Durum: PASS

Gender, cultural, regional ve class stereotype; siyasi/dini persuasion; grup genellemesi ve öğrencinin kişisel/ekonomik deneyimini doğru cevabın ön koşulu yapan bağlamlar yasaklandı.

Sorular öğrencinin worldview'ünü değil, metin kanıtını ölçmelidir.

## 32. Safety

Durum: PASS

Sexual content, self-harm, dangerous instructions ve graphic violence içeren content/question senior editorial review gerektirir. Zararlı davranış talimatı/yüceltmesi ve öğrenciyi kişisel deneyimini açıklamaya zorlayan prompt kullanılmamalıdır.

Safety engine/classifier yapılmadı.

## 33. Copyright

Durum: PASS

Question özgün veya uygun lisanslı passage'a özel olmalı; telifli sınav sorusu/web/book metni kopyalanmamalı; option ve explanation da özgün olmalıdır.

ContentVersion.license yardımcıdır; question-level source/provenance ve clearance first-class değildir.

## 34. QA checklist

Durum: PASS

Her soru için skill/objective, type, text answerability, dependency, answer, distractor, difficulty, language, explanation, hint, age, bias, accessibility, copyright, exam ve version/publish checklist'i tanımlandı.

## 35. Blueprint matrix

Durum: PASS

Mevcut altı SkillCategory için uygun QuestionType, unsuitable durumlar, difficulty notu, explanation ve hint yaklaşımı matrix olarak oluşturuldu. Schema'da olmayan `STRUCTURE`, `CRITICAL_READING`, `ARGUMENT` ve `SYNTHESIS` mevcut skill gibi gösterilmedi.

## 36. Content integration

Durum: PASS

Content brief'ten `Grade/Age/Topic/TextType/Primary Skill/Objective/Difficulty` alınır; Question Blueprint bunu `Skill/Objective/QuestionType/Demand/Answer/Distractors/Explanation/Hint` ile tamamlar.

Question Content root'una, QuestionVersion prompt/answer history'sine bağlıdır. ContentVersion-specific evidence/alignment gelecekte version-aware olmalıdır.

## 37. Exercise integration

Durum: PASS

Content → Question → QuestionVersion → TemplateVersionQuestion → ExerciseTemplateVersion → ExerciseSession zinciri doğrulandı.

Bir reading content birden fazla reusable exercise template/version içinde kullanılabilir. Template type (`COMPREHENSION`, `FLUENCY`, `INFERENCE`, `VOCABULARY`, `MIXED`) SkillCategory değildir.

## 38. Assessment integration

Durum: PASS

Assessment `PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK` type'larını ve optional Level relation'ını taşır. Template/templateVersion bağlantısı JSON config/service validation'dır; relational FK değildir.

Assessment blueprint question mix, skill coverage, difficulty/demand distribution, multiple content block, estimated time ve generic exam context'i kapsar. Scoring aggregation algorithm yazılmadı.

## 39. AI policy

Durum: PASS

AI soru taslağı doğrudan publish edilemez. Standard workflow: AI draft → human review → pedagogy review → factual/copyright/bias review → publish.

`QuestionGenerationJob` future queue başlangıcıdır; provider/worker/evaluator/safety/cost/provenance pipeline'ı değildir. Bu fazda AI generation yapılmadı.

## 40. Human review

Durum: PASS

İnsan reviewer objective/skill, type, answerability, answer/distractor, explanation/hint, language/age, bias/safety, accessibility/mobile, copyright/provenance ve version readiness kontrol etmelidir.

`VersionStatus.REVIEW` review kaydının kendisi değildir; ReviewRecord future extension'dır.

## 41. Schema analysis

Durum: PASS

Gerçek mevcut alanlar:

- Question: `contentId`, `position`, `type`, optional `skillId`, status, creator, timestamps, soft delete.
- QuestionVersion: `version`, `prompt`, `options`, `correctAnswer`, optional `explanation`, `hint`, `difficulty`, status, `publishedAt`, `partialCreditEnabled`, `generationMetadata`.
- Attempt: answer, `isCorrect`, `rawScore`, `timeSpentMs`, response order, feedback, manual/AI grading ve calibration alanları.

Eksikler: objective, cognitiveDemand, primary/secondary skill role, points/maxPoints/weight, question provenance, reviewer decision, version-specific alignment, structured distractor rationale ve explanation/hint QA state.

## 42. Schema decision

Durum: PASS

Karar: **B — MINIMUM SCHEMA EXTENSION GEREKLİ; PLANLANDI, BU AŞAMADA UYGULANMADI.**

Mevcut schema blueprint'in yaklaşık %60–70'lik teknik çekirdeğini taşır. Full production pedagogy için version-aware skill/objective alignment, cognitive demand/difficulty contract, rubric/points/weight, provenance/review ve content-version evidence extension'ları gereklidir.

## 43. Documentation

Durum: PASS

Ana çıktı oluşturuldu: [QUESTION_BLUEPRINT_AND_PEDAGOGY.md](D:/oku-plus/docs/QUESTION_BLUEPRINT_AND_PEDAGOGY.md).

Belge 42 ana bölümle purpose, pedagogy, tüm question type'ları, Skill matrix, difficulty, distractor, answer balance/order/count/mix, explanation/hint/feedback, scoring, open-ended, media, exam, accessibility/mobile/age/bias/safety/copyright, QA, content/exercise/assessment integration, AI, human review ve schema recommendation konularını kapsar.

## 44. Tests

Durum: PASS

Docs-only kapsamına uygun Markdown validation çalıştırıldı:

- `npx prettier --check docs`: PASS.
- Final report 53 numbered section ve ayrı eğitimsel kalite/son karar bölümlerini içerir.
- Her rapor maddesi izin verilen durum etiketlerinden biriyle işaretlenmiştir.

## 45. Regression

Durum: ÇALIŞTIRILMADI

Kod veya schema değişikliği olmadığı için browser regression script'leri bu fazda yeniden çalıştırılmadı. Önceki faz sonuçları bu rapora kopyalanmadı.

## 46. npm test

Durum: ÇALIŞTIRILMADI

Kod/schema değişikliği olmadığı için `npm test` bu fazda çalıştırılmadı.

## 47. Quality gates

Durum: ÇALIŞTIRILMADI

`node --check public/app.js`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` docs-only kapsamı nedeniyle yeniden çalıştırılmadı. Markdown check çalıştırıldı.

## 48. Localhost

Durum: ÇALIŞTIRILMADI

Runtime/source/schema değişikliği olmadığı için localhost health/browser smoke check yeniden çalıştırılmadı.

## 49. Demo data

Durum: PASS

Canlı `oku_plus_test` yalnızca read-only sorgularla incelendi. 31 published QuestionVersion, 0 QuestionMedia ve 0 QuestionGenerationJob doğrulandı; test tenant/content üzerinde write/delete yapılmadı.

## 50. Cleanup

Durum: PASS

Bu faz soru veya fixture üretmedi. `TRUNCATE`, broad delete veya mevcut E2E/orphan kayıtlarını silme işlemi yapılmadı.

## 51. Changed files

Durum: PASS

Bu fazda eklenen documentation dosyaları:

- `D:/oku-plus/docs/QUESTION_BLUEPRINT_AND_PEDAGOGY.md`
- `D:/oku-plus/docs/STAGE_8G4_FINAL_REPORT.md`

`prisma/schema.prisma`, migration, production source ve test source değiştirilmedi.

## 52. Known limitations

Durum: PASS

- Gerçek question bankası ve production content henüz yoktur.
- Objective, cognitive demand, primary/secondary role, points, provenance ve review record first-class değildir.
- `OPEN_ENDED` otomatik değerlendirilmez.
- Objective feedback'in scorer'a otomatik bağlanması yoktur.
- Topic/Unit/grade/proficiency alignment mevcut değildir.
- AI, adaptive, mastery ve spaced repetition engine'leri yapılmamıştır.
- Fiziksel cihaz, screen reader ve production authoring workflow testi yapılmamıştır.

## 53. Next recommended phase

Durum: PASS

Önerilen sonraki faz **Aşama 8G-5 — Controlled Content + Question Pilot**:

1. Reading Content Standard'a uygun sınırlı sayıda pilot passage brief'i hazırlamak.
2. Her passage için blueprint'e bağlı soru seti tasarlamak.
3. Human editorial/pedagogical review ve QA kayıtlarını manuel yürütmek.
4. Gerçek örneklerden sonra schema extension ADR'sini kesinleştirmek.
5. Production seed ve migration kararını ancak pilot onayından sonra vermek.

## EĞİTİMSEL KALİTE GATE

Durum: PASS

Blueprint gerçek SkillCategory değerlerine bağlıdır; objective netliği, amaca uygun type, plausible distractor, kanıta dayalı inference, öğretici explanation, cevabı ifşa etmeyen hint, 13–17 yaş uygunluğu, Türkçe kalite, bias, safety ve copyright kontrollerini kapsar.

## SON KARAR

Durum: PASS

**AŞAMA 8G-4 TAMAMLANDI — SCHEMA EXTENSION PLANNED**

Question Blueprint ve pedagojik standard hazırdır. Schema metadata extension gereksinimleri planlandı; migration, scorer ve production question bankası bu aşamada uygulanmadı. Sonraki kontrollü içerik pilotu için güvenli contract hazırdır.
