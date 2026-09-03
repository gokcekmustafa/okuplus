# OKU+ — AŞAMA 8G-1 FINAL RAPOR

Tarih: 2026-09-01  
Kapsam: Curriculum Architecture Foundation / repository discovery / final QA  
Karar: Bu aşamada schema, migration, production content ve Learning Path rewrite yapılmadı.

## 1. Repository discovery

Durum: PASS

- İlk kontroller çalıştırıldı: `git status --short` ve `git diff --name-only`.
- Başlangıç repository'sinde izlenen commit bulunmuyor; proje dosyaları untracked durumdaydı ve `git diff --name-only` boştu. Mevcut dosyalar korunmuştur.
- `prisma/schema.prisma`, migration/manual SQL dosyaları ve şu modüller incelendi: `contents`, `questions`, `templates`, `sessions`, `assessments`, `progress`, `student-learning`, `media`.
- İlgili route ve servis kontratları da incelendi; özellikle student Today, Learning Path, exercise/session, progress, assessment ve admin content/question/template akışları değerlendirildi.

## 2. Current schema

Durum: PASS

Şema geçerliliği ve migration durumu doğrulandı:

- `npx prisma validate`: PASS.
- `npx prisma migrate status`: 6 migration bulundu, database schema up to date.
- Canlı PostgreSQL: `oku_plus_test`, PostgreSQL 18.6.
- 93 foreign-key constraint'in tamamı validated; invalid constraint yok.
- `_prisma_migrations`: 6 applied, 0 rolled back, 0 unfinished.

Curriculum ile ilişkili ana zincir bugün şu modellerden oluşuyor:

`Skill → Content → ContentVersion → Question → QuestionVersion → ExerciseTemplateVersion → ExerciseSession → Attempt → StudentProgress`

`Level`, bu zincirin ebeveyni değildir; öğrenci seviyesi ve assessment sonucu için ölçüm/segmentasyon ankrajıdır.

## 3. Level

Durum: PASS

`Level` alanları: `code`, `name`, `minScore`, `maxScore`, nullable `gradeBand`, `difficultyMin`, `difficultyMax`, `displayOrder`, timestamps.

İlişkileri `StudentProfile.currentLevel/targetLevel`, `Assessment.level` ve `AssessmentResult.resultLevel` üzerindedir. Skill, Content veya Topic üzerinde doğrudan curriculum parent ilişkisi yoktur.

Canlı test database'inde 12 Level kaydı vardır; bunlar fixture/E2E odaklıdır. Bu kayıtlar gerçek ürün sınıf/seviye sözlüğü olarak kabul edilmemiştir.

## 4. Skill

Durum: PASS

`Skill` global, unique `code` ve `name`, `SkillCategory`, `description`, `displayOrder` ve timestamps taşır. Question, ContentSkill, StudentProgress ve ExerciseTemplate ile ilişkilidir.

Desteklenen kategori kümesi: `MAIN_IDEA`, `DETAIL`, `INFERENCE`, `VOCABULARY`, `FACTUAL`, `COMPREHENSION`.

Canlı database'de 7 Skill kaydı vardır; tümü test fixture niteliğinde görünmektedir. Kalıcı gerçek OKU+ skill taxonomy'si henüz seeded değildir. Bu nedenle bu aşama yeni pedagojik skill üretmemiştir.

## 5. Topic

Durum: PASS

Kalıcı `Topic` modeli, topic tablosu, topic relation'ı veya topic endpoint'i bulunamadı. `Topic` bugün desteklenen minimum hiyerarşinin parçası değildir.

Bu yokluk bilinçli bir scope kararı olarak belgelenmiştir: gerçek curriculum örnekleri ve 8G-2/8G-3 içerik standartları kesinleşmeden Topic/Unit şeması eklenmeyecektir.

## 6. Content

Durum: PASS

`Content`: `tenantId` nullable, `type`, `title`, `difficulty` (0..1), root `status`, `currentVersionId` unique, `createdById`, timestamps ve `deletedAt` taşır. `ContentType`: `PASSAGE`, `STORY`, `POEM`, `ARTICLE`, `DIALOGUE`.

Content global olabilir (`tenantId = NULL`) ve ContentVersion, Question, ContentSkill ile ilişkilidir. Ayrıca template-content relation'ı vardır.

Canlı database'de 11 non-deleted published global passage doğrulandı. Bu sayı curriculum'un tamamlandığını değil, engine'in mevcut fixture kapasitesini gösterir.

## 7. ContentVersion

Durum: PASS

`ContentVersion`: `contentId`, content başına unique `version`, `title`, `body`, `wordCount`, nullable `readabilityScore`, `license`, `changelog`, `VersionStatus`, `publishedAt`, `createdById`, `createdAt`.

Version status akışı `DRAFT → REVIEW → PUBLISHED → ARCHIVED` olarak tasarlanmıştır. Published version immutability ve current-version ilişkisi manual SQL ile korunur. Canlı database'de 11 published ContentVersion vardır.

## 8. Question

Durum: PASS

`Question`: required `contentId`, `position`, `QuestionType`, nullable `skillId`, root `status`, `createdById`, timestamps ve `deletedAt` taşır. Question tenant scope'u Content üzerinden miras alır.

Canlı database'de 31 non-deleted published Question vardır; dağılım 5 multiple-choice, 11 true/false, 5 open-ended, 5 matching ve 5 fill-in-the-blank şeklindedir.

Position uniqueness bugün service validation ile kontrol edilir; ayrıca tüm iş kuralları database unique constraint'i değildir.

## 9. QuestionVersion

Durum: PASS

`QuestionVersion`: `questionId`, version, `prompt`, JSON `options`, JSON `correctAnswer`, `explanation`, `hint`, nullable `difficulty`, `VersionStatus`, `publishedAt`, `partialCreditEnabled` ve JSON `generationMetadata` taşır.

Question media ve template join'leri version seviyesindedir. Published QuestionVersion'ların tamamı published root question'larla uyumludur; canlı database'de 31 published QuestionVersion doğrulandı.

## 10. ExerciseTemplate

Durum: PASS

`ExerciseTemplate`: nullable `tenantId`, `title`, `ExerciseTemplateType`, JSON `config`, root `status`, `createdById`, timestamps ve optional direct `contentId` taşır. `skillId`, versions ve assignment ilişkileri bulunur.

`ExerciseTemplateType`: `COMPREHENSION`, `FLUENCY`, `INFERENCE`, `VOCABULARY`, `MIXED`.

Canlı database'de 12 non-deleted published comprehension template vardır.

## 11. ExerciseTemplateVersion

Durum: PASS

`ExerciseTemplateVersion`: template/version/status/publishedAt/createdById ve position tabanlı ContentVersion/QuestionVersion join'leri taşır. Published template version, exercise session'ın çalıştırılabilir snapshot kaynağıdır.

Publish öncesi content/question/version uyumluluğu service ve tenant compatibility trigger'larıyla doğrulanır. Published template version'ı olmayan published template bulunmadı.

## 12. Assessment

Durum: PASS

`Assessment`: nullable `tenantId`, `title`, `AssessmentType` (`PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK`), nullable `levelId`, JSON `config`, status, creator ve session/result ilişkileri taşır.

Assessment config içinde `templateId`, `templateVersionId` ve `questionCount` runtime alanları kullanılmaktadır; template version için doğrudan relational FK yoktur. Assessment status akışında `DRAFT → PUBLISHED → ARCHIVED` vardır; ayrı bir review workflow'u yoktur.

Canlı database'de non-deleted Assessment sayısı 0'dır. Bu, assessment engine'inin yokluğu değil, mevcut test database'inde kalıcı assessment fixture'ı bulunmadığı anlamına gelir.

## 13. Review

Durum: PASS

Kalıcı `Review` modeli veya review queue bulunmuyor. `REVIEW` yalnızca version status enum değeridir; reviewer, karar, gerekçe, audit trail ve approval SLA'sı için ayrı domain kaydı değildir.

Bu ayrım kritik bir mimari bulgudur: ContentVersion/QuestionVersion review status'ı, gerçek pedagojik/editoryal review sistemi olarak raporlanmamıştır.

## 14. Pedagogical architecture

Durum: PASS

Bugünkü pedagojik minimum, skill hedefli published content/question blueprint'lerinin published exercise template version içinde sıralanması ve session/attempt kanıtının StudentProgress read modeline akmasıdır.

Teknik akış:

`published template version → exercise session → idempotent attempt → score/feedback → progress aggregation → Learning Path presentation`

Bugün persistent curriculum graph, explicit lesson progression, topic mastery veya review scheduling yoktur. Learning Path dinamik olarak Skill, Level, Today, StudentProgress ve published template version'ları birleştirir.

## 15. Content metadata

Durum: PASS

Mevcut yararlı metadata: content type, title/body, difficulty, word count, optional readability score, license, changelog, question hint/explanation, question difficulty, partial credit, media alt text/caption ve template config.

Henüz first-class olmayan önemli alanlar: locale, age/grade band, CEFR/reading standard, estimated reading time, author/editor provenance, pedagogical objective, prerequisite, accessibility validation ve explicit content quality rubric.

Bu eksikler belgelenmiştir; bu aşamada gerçek production content veya rastgele metadata üretilmemiştir.

## 16. Versioning

Durum: PASS

Content, Question ve ExerciseTemplate root/version ayrımıyla versioned çalışır. Session, template version ve content/question version snapshot ilişkileriyle tarihsel oynatmayı destekler. Attempt record'ları immutable davranış ve client idempotency alanlarıyla korunur.

Published version mutation manual SQL trigger ile engellenir. Yeni curriculum eklemeleri mevcut published attempts/history rewrite etmemelidir.

## 17. Publication

Durum: PASS

ContentVersion, QuestionVersion ve ExerciseTemplateVersion için draft/review/published/archived lifecycle vardır. Publish sırasında relation ve compatibility kontrolleri çalışır; published kök kaydın published version olmadan kalması için runtime ve integrity kontrolleri mevcuttur.

Assessment publish akışı vardır, fakat Assessment için ayrı review/approval entity'si yoktur.

## 18. Ownership

Durum: PASS

Global içerik `tenantId = NULL` ile, tenant-scoped içerik matching tenantId ile modellenir. `createdById` creator provenance sağlar. RLS, global read ve tenant read/write sınırlarını; platform rolü global write yetkisini yönetir.

Teacher self-service authoring için createdById mevcut olsa da, bugün tüm gerekli authoring/review/policy yüzeyi ürünleşmiş değildir.

## 19. Multi-tenant content

Durum: PASS

Content, ExerciseTemplate, Assessment ve QuestionMedia tenant scope taşır. Question ve version kayıtları parent scope veya version ilişkisi üzerinden korunur. Template-content/question compatibility trigger'ları cross-tenant bağlanmayı engeller.

Browser regression kapsamında personal/org ayrımı ve cross-user/cross-tenant izolasyon tekrar doğrulandı.

## 20. Media

Durum: PASS

`QuestionMedia` merkezi media metadata modelidir: IMAGE/AUDIO/VIDEO/DOCUMENT, URL, mime, dimensions, duration, altText, caption, hash ve sizeBytes. Bugünkü doğrudan relation `QuestionVersionMedia` üzerindedir.

ContentVersion'a doğrudan media relation, upload/scanning/transcode/CDN pipeline ve media lifecycle yoktur. Bu nedenle media capability'si var, ancak production media platformu değildir.

## 21. AI generation

Durum: PASS

`QuestionGenerationJob` prompt, parameters, status, result, tenantId ve creator alanlarıyla future generation queue için başlangıç noktasıdır. Template/contentVersion referansları bugün string alanlardır; worker, provider adapter, safety evaluation, provenance, cost, retry ve human review tamamlanmış değildir.

8G-1'de AI production veya bulk question/content generation çalıştırılmadı.

## 22. Learning Path relationship

Durum: PASS

`student-learning/service.ts` Learning Path'ı persistent curriculum tree'den değil; Skills, StudentProgress, current learner level, Today ve published template versions'tan dinamik üretir.

Node çıktısı skill veya fallback template node olabilir; completed/active/available/locked state, progress ve templateVersionId taşır. Topic, Unit, Content veya Lesson node'u üretmez. Bu nedenle Learning Path bugün curriculum graph değildir; mevcut exercise engine'in öğrenci sunum katmanıdır.

## 23. Duolingo learning structure

Durum: PASS

Duolingo benzeri ürünlerde görülen skill/path node → lesson/unit → practice/review → mastery/progression ayrımı, OKU+ için referans alınabilecek pedagojik bir karşılaştırma çerçevesidir; birebir kopyalama kararı değildir.

OKU+ bugün bunun yalnızca skill → template/session → attempt → progress kısmını teknik olarak taşır. Persistent unit/lesson graph, explicit review scheduling ve node-level mastery henüz yoktur. Bu fark mimari backlog'a yazılmıştır.

## 24. Missing components

Durum: PASS

Belirlenen eksikler:

- Topic / Unit / Section / Lesson veya genel CurriculumNode.
- Content-to-curriculum alignment ve explicit prerequisite/order.
- First-class locale, grade/age/reading standard, estimated time ve provenance metadata.
- ReviewRecord, reviewer decision, approval evidence ve audit-level workflow.
- Node/skill mastery evidence ve progression projection.
- Assessment-to-template relational binding ve result-to-session traceability.
- Teacher authoring policy ve scoped publication workflow.
- ContentVersion media relation ve media processing pipeline.
- AI job input/output provenance, safety/evaluation ve cost/retry modeli.

## 25. Priority: now

Durum: PASS

1. Mevcut SkillCategory ve Level sözlüğünü gerçek eğitim hedefleriyle tanımlamak.
2. 8G-2/8G-3 kapsamında reading/content/question quality standardı ve blueprint'i yazmak.
3. Hint, explanation, difficulty, wordCount ve mevcut question type'larını standardize etmek.
4. ContentVersion publish/review kararlarının gerçek sorumluluk ve audit beklentilerini tanımlamak.
5. Gerçek global Skill/Level seed planını production content'ten önce hazırlamak.

## 26. Priority: later

Durum: PASS

İlk sonraki mimari katman: gerçek curriculum tree kesinleştikten sonra additive Topic/Unit/CurriculumNode, content alignment, locale/grade/reading metadata, ReviewRecord, mastery evidence, teacher authoring ve content media relation.

## 27. Schema recommendation

Durum: PASS

8G-1 için öneri: **0 schema değişikliği, 0 migration**.

İleride değerlendirilmesi gereken additive yapılar: CurriculumNode/Topic/Unit, ContentAlignment/metadata, ReviewRecord, mastery evidence/projection, validated Assessment binding ve AI provenance. Published version, attempt ve history rewrite edilmemelidir; migration nullable/backfill stratejisiyle yapılmalıdır.

Bu karar mevcut engine'i korur ve gerçek curriculum örnekleri oluşmadan geri dönüşü zor bir hierarchy varsayımını şemaya kilitlemez.

## 28. Documentation

Durum: PASS

Ana mimari specification oluşturuldu: [CURRICULUM_ARCHITECTURE.md](D:/oku-plus/docs/CURRICULUM_ARCHITECTURE.md).

Specification; gerçek model map'ini, minimum hierarchy'yi, pedagojik/teknik ayrımı, metadata, versioning, publication, ownership, media, AI, Learning Path sınırını ve NOW/LATER/DAHA SONRA kararlarını içerir.

## 29. Tests

Durum: PASS

Final quality run sonucu: 29 test file passed, 587 test passed, 0 failed.

İlave schema doğrulamaları: Prisma validate PASS; migration status up to date PASS.

## 30. Regression

Durum: PASS

İstenen 7 browser regression script'inin tamamı ayrı ayrı çalıştırıldı ve tamamı PASS oldu:

- `browser-student-learning-test.ts`
- `browser-learning-path-test.ts`
- `browser-exercise-ux-test.ts`
- `browser-progress-gamification-ux-test.ts`
- `browser-assessment-assignment-ux-test.ts`
- `browser-onboarding-ux-test.ts`
- `browser-celebration-test.ts`

Özet: `total=7 | failed=0`.

Özellikle Learning Path refresh persistence, org context, exercise completion/score/progress, cross-user/cross-tenant isolation, assessment resume/result, mobile/desktop overflow, onboarding ve celebration/reconciliation akışları doğrulandı.

## 31. npm test

Durum: PASS

`npm test`: 29/29 test file ve 587/587 test PASS.

## 32. typecheck

Durum: PASS

`npm run typecheck`: PASS.

## 33. build

Durum: PASS

`npm run build`: PASS.

## 34. lint

Durum: PASS

`npm run lint`: PASS.

## 35. format

Durum: PASS

`npm run format:check`: PASS. Bu rapor ve architecture specification Prettier ile formatlandı.

## 36. localhost

Durum: PASS

Mevcut development server ve PostgreSQL instance çalışır durumda bırakıldı. Health kontrolleri `localhost`/`127.0.0.1` üzerinde başarılıdır; `/health` ve `/health/db` 200 dönmektedir.

## 37. Demo data

Durum: PASS

Demo tenant/account kontrolleri read-only çalıştırıldı; admin ve demo hesaplarının beklenen mevcut kayıtları doğrulandı. Demo/test tenant, migration veya production içerik üzerinde destructive işlem yapılmadı.

## 38. Cleanup

Durum: PASS

Bu aşamanın browser testleri kendi fixture cleanup akışlarını çalıştırdı; orphan kayıt kontrolleri 0 sonucunu verdi. Önceden var olan E2E/orphan fixture kayıtları kullanıcı talimatı gereği silinmedi. `TRUNCATE`, broad delete veya veri kaybı oluşturabilecek işlem yapılmadı.

## 39. Changed files

Durum: PASS

Bu aşamada eklenen dosyalar:

- `D:/oku-plus/docs/CURRICULUM_ARCHITECTURE.md`
- `D:/oku-plus/docs/STAGE_8G1_FINAL_REPORT.md`

`prisma/schema.prisma`, migration dosyaları, production source ve test source değiştirilmedi. Başlangıç repository'sinin tüm dosyalarının untracked olması nedeniyle git diff tek başına değişiklik envanteri değildir; phase scope dosyaları yukarıdaki iki documentation dosyasıdır.

## 40. Known limitations

Durum: PASS

Bu run'da gerçek fiziksel cihaz, ekran okuyucu, Edge/Firefox matrisi, OAuth provider, production CDN/media upload ve gerçek teacher authoring workflow'u çalıştırılmadı. Browser QA mevcut localhost Chromium akışlarıyla sınırlıdır.

Live taxonomy kayıtları da fixture-only'dir: 7 Skill ve 12 Level gerçek ürün curriculum seed'i değildir. Assessment canlı sayısı 0'dır. Bu sınırlamalar architecture specification ve sonraki faz önerilerine açıkça yazılmıştır.

## 41. Next recommended phase

Durum: PASS

Önerilen sıra:

1. **Aşama 8G-2:** Gerçek reading/content quality standardı, yaş/sınıf/okuma düzeyi, metadata sözlüğü ve örnek curriculum paketleri.
2. **Aşama 8G-3:** Question blueprint, distractor/explanation/hint rubric'i, assessment blueprint ve review/approval operasyonu.
3. Bu örnekler onaylandıktan sonra additive Topic/Unit/CurriculumNode ve alignment şeması için ayrı migration/API/mobile planı.

## CRITICAL KARAR

Durum: PASS

8G-1'de schema/migration eklemek doğru değildir. Topic, Unit ve Review domain'leri önemli adaylardır; ancak gerçek curriculum örnekleri, content quality standardı ve ownership/review politikası kesinleşmeden bunları kalıcı şemaya eklemek erken ve yüksek geri dönüş maliyetlidir.

Mevcut minimum eğitim zinciri yeterli şekilde belgelenmiş, çalışır engine regressions ile korunmuş ve yeni curriculum katmanlarının additive olması gerektiği karara bağlanmıştır.

## FINAL VERDICT

Durum: PASS

**AŞAMA 8G-1 TAMAMLANDI — ARCHITECTURE SPECIFICATION HAZIR**

Bloker yoktur. Sonraki uygulama, bu specification'ı contract kabul ederek 8G-2/8G-3 gerçek eğitim içeriği ve kalite standartlarını üretmeli; schema değişikliği ancak bu kararlar sonrasında yapılmalıdır.
