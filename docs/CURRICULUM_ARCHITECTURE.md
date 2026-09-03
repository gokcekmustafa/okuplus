# Oku+ Curriculum Architecture Foundation

Tarih: 2026-09-01  
Kapsam: AŞAMA 8G-1 — mevcut repository ve PostgreSQL schema'sına dayalı curriculum architecture specification  
Karar: Bu aşamada schema, migration ve uygulama kodu değiştirilmez.

## 1. Karar özeti

Oku+'nın bugün gerçek olarak desteklediği pedagojik/teknik omurga:

Level/profile
→ Skill
→ Content
→ ContentVersion
→ Question
→ QuestionVersion
→ ExerciseTemplate
→ ExerciseTemplateVersion
→ ExerciseSession
→ Attempt
→ StudentProgress
→ Assessment / AssessmentResult

Bu zincir çalışır bir öğrenme ve ölçme çekirdeğidir. Ancak kalıcı curriculum node'ları yoktur. Topic, Unit/Section, Review ve Mastery ayrı modeller olarak mevcut değildir. 8G-1'in doğru çıktısı yeni tablo eklemek değil, sonraki içerik üretimi için bu sınırları netleştirmektir.

## 2. Gerçek model haritası

| Kavram                  | Gerçek model            | Mevcut alanlar                                                                                                                                    | Eksik alanlar                                                                                    | İlişkiler                                                                           |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Level                   | Level                   | code, name, minScore, maxScore, gradeBand, difficultyMin, difficultyMax, displayOrder                                                             | locale, age band, direct skill alignment, curriculum order beyond displayOrder                   | StudentProfile current/target level; Assessment.level; AssessmentResult.resultLevel |
| Skill                   | Skill                   | code, name, category, description, displayOrder                                                                                                   | level relation, prerequisite, mastery policy, locale, topic/unit relation                        | ContentSkill, Question.skill, ExerciseTemplate.skill, StudentProgress.skill         |
| Topic                   | EKSİK                   | Yok                                                                                                                                               | Model, code, parent/ordering, content alignment, API/UI                                          | Yok                                                                                 |
| Content                 | Content                 | tenantId nullable, type, title, difficulty, status, currentVersionId, createdById, timestamps, deletedAt                                          | grade/age, reading level, estimated time, locale, topic/unit, content source, authoring metadata | ContentVersion, Question, ContentSkill, ExerciseTemplate.content                    |
| ContentVersion          | ContentVersion          | contentId, version, title, body, wordCount, readabilityScore nullable, license, changelog, status, publishedAt, createdById                       | locale/translation, reading-level method/version, review decision/actor, structured metadata     | Parent Content; template content join; session snapshot join                        |
| Question                | Question                | contentId, position, type, skillId nullable, status, createdById, timestamps, deletedAt                                                           | topic/unit alignment, rubric policy/version, analytics blueprint id                              | Content; Skill; QuestionVersion; Attempt; template question join                    |
| QuestionVersion         | QuestionVersion         | questionId, version, prompt, options, correctAnswer, explanation, hint, difficulty, status, publishedAt, partialCreditEnabled, generationMetadata | locale, rubric/versioned scoring policy, standard alignment, provenance/safety fields            | Question; template question join; Attempt; QuestionVersionMedia                     |
| Exercise                | EKSİK                   | Ayrı Exercise modeli yok                                                                                                                          | Lesson/practice aggregate, learning objective, review policy                                     | Session doğrudan TemplateVersion'a bağlanıyor                                       |
| ExerciseTemplate        | ExerciseTemplate        | tenantId nullable, title, type, skillId nullable, config, status, createdById, optional contentId, timestamps, deletedAt                          | curriculum node, objective, estimated duration, sequencing policy, review policy                 | Skill, optional Content, TemplateVersion, Assignment                                |
| ExerciseTemplateVersion | ExerciseTemplateVersion | templateId, version, status, publishedAt, createdById, timestamps                                                                                 | objective/version metadata, scoring/review policy                                                | Published ContentVersion and QuestionVersion join; ExerciseSession                  |
| Assessment              | Assessment              | tenantId nullable, title, type, levelId nullable, config JSON, status, createdById, timestamps, deletedAt                                         | direct FK to template/version, curriculum node, blueprint version, result policy                 | Level; ExerciseSession; AssessmentResult; template reference is JSON                |
| Review                  | EKSİK                   | Yok                                                                                                                                               | review item, dueAt, interval, response history, scheduling policy                                | Yok                                                                                 |

### 2.1 Şema constraints ve indeksler

- Global identifiers: Skill.code ve Level.code unique.
- Version uniqueness: ContentVersion(contentId, version), QuestionVersion(questionId, version), ExerciseTemplateVersion(templateId, version).
- Published pointer: Content.currentVersionId unique.
- Runtime idempotency: ExerciseSession(studentId, clientSessionId) ve Attempt(sessionId, clientAttemptId) unique.
- Content/question order: position conflictleri service katmanında kontrol ediliyor; Question için DB seviyesinde contentId + position unique constraint yok.
- Template composition: version-to-content ve version-to-question birleşik anahtarları var.
- Tenant integrity: manual SQL içinde RLS, global katalog policy'leri, published immutability trigger'ları ve template tenant compatibility trigger'ları bulunuyor.
- Assessment.config.templateId ve templateVersionId JSON içinde tutuluyor; bunlar Assessment üzerinde relational FK değil.
- QuestionGenerationJob.templateId ve contentVersionId alanları String olarak var, fakat schema relation/FK olarak tanımlı değil.

## 3. Desteklenen minimum hiyerarşi

Persisted curriculum hierarchy olarak güvenle söylenebilecek minimum zincir:

Skill
→ Content
→ ContentVersion
→ Question
→ QuestionVersion
→ ExerciseTemplateVersion
→ ExerciseSession
→ Attempt
→ StudentProgress

Level bu zincire doğrudan parent değildir. Level, StudentProfile.currentLevelId/targetLevelId ve Assessment/AssessmentResult üzerinden ayrı bir learner/measurement anchor'ıdır. Skill ile Level arasında gerçek relation yoktur.

Template, içerik ve soruların çalıştırılabilir paketidir. TemplateVersion, published ContentVersion ve QuestionVersion kayıtlarını position ile birleştirir. Bu nedenle uygulama akışındaki lesson benzeri birim bugün kalıcı Lesson değil, TemplateVersion'dır.

## 4. Skill taxonomy ve Level

Schema'nın gerçek SkillCategory enum değerleri:

| Enum          | Öğrenciye gösterilebilecek Türkçe karşılık |
| ------------- | ------------------------------------------ |
| MAIN_IDEA     | Ana fikri bul                              |
| DETAIL        | Detayları yakala                           |
| INFERENCE     | Çıkarım yap                                |
| VOCABULARY    | Kelimeleri keşfet                          |
| FACTUAL       | Bilgiyi bul                                |
| COMPREHENSION | Anlama becerisi                            |

Bu karşılıklar UI label önerisidir; yeni taxonomy değildir.

Canlı test DB'sindeki Skill kayıtları yalnızca E2E/UX fixture niteliğindedir. Üretim curriculum'ı için gerçek Skill kataloğu henüz seed edilmemiştir. Bu aşamada yeni skill, seviye veya pedagojik kategori uydurulmamıştır.

Level schema'sı score range ve difficulty range taşır; gradeBand serbest metindir. Level → Skill relation yoktur. Canlı DB'deki level kayıtları da E2E/fixture isimleri taşımaktadır.

## 5. Content ve ContentVersion

Öğrencinin okuyacağı metin ContentVersion.body içinde tutulur. Content, katalog kimliği ve yayınlanan sürüm pointer'ıdır.

Mevcut ContentType değerleri:

- PASSAGE
- STORY
- POEM
- ARTICLE
- DIALOGUE

Content üzerinde title, difficulty, type ve root status bulunur. ContentVersion üzerinde sürümlü title/body, wordCount, opsiyonel readabilityScore, license ve changelog bulunur. wordCount servis tarafından body'den hesaplanır.

ContentVersion workflow'u:

Draft
→ Review
→ Published
→ Archived

Content root status'ı DRAFT/PUBLISHED/ARCHIVED'dır; REVIEW version seviyesindedir. Published ContentVersion manual SQL trigger ve service kuralı ile immutable'dır. Publish, currentVersionId ve root status'ı aynı transaction'da günceller.

## 6. Question blueprint

Question türleri:

- MULTIPLE_CHOICE
- TRUE_FALSE
- OPEN_ENDED
- MATCHING
- FILL_BLANK

Mevcut blueprint kapasitesi:

- prompt, options ve type
- type-specific correctAnswer JSON
- explanation
- hint
- difficulty
- partialCreditEnabled
- response position
- Question.skillId ve Content parent
- QuestionVersionMedia üzerinden media role/position
- generationMetadata JSON

Mevcut scoring davranışında multiple choice, true/false, matching ve fill blank deterministik puanlanır. OPEN_ENDED manual evaluation bekler; mevcut schema'da rubric JSON alanı correctAnswer içinde mümkün olsa da ayrı değerlendirici workflow'u yoktur.

Distractor ayrı model değildir; options JSON içindeki option alanlarıyla temsil edilir. Points ayrı soru alanı değildir; rawScore/feedback Attempt üzerinde tutulur. Generation metadata vardır, fakat üretim pipeline'ı yoktur.

## 7. Exercise ve Assessment

ExerciseTemplate type değerleri COMPREHENSION, FLUENCY, INFERENCE, VOCABULARY ve MIXED'dir. Template config JSON taşır; TemplateVersion kompozisyonu ContentVersion ve QuestionVersion join tablolarıyla position sırasına bağlar. Yalnız published içerik/soru sürümleri published template version'a bağlanabilir.

ExerciseSession:

- öğrenci, tenant, templateVersion ve opsiyonel assignment/assessment bağlarını taşır;
- INDIVIDUAL, ASSIGNMENT veya ASSESSMENT context kullanır;
- PRACTICE veya ASSESSMENT session type kullanır;
- IN_PROGRESS/COMPLETED/ABANDONED/EXPIRED durumlarına sahiptir;
- clientSessionId ile offline idempotency hedefler;
- tamamlanınca Attempt ve progress/gamification akışlarına kaynak olur.

Assessment type değerleri PLACEMENT, DIAGNOSTIC ve BENCHMARK'tır. Assessment doğrudan yalnızca optional Level relation taşır. Template/template version bağlantısı config JSON ile service tarafından doğrulanır; relational FK yoktur. AssessmentResult öğrenci, tenant, assessment, optional resultLevel, score ve metrics taşır; sessionId veya unique completion key taşımaz.

## 8. Multi-tenant, ownership ve publication

Content, ExerciseTemplate, Assessment ve QuestionMedia için tenantId nullable'dır:

- tenantId = NULL: global catalog;
- tenantId dolu: ilgili tenant'a ait katalog;
- Question ve QuestionVersion tenantId taşımaz; kapsam Content → Question zincirinden türetilir;
- TemplateVersion içeriği/sorusu global olabilir veya template tenant'ıyla uyumlu aynı tenant'a ait olabilir;
- RLS manual SQL global read ve tenant restriction policy'leri tanımlar;
- platform roles global katalog yazma kapısıdır.

Platform-owned content, tenantId NULL ve platform creator/role üzerinden desteklenir. Organization-owned content, tenantId dolu kayıtlarla desteklenir. Teacher-created ayrımı createdById ile kayıt düzeyinde mümkündür, ancak mevcut content/template routes platformContent guard kullandığı için self-service teacher authoring gerçek bir capability değildir.

Content, Question ve Template sürümlerinde review/publish uçları vardır. Ancak approval actor, ayrı review decision, rejection reason ve content approval queue modeli yoktur.

## 9. Pedagogical architecture

Teknik katman:

- catalog: Level, Skill, Content, ContentVersion
- item bank: Question, QuestionVersion, QuestionVersionMedia
- practice packaging: ExerciseTemplate, ExerciseTemplateVersion
- runtime: ExerciseSession, Attempt
- projection/measurement: StudentProgress, Assessment, AssessmentResult
- engagement: PointEvent, StudentStreak, StudentBadge

Pedagojik katman:

- goal: StudentProfile.learningGoal
- skill: Skill
- reading: ContentVersion
- practice: TemplateVersion + Session
- feedback: Attempt.feedback, explanation, hint, rawScore
- mastery: StudentProgress.masteryScore alanı var, fakat hesaplama/algoritma yok
- review: EKSİK
- assessment: Assessment + AssessmentResult, completion orchestration sınırlı

Bu ayrım önemlidir: teknik modelin varlığı, pedagojik politika veya curriculum progression'ın uygulandığı anlamına gelmez.

## 10. Content quality ve metadata gap

| Metadata               | Bugün                                              | Karar                                  |
| ---------------------- | -------------------------------------------------- | -------------------------------------- |
| title/body/type        | Var                                                | Korunur                                |
| difficulty             | Content'te var; QuestionVersion'da opsiyonel       | Korunur, standardı belgelenir          |
| wordCount              | ContentVersion'da var, servis hesaplar             | Korunur                                |
| readabilityScore       | Opsiyonel alan var, üretim hesabı yok              | 8G-2/3 standardına bırakılır           |
| grade/age band         | Level.gradeBand var; Content'e bağlı değil         | Sonraki schema ADR                     |
| reading level          | Yok; readabilityScore aynı şey değil               | Sonraki aşama                          |
| estimated reading time | Yok                                                | Sonraki aşama                          |
| question count         | Join count ile hesaplanabilir; Content alanı değil | Denormalize etme, gerekirse projection |
| topic/unit             | Yok                                                | Topic/Unit kararından sonra            |
| locale/translation     | Yok                                                | İçerik çoğalmadan önce                 |
| source/license         | ContentVersion.license var                         | Provenance policy eklenebilir          |

Content metadata is not to be solved with an unbounded JSON field without a contract. 8G-2/3 önce metadata standardını ve validation rules'ı belirlemelidir.

## 11. Future architecture

Unit → Skill → Lesson/Content → Practice → Feedback → Review → Mastery

Oku+'da bugün:

- Skill var;
- Content/ContentVersion var;
- Practice için TemplateVersion + ExerciseSession var;
- Feedback var;
- Assessment var;
- XP/streak/path var.

Bugün eksik:

- Unit/Section;
- Topic;
- explicit Lesson;
- Review scheduling;
- mastery calculation and evidence;
- adaptive difficulty;
- reliable curriculum progression;
- production teacher authoring/approval.

Learning Path bugün persistent curriculum graph değildir. student-learning/service.ts, global Skill listesini, StudentProgress'ı, learner level'ını ve published template versions'ı birleştirerek presentation nodes üretir. Skill node veya fallback Template node kullanır; Topic, Content ve Unit node üretmez.

## 12. AI ve media sınırı

QuestionGenerationJob müfredatta blueprint/template/content girdisinden QuestionVersion üretim kuyruğuna konumlanabilir. Bugün modelde prompt, parameters, status, result, tenantId ve creator vardır; worker, provider adapter, safety review, provenance, cost, retry ve API/UI yoktur. AI generation bu aşamada yapılmayacaktır.

QuestionMedia yeniden kullanılabilir merkezi media metadata modelidir. IMAGE/AUDIO/VIDEO/DOCUMENT, URL, mime, dimensions, duration, altText, caption, hash ve sizeBytes taşır. QuestionVersionMedia ile soru sürümüne bağlanır. Content/ContentVersion ile doğrudan media relation yoktur. URL kaydı upload, scanning, transcode veya CDN pipeline değildir.

## 13. Önceliklendirme

### ŞİMDİ

- Mevcut SkillCategory ve Level kullanımını ürün sözlüğü olarak sabitlemek.
- 8G-2/8G-3 için content, reading ve question quality standardını dokümante etmek.
- Mevcut hint, explanation, difficulty, wordCount ve question type alanlarını standart bir blueprint olarak kullanmak.
- ContentVersion review/publish akışını gerçek approval sorumluluğu ve audit beklentileriyle tanımlamak.
- Yeni içerik üretimine başlamadan önce gerçek global Skill/Level seed planını hazırlamak.

### SONRA

- Topic ve Unit/Section model kararını, gerçek curriculum tree kesinleşince additive migration olarak tasarlamak.
- Content metadata: age/grade/reading level/estimated time/locale/provenance.
- Explicit lesson/curriculum node relation.
- Review queue, review evidence ve approval actor.
- Mastery projection ve reliable algorithm versioning.
- Teacher authoring için scoped role/policy.
- Content/media relation ve content-level audio/illustration.

### DAHA SONRA

- Adaptive difficulty ve recommendation policy.
- Production AI generation, evaluation, safety ve human review.
- Upload/scan/transcode/CDN media pipeline.
- Spaced repetition engine ve notification scheduling.

Bu sınıflandırmada Topic veya Unit'in önemli olduğu kabul edilir; ancak ihtiyaç kabulü, schema'yı hemen değiştirme yetkisi değildir.

## 14. Schema recommendation

8G-1'de öneri: 0 schema değişikliği, 0 migration.

İleride gerçek curriculum gereksinimi kesinleşince değerlendirilmesi gereken additive parçalar:

1. Curriculum node/Topic/Unit: code, title, description, parent/order, level alignment, visibility and ownership.
2. Content alignment: Content veya ContentVersion ile node relation, locale ve grade/age metadata.
3. Review record: target version, reviewer, decision, reason, timestamps.
4. Mastery evidence/projection: student, skill/node, algorithm version, evidence window and computed state.
5. Assessment binding: config JSON yerine validated template/version relation ve result session traceability.
6. AI provenance: job/input/output/version/safety/cost references with real foreign keys.

Migration etkisi: additive tablolar ve nullable/backfill stratejisi; published versions, attempts ve history rewrite edilmez. Mevcut global Content/Skill/Level/Template kayıtlarına deterministic backfill gerekir. API etkisi: mevcut endpoints korunur, yeni versioned curriculum endpoints eklenir. Mobile etkisi: path node DTO'ları additive genişletilir; offline session/attempt contracts mevcut client idempotency alanlarını korur.

## 15. Uygulama sınırı

Bu aşamada yapılan uygulama:

- bu specification dokümanı;
- final discovery/test raporu.

Yapılmayanlar:

- schema.prisma değişikliği;
- migration;
- Topic/Unit/Review modeli;
- yeni pedagojik enum;
- yüzlerce içerik/soru üretimi;
- AI provider veya generation pipeline;
- upload/media pipeline;
- Learning Path rewrite;
- temporary debug.

Sonraki aşamalar bu belgeyi contract olarak kullanmalı; schema kararı, gerçek curriculum örnekleri ve API/mobile etkisi birlikte incelenmeden alınmamalıdır.
