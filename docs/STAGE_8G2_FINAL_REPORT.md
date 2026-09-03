# OKU+ — AŞAMA 8G-2 FINAL RAPOR

Tarih: 2026-09-01  
Kapsam: Level / Skill / Topic Taxonomy — pedagojik sınıflandırma ve teknik mimari  
Birincil kaynak: [CURRICULUM_TAXONOMY.md](D:/oku-plus/docs/CURRICULUM_TAXONOMY.md)

Bu aşamada amaç gerçek curriculum taxonomy'sini tanımlamaktır. Rastgele schema, migration, seed, production content veya Learning Path değişikliği yapılmamıştır.

## 1. Repository discovery

Durum: PASS

- İlk olarak `git status --short` ve `git diff --name-only` çalıştırıldı.
- Başlangıç çalışma ağacında commit'e alınmış dosya yoktu; proje dosyaları untracked durumundaydı ve diff boştu. Mevcut değişiklikler korunmuştur.
- `docs/CURRICULUM_ARCHITECTURE.md`, `docs/STAGE_8G1_FINAL_REPORT.md`, `prisma/schema.prisma`, manual RLS/trigger dosyaları ve ilgili module/service/schema dosyaları okundu.
- `Level`, `Skill`, `Content`, `ContentVersion`, `Question`, `QuestionVersion`, `ExerciseTemplate`, `ExerciseTemplateVersion`, `Assessment`, `StudentProgress` ve `StudentProfile` ilişkileri çıkarıldı.

## 2. Level

Durum: PASS

Gerçek model alanları: `code` unique, `name`, `minScore`, `maxScore`, nullable `gradeBand`, `difficultyMin`, `difficultyMax`, `displayOrder`, `createdAt`.

Relations: StudentProfile current/target level, Assessment level ve AssessmentResult result level. `Level` üzerinde tenantId, status enum'u, Skill/Topic/Unit relation'ı veya reading proficiency alanı yoktur. Manual RLS, Level'i global katalog olarak korur.

Canlı `oku_plus_test` verisi 12 Level içeriyor; kayıtlar `5. Sınıf`, `5. Sınıf E2E`, `Seviye X`, `Başlangıç`, `Temel` gibi fixture/E2E değerleri. Bunlar gerçek product seed'i olarak kabul edilmedi.

## 3. Grade

Durum: PASS

OKU+ için Level'in pedagojik anlamı Grade Level olmalıdır. Hedef grade kapsamı ortaokul ve lise için 5–12. sınıftır. 5, 6, 7, 8, 9, 10, 11 ve 12. sınıf ayrı, sıralı grade definition olarak planlanmalıdır.

Mevcut `gradeBand` nullable ve serbest metindir; kontrollü grade sözlüğü değildir. Bu aşamada yeni Level seed'i veya enum eklenmedi.

## 4. Reading proficiency

Durum: PASS

Grade Level okul müfredatı bandıdır; Reading Proficiency öğrencinin metni bağımsız okuyup anlamlandırma kapasitesidir. Bunlar aynı şey değildir.

Mevcut schema'da reading proficiency modeli/alanı yoktur. `Content.difficulty`, `QuestionVersion.difficulty`, `ContentVersion.readabilityScore` ve `Level.difficultyMin/max` proficiency olarak yorumlanmayacaktır. İleride rubric ile tanımlanmış ayrı bir proficiency bandı veya alignment gerekir.

## 5. Skill

Durum: PASS

Gerçek `SkillCategory` enum'u altı değerdir: `MAIN_IDEA`, `DETAIL`, `INFERENCE`, `VOCABULARY`, `FACTUAL`, `COMPREHENSION`.

Önerilen öğrenci dili:

| Teknik        | Öğrenci dili     |
| ------------- | ---------------- |
| MAIN_IDEA     | Ana fikri bul    |
| DETAIL        | Detayları yakala |
| INFERENCE     | Çıkarım yap      |
| VOCABULARY    | Kelime hazinesi  |
| FACTUAL       | Bilgiyi bul      |
| COMPREHENSION | Metni anla       |

Skill globaldir; tenantId, status ve Level/Topic/Unit relation'ı yoktur. `code` unique'tir. Canlı 7 Skill kaydının tamamı E2E/UX fixture niteliğindedir. Yeni `STRUCTURE` veya `CRITICAL_READING` gibi skill'ler bu aşamada eklenmedi.

## 6. Topic

Durum: PASS

Kalıcı Topic modeli, relation'ı veya endpoint'i yoktur. Topic'in pedagojik olarak gerekli olduğu kararı verilmiştir; çünkü content discovery, topic reporting, authoring filtreleri ve domain tercihi için Skill tek başına yeterli değildir.

Topic, “metin hangi alana/bağlama ait?” sorusunu cevaplar. `Bilim`, `Teknoloji`, `Tarih`, `Doğa ve çevre`, `Toplum`, `Kültür`, `Sanat`, `Spor ve iyi yaşam`, `Günlük yaşam`, `Kariyer` gibi değerler aday vocabulary'dir; production seed değildir.

## 7. Unit

Durum: PASS

Unit/Bölüm tanımı: belirli grade bandında sıralı bir öğrenme amacını ve bu amaca hizmet eden skill/practice grubunu taşıyan curriculum section.

Unit Topic değildir, Skill değildir, Content değildir ve öğrenciye gösterilen tekil Lesson ile aynı şey değildir. Örnek: `8. Sınıf → Ana düşünce ve kanıtı izleme → Ana fikri bul + Detayları yakala + Çıkarım yap`.

Unit'in gerçek örnekleri, completion tanımı ve sıra contract'ı oluşmadan schema modeli eklenmeyecektir.

## 8. Content domain

Durum: PASS

Content Domain, Topic'in kontrollü vocabulary karşılığıdır. Domain content discovery ve bağlam filtresidir; educational skill değildir.

“Bilim” domain/topic'tir. “Çıkarım yapma” skill'dir. Bir Content birden fazla domain'e bağlanabilir; bu nedenle gelecekte tekil `topicId` varsayımı yerine many-to-many/alignment tasarımı değerlendirilmelidir.

## 9. Content

Durum: PASS

`Content` tenantId nullable global/tenant katalog kimliği, type, title, 0..1 difficulty, root status, unique currentVersionId, creator, timestamps ve soft-delete alanları taşır. `ContentSkill` ile Skill'e bağlanır; Question parent'ıdır.

Canlı database'de 11 non-deleted global published Content vardır. Content üzerinde grade, proficiency, Topic, Unit, locale ve estimated reading time first-class değildir.

## 10. Question

Durum: PASS

`Question`, Content'e required bağlıdır; position, QuestionType, optional tek `skillId`, root status, creator ve timestamps taşır. QuestionVersion prompt, type-specific JSON, explanation, hint, optional difficulty, publication ve immutable history sağlar.

Mevcut QuestionType değerleri `MULTIPLE_CHOICE`, `TRUE_FALSE`, `OPEN_ENDED`, `MATCHING`, `FILL_BLANK`'tır. Topic/Unit/grade/proficiency alignment yoktur. Canlı database'de 31 non-deleted published Question vardır.

## 11. Assessment

Durum: PASS

Assessment `PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK` tiplerini; optional `levelId`, JSON config, status, tenant ve creator alanlarını taşır. AssessmentResult optional resultLevel, score ve metrics taşır.

Template/templateVersion bağlantısı bugün JSON config/service validation içindedir; relational FK değildir. Skill/Topic/Unit outcome blueprint'i first-class değildir. `oku_plus_test` içinde non-deleted Assessment sayısı 0'dır; bu fixture yokluğudur, engine kapasitesi hakkında tamamlanmış curriculum iddiası değildir.

## 12. Learning Goal

Durum: PASS

`StudentProfile.learningGoal` nullable String'tir ve onboarding service yalnızca `SPEED`, `COMPREHENSION`, `EXAM`, `SELF_IMPROVEMENT` değerlerini kabul eder.

- `SPEED`: kısa/orta metin, süre ve fluency lens'i.
- `COMPREHENSION`: main idea/detail/inference/comprehension coverage lens'i.
- `EXAM`: generic `EXAM_PREPARATION` blueprint/assessment lens'i; LGS/TYT/AYT bu fazda modellenmez.
- `SELF_IMPROVEMENT`: dengeli skill coverage ve öğrencinin seçimi için lens.

Learning Goal bir Skill veya Topic değildir; bu aşamada yeni algorithm/weighting yazılmamıştır.

## 13. Versioning

Durum: PASS

ContentVersion, QuestionVersion ve ExerciseTemplateVersion version history ve published immutability sağlar. Taxonomy alignment değişikliği published ContentVersion/QuestionVersion mutation'ı olmamalıdır.

Mevcut ContentSkill ve Question.skillId root seviyesindedir; bu, mevcut filtreler için çalışsa da geçmiş Attempt raporlamasını güncel etiket mutasyonuna açık bırakabilir. Gelecek alignment version-aware veya effective-dated olmalıdır.

## 14. Publication

Durum: PASS

ContentVersion/QuestionVersion/TemplateVersion lifecycle'ı `DRAFT → REVIEW → PUBLISHED → ARCHIVED`'dır. Root Content/Question/Template status'larında REVIEW yoktur. Review status'ı gerçek review entity'si değildir.

Gelecekte publish öncesi grade, Unit objective, Skill outcome, Topic, difficulty, age-appropriateness ve accessibility rubric'i kontrol edilmelidir. Bu aşamada yeni publish gate eklenmedi.

## 15. Global curriculum

Durum: PASS

Manual RLS'ye göre Skill ve Level salt global katalogdur. Global Content/Template/Assessment `tenantId = NULL` ile temsil edilir ve global content tüm tenant'larca okunabilir; global yazma platform role ile sınırlıdır.

Öneri: standard grade definitions, system skills ve canonical content domains global tutulmalı; tenant'a kopyalanmamalıdır.

## 16. Personal curriculum

Durum: PASS

Bireysel kullanıcı global curriculum'u kullanmalı, personal tenant içine kopyalamamalıdır. Personal StudentProfile ve tenant+student+skill+period StudentProgress kişisel state'i taşır; global Content/Skill/Level/TemplateVersion tekrar kullanılabilir.

Learning Path bugün kişisel curriculum tree değil, global catalog + profile/level/progress + published template verisinden dinamik presentation üretir.

## 17. Organization curriculum

Durum: PASS

Kurum bugün tenant-scoped Content/ExerciseTemplate ve class/teacher/template tabanlı Assignment kullanabilir. Organization-specific Unit veya curriculum subset relation'ı yoktur.

İleride kurumun global Unit/Skill/Domain subset'i seçebilmesi, kendi sırası/görünürlüğünü taşıması ve tenant Content/Template/Assignment ile çalışması önerilir. Bu extension mevcut global taxonomy'yı mutasyona uğratmamalıdır.

## 18. Learning Path

Durum: PASS

Mevcut path `student-learning/service.ts` içinde Skill, StudentProgress, current Level, Today ve published TemplateVersion'ları birleştirir. Node tipi skill veya fallback template'tir; Topic/Unit/Content/Lesson node'u değildir.

8G-2'de path algoritması değiştirilmedi. Gelecek uyumlu görünüm: Grade context → Unit context → Skill outcome → optional Topic facet → content/template action. Mevcut completed/active/available/locked ve session idempotency davranışı korunmalıdır.

## 19. Authoring

Durum: PASS

Gelecek authoring seçim sırası: `Grade Level → Unit → Topic/Domain → Skill → Content → Question`.

Bu sıra yazara sınıf, müfredat bölümü, bağlam, öğrenme çıktısı, metin ve ölçme maddesi ilişkisini açıklar. Authoring UI yapılmadı; mevcut routes platform content guard ile sınırlıdır ve teacher self-service capability'si değildir.

## 20. Analytics

Durum: PASS

Mevcut StudentProgress skill performansını; Profile Level/AssessmentResult level progression'ı; session/attempt geçmişi content completion ve calibration için kısmi kanıtı sağlar.

Topic performance, Unit progression, explicit proficiency progression ve retention/review analytics'i için version-aware alignment ve review event'leri gereklidir. `StudentProgress.masteryScore` mevcut olsa da Unit/Topic mastery policy'si değildir.

## 21. Review

Durum: PASS

Kalıcı Review/ReviewRecord yoktur. `VersionStatus.REVIEW` yalnızca yayın yaşam döngüsü durumudur. Gelecek review konumu: draft version → pedagogical/content review → approval decision/evidence → published version.

ReviewRecord ileride reviewer, decision, reason, rubric version, timestamps ve rejection history taşımalıdır; 8G-2'de eklenmedi.

## 22. Mastery

Durum: PASS

Mevcut StudentProgress, skill + tenant + student + period read modelidir; `masteryScore` ve `algorithmVersion` alanları vardır. Bu, skill ölçümü için yüzeydir; grade/proficiency/Unit/Topic mastered outcome contract'ı değildir.

Gelecek mastery projection raw Attempt/session history'yi koruyarak skill evidence'i Unit hedeflerine bağlamalı ve topic exposure'ı skill mastery ile karıştırmamalıdır. Mastery engine yapılmadı.

## 23. Adaptive

Durum: PASS

Taxonomy gelecekte adaptive next action için uyumludur: learner Grade + Reading Proficiency, learning goal, Skill performance/history, Content difficulty ve Question difficulty ayrı sinyaller olarak kullanılabilir.

Adaptive engine bu aşamada yapılmadı. Grade, proficiency, content difficulty ve question difficulty tek değere indirgenmeyecektir.

## 24. Schema decision

Durum: PASS

Karar: **B — MINIMUM SCHEMA EXTENSION GEREKLİ; PLANLANDI, BU AŞAMADA UYGULANMADI.**

- A, mevcut Skill → Content → Question → Exercise → Progress çekirdeği için yeterlidir; hedef Unit/Topic curriculum deneyimi için yeterli değildir.
- C, mevcut versioned ve tenant-aware modeli korumak için gereksiz büyük refactor olur.
- B, eksik alignment'ı additive ve geriye uyumlu ekleyerek mevcut history/session/attempt akışını korur.

## 25. Migration decision

Durum: PASS

Migration uygulanmadı. Önce gerçek grade 5–12 örnekleri, Unit contract'ı, Skill outcome rubric'i, domain vocabulary'si ve review/alignment ADR'si kesinleşmelidir.

Gelecek migration için zorunlu kararlar: model/cardinality, indexes/unique, global vs tenant RLS, published immutability, deterministic backfill, historical reporting, API DTO, mobile path compatibility, rollback ve orphan prevention.

## 26. Documentation

Durum: PASS

Ana çıktı oluşturuldu: [CURRICULUM_TAXONOMY.md](D:/oku-plus/docs/CURRICULUM_TAXONOMY.md).

Doküman Level architecture, grade/proficiency ayrımı, mevcut skill mapping, Topic/domain, Unit tanımı, Content/Question/Assessment, Learning Goal, versioning, publication, global/personal/organization curriculum, Learning Path, authoring, analytics, review, mastery, adaptive ve future schema recommendation bölümlerini içerir.

## 27. Tests

Durum: PASS

Docs-only kapsamına uygun Markdown doğrulaması yapıldı:

- `npx prettier --check docs/CURRICULUM_ARCHITECTURE.md docs/STAGE_8G1_FINAL_REPORT.md docs/CURRICULUM_TAXONOMY.md docs/STAGE_8G2_FINAL_REPORT.md`: PASS.
- Final report 36 numbered section ve ayrı eğitimsel kalite/son karar bölümlerini içerir.
- Her rapor maddesi izin verilen durum etiketlerinden biriyle işaretlenmiştir.

## 28. Regression

Durum: ÇALIŞTIRILMADI

Kod veya schema değişikliği olmadığı için 8G-2'de browser regression script'leri yeniden çalıştırılmadı. Önceki faz sonuçları bu fazın regression kanıtı olarak kopyalanmadı.

## 29. npm test

Durum: ÇALIŞTIRILMADI

Kod/schema değişikliği olmadığı için `npm test` bu fazda çalıştırılmadı. Önceki sonuçlar bu raporda tekrar kanıt olarak kullanılmadı.

## 30. Quality gates

Durum: ÇALIŞTIRILMADI

`node --check public/app.js`, `npm run lint`, `npm run typecheck`, `npm run build` bu docs-only fazda yeniden çalıştırılmadı. Doküman kapsamı için Prettier Markdown check yapıldı.

## 31. Localhost

Durum: ÇALIŞTIRILMADI

Runtime/source/schema değişikliği yapılmadığından localhost health/browser smoke check bu fazda yeniden çalıştırılmadı.

## 32. Demo data

Durum: PASS

Canlı database sorguları read-only çalıştırıldı. 12 Level ve 7 Skill kaydının fixture/E2E karakteri, 11 global published Content, 31 non-deleted Question, 12 non-deleted Template ve 0 non-deleted Assessment sayıları doğrulandı. Demo/test tenant veya content üzerinde yazma/silme yapılmadı.

## 33. Cleanup

Durum: PASS

Cleanup yapılmadı; çünkü bu faz veri üretmedi ve kullanıcı talimatı test-tenant/test-content'e dokunmamayı, `TRUNCATE` kullanmamayı gerektiriyordu. Mevcut fixture/orphan kayıtları korunmuştur.

## 34. Changed files

Durum: PASS

Bu fazda eklenen documentation dosyaları:

- `D:/oku-plus/docs/CURRICULUM_TAXONOMY.md`
- `D:/oku-plus/docs/STAGE_8G2_FINAL_REPORT.md`

`prisma/schema.prisma`, migration, production source ve test source değiştirilmedi. Çalışma ağacının başlangıçta tamamen untracked olması nedeniyle phase scope bu iki yeni documentation dosyasıyla raporlanmıştır.

## 35. Known limitations

Durum: PASS

- Gerçek product Level/Skill seed'i yok; canlı katalog değerleri fixture/E2E'dir.
- Topic, Unit, Review ve reading proficiency first-class değildir.
- Assessment-to-template relational FK ve topic/unit analytics yoktur.
- Teacher authoring, review approval, mastery, adaptive ve spaced repetition engine'leri yoktur.
- Gerçek 5–12 curriculum examples, age-appropriate content rubric'i ve exam blueprint'i henüz onaylanmamıştır.
- Bu fazda fiziksel cihaz, ekran okuyucu, production CDN/media ve dış provider testleri yapılmamıştır.

## 36. Next recommended phase

Durum: PASS

Önerilen sonraki sıra:

1. Gerçek 5–12 grade/reading standard örneklerini ve yaşa uygun content rubric'ini onaylamak.
2. Skill outcome/question blueprint ve distractor/explanation/hint standardını tanımlamak.
3. Content Domain vocabulary ve Unit örnekleri/sıralamasını kesinleştirmek.
4. Review/approval ve version-aware taxonomy alignment ADR'sini hazırlamak.
5. Sonra additive CurriculumNode/Alignment schema, API ve Learning Path DTO planını ayrı fazda uygulamak.

## EĞİTİMSEL KALİTE

Durum: PASS

Taxonomy grade/proficiency ayrımını net tutar, Skill ile Topic/domain'i ayırır, 13–17 yaş grubuna uygun dengeli dil hedefler, generic exam preparation'ı destekler, bireysel + kurum kullanımını korur ve gelecekte review/mastery/adaptive katmanlarına genişleyebilir.

## SON KARAR

Durum: PASS

**AŞAMA 8G-2 TAMAMLANDI — SCHEMA EXTENSION PLANNED**

Taxonomy architecture dokümante edildi ve sonraki içerik/kalite aşaması için güvenli contract hazırlandı. Büyük refactor veya bu aşamada migration blocker'ı yoktur; schema extension gerçek curriculum örnekleri onaylandıktan sonra uygulanmalıdır.
