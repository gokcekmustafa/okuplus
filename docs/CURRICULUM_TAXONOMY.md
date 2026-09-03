# OKU+ Curriculum Taxonomy

Tarih: 2026-09-01  
Kapsam: AŞAMA 8G-2 — Level / Skill / Topic taxonomy  
Kaynaklar: `prisma/schema.prisma`, `docs/CURRICULUM_ARCHITECTURE.md`, `docs/STAGE_8G1_FINAL_REPORT.md`, ilgili servisler ve `oku_plus_test` canlı fixture verisi

## 1. Karar özeti

OKU+ için doğru pedagojik ayrım aşağıdaki gibidir:

```text
GRADE LEVEL
  → UNIT / CURRICULUM SECTION
    → SKILL / LEARNING OUTCOME
      → TOPIC / CONTENT DOMAIN
        → CONTENT / CONTENT VERSION
          → QUESTION / QUESTION VERSION
            → EXERCISE TEMPLATE VERSION
              → SESSION / ATTEMPT / PROGRESS
```

Bu oklar her zaman tekil sahiplik anlamına gelmez:

- Skill birden fazla Unit içinde tekrar kullanılabilir.
- Topic/Content Domain, Content için çoklu etiket/facet olabilir ve birden fazla Unit'te görülebilir.
- Content birden fazla Skill'e bağlanabilir; mevcut `ContentSkill` bunun teknik karşılığıdır.
- Question bugün tek bir optional `skillId` taşıyabilir; çoklu skill ölçümü için gelecekte version-aware alignment gerekir.
- Unit ve Topic bugün persisted model değildir.

8G-2 kararı: pedagojik taxonomy tanımlanmıştır; **schema extension gereklidir fakat bu aşamada uygulanmayacaktır**. Uygulanacak extension, gerçek curriculum örnekleri ve kalite rubric'i onaylandıktan sonra additive migration olarak tasarlanmalıdır.

## 2. Gerçek mevcut model ve kapsam sınırı

### 2.1 Level

Mevcut `Level` global katalog modelidir. Alanları:

- `id` — UUID primary key.
- `code` — unique.
- `name`.
- `minScore`, `maxScore`.
- nullable `gradeBand` — serbest metin; kontrollü grade enum'u değildir.
- `difficultyMin`, `difficultyMax`.
- `displayOrder`.
- `createdAt`.

Relations:

- `StudentProfile.currentLevel` ve `StudentProfile.targetLevel`.
- `Assessment.level`.
- `AssessmentResult.resultLevel`.

`Level` üzerinde `tenantId`, status enum'u, Skill relation'ı, Topic/Unit relation'ı veya reading proficiency alanı yoktur. `code` unique'tir; ayrıca schema'da Level için bir tenant unique/index modeli yoktur. Manual RLS, Level'i salt global katalog olarak okutur; yazma platform rolüyle sınırlıdır.

Canlı `oku_plus_test` verisi: 12 Level kaydı. İsim ve kodlar `5. Sınıf`, `5. Sınıf E2E`, `Seviye X`, `Başlangıç`, `Temel` gibi fixture/E2E değerleridir. Gerçek 5–12. sınıf ürün sözlüğü henüz seed edilmemiştir.

### 2.2 Skill

Mevcut `Skill` global katalog modelidir. Alanları:

- `id` — UUID primary key.
- `code` — unique.
- `name`.
- `category` — `SkillCategory` enum'u.
- nullable `description`.
- `displayOrder`.
- `createdAt`.

Relations:

- `Question.skill`.
- `ContentSkill` üzerinden Content.
- `StudentProgress.skill`.
- `ExerciseTemplate.skill`.

`Skill` üzerinde status enum'u, `tenantId`, Level relation'ı, prerequisite veya Topic/Unit relation'ı yoktur. Manual RLS, Skill'i salt global katalog olarak okutur ve platform role ile yazar.

Canlı `oku_plus_test` verisi: 7 kayıt. Kodların tamamı `LEARN_E2E_*` veya `EXUX_*`, adların tamamı `E2E Skill` veya `Ex UX` niteliğindedir. Bu değerler gerçek product taxonomy seed'i değildir.

### 2.3 Content ve Question

`Content` global (`tenantId = NULL`) veya tenant-scoped olabilir. `ContentSkill`, Content ile Skill arasında composite primary key'li many-to-many relation'dır. `ContentVersion` body, wordCount, optional readabilityScore, license, changelog ve version status taşır.

`Question`, Content'e required bağlıdır ve optional tek `skillId` taşır. `QuestionVersion` prompt, type-specific JSON, explanation, hint, optional difficulty ve published lifecycle taşır. Topic/domain veya Unit relation'ı yoktur.

Bu mevcut zincir şu anda teknik olarak çalışır:

`Skill → Content → ContentVersion → Question → QuestionVersion → TemplateVersion → Session → Attempt → StudentProgress`

Ancak bu zincir Unit sıralaması, Topic discovery'si veya learner proficiency ölçümü değildir.

## 3. Level architecture

### 3.1 Level'in pedagojik anlamı

OKU+ için `Level`, öncelikle **Grade Level / sınıf düzeyi** olmalıdır. Öğrencinin hangi okul müfredatı bandında çalışacağını ve hangi içerik beklentisinin uygun olduğunu ifade eder.

Level şunların yerine geçmemelidir:

- okuma becerisi/proficiency;
- tek bir içerik difficulty skoru;
- tek bir soru difficulty skoru;
- mastery;
- sınav puanı bandı;
- Topic veya Skill.

Mevcut `minScore/maxScore` ve `difficultyMin/difficultyMax` alanları vardır; fakat bunların ürün sözleşmesinde grade, proficiency, content difficulty veya question difficulty'den hangisini temsil ettiği net değildir. Bu alanlar net bir contract olmadan yeni pedagojik anlamla kullanılmamalıdır.

### 3.2 Grade Level hedef sözlüğü

OKU+ hedef kullanıcı aralığı ortaokul + lise olduğundan kavramsal grade kapsamı:

| Grade band | Öğrenci bağlamı |
| ---------- | --------------- |
| 5–8        | Ortaokul        |
| 9–12       | Lise            |

Ürün katalog hedefi 5, 6, 7, 8, 9, 10, 11 ve 12. sınıfın ayrı, sıralı grade definition olarak tanımlanmasıdır. Bu bir dokümantasyon kararıdır; bu aşamada Level seed'i veya schema enum'u eklenmemiştir.

`gradeBand` mevcutta nullable serbest metindir. Gerçek üretim seed'i yapılmadan önce kod formatı, Türkçe görünen ad, display order ve curriculum standardı birlikte kesinleştirilmelidir.

## 4. Grade vs reading proficiency

### 4.1 Ayrım

```text
Grade Level       = okul müfredatı ve yaşa yakın beklenti bandı
Reading Proficiency = öğrencinin metni bağımsız okuyup anlamlandırma kapasitesi
```

Örnek: 8. sınıfta okuyan bir öğrenci, çıkarım becerisi için gelişen; kelime anlamı ve açık detaylar için bağımsız proficiency düzeyinde olabilir. Tek bir `Level` bu profili doğru anlatamaz.

Mevcut schema:

- Grade için yalnızca `Level.gradeBand` serbest metin olarak vardır.
- StudentProfile, current/target Level FK'si taşır.
- Reading proficiency için first-class model veya alan yoktur.
- Content'teki `difficulty` ve QuestionVersion'daki `difficulty`, learner proficiency değildir.
- ContentVersion.readabilityScore varsa bile metnin okunabilirlik ölçümüdür; öğrencinin proficiency'si değildir.

### 4.2 Gelecek proficiency bandı

İleride age-appropriate bir band seti gerekirse, UI dili ve rubric önce tanımlanmalıdır. Örnek bir kavramsal set:

| Band      | Pedagojik sinyal                                          |
| --------- | --------------------------------------------------------- |
| Gelişen   | Açık bilgi, kısa metin, yoğun scaffold                    |
| Gelişiyor | Grade'e yakın metin, açık bilgi + basit çıkarım           |
| Bağımsız  | Çok paragraflı metin, kanıt ve çıkarım, az scaffold       |
| İleri     | Soyut/yoğun metin, yapı, karşılaştırma ve eleştirel yorum |

Bu bandlar yeni enum veya seed kararı değildir. Assessment/progress evidence ve gerçek rubrik olmadan schema'ya eklenmemelidir.

## 5. Skill taxonomy

### 5.1 Mevcut enum ve öğrenci dili

Mevcut `SkillCategory` değerleri yeni değer eklemeden şu şekilde gösterilebilir:

| Teknik değer    | Öğrenciye görünen öneri | Ölçülen öğrenme çıktısı                                             |
| --------------- | ----------------------- | ------------------------------------------------------------------- |
| `MAIN_IDEA`     | Ana fikri bul           | Metnin ana mesajını ve merkez düşüncesini belirler                  |
| `DETAIL`        | Detayları yakala        | Metindeki açık bilgi ve kanıtı bulur                                |
| `INFERENCE`     | Çıkarım yap             | Metinden desteklenen örtük sonucu çıkarır                           |
| `VOCABULARY`    | Kelime hazinesi         | Bağlama göre kelime anlamını ve kullanımını çözer                   |
| `FACTUAL`       | Bilgiyi bul             | Doğrudan verilebilen olguyu seçer/doğrular                          |
| `COMPREHENSION` | Metni anla              | Metnin genel anlamını kurar; üst kategori/şemsiye olarak kullanılır |

UI label'ı taxonomy değişikliği değildir. DB `code` ve enum değerleri korunur.

### 5.2 Mevcut SkillCategory ile template type ayrımı

`SkillCategory` öğrenme çıktısını; `ExerciseTemplateType` ise uygulama/practice paketinin tipini ifade eder. Örneğin `INFERENCE` template'i, yalnızca `INFERENCE` skill'i öğretebilir anlamına gelmez; aynı template birden fazla skill question'ı taşıyabilir. Bu iki enum birbirine dönüştürülmemelidir.

### 5.3 Henüz eklenmeyen skill adayları

`STRUCTURE`, `CRITICAL_READING`, `ARGUMENT`, `SYNTHESIS` gibi adaylar gelecekte pedagojik ihtiyaç doğarsa değerlendirilebilir. Bu aşamada schema'da olmadıkları için mevcut skill olarak raporlanmamış ve seed edilmemiştir.

## 6. Topic / content domain

### 6.1 Topic gerekli mi?

Evet, hedef ürünün discovery, reporting, authoring ve personalization ihtiyaçları için **kavramsal olarak gereklidir**. Fakat Topic, Skill'in yerine geçmez ve 8G-2'de hemen model eklemek için yeterli implementation gerekçesi değildir.

Topic'in doğru anlamı: **metnin/konunun içerik alanı veya bağlamı**.

Önerilen ilk domain adayları:

- Bilim
- Teknoloji
- Tarih
- Doğa ve çevre
- Toplum ve yurttaşlık
- Kültür
- Sanat
- Spor ve iyi yaşam
- Günlük yaşam
- Kariyer ve gelecek

Bu liste production seed'i değildir; kontrollü domain vocabulary'si için adaydır.

### 6.2 Topic ve Skill ayrımı

| Kavram         | Cevapladığı soru                  | Örnek                         |
| -------------- | --------------------------------- | ----------------------------- |
| Skill          | Öğrenci neyi öğreniyor/uyguluyor? | Çıkarım yapma                 |
| Topic / Domain | Metin hangi alana bağlanıyor?     | Bilim / iklim                 |
| Content        | Öğrenci hangi eseri okuyor?       | İklim değişikliğinin etkileri |
| Question       | Öğrenci hangi kanıtı gösteriyor?  | Neden ...?                    |

“Bilim” skill değildir. “Çıkarım yapma” topic değildir.

### 6.3 Topic relation biçimi

Topic, Content için tekil parent olmak zorunda değildir. Bir metin hem `Bilim` hem `Doğa ve çevre` domain'ine bağlanabilir. Bu nedenle gelecekteki relation many-to-many veya generic alignment olarak düşünülmeli; Content üzerinde tek bir `topicId` varsayılmamalıdır.

## 7. Unit definition

### 7.1 Net tanım

OKU+ için Unit/Bölüm: **belirli bir grade bandında, sıralı bir öğrenme amacını ve o amaca hizmet eden skill/practice grubunu taşıyan curriculum section'dır**.

Unit:

- Topic değildir; içerik alanı değil, öğretim organizasyonudur.
- Skill değildir; tek beceriye indirgenmez.
- Content değildir; metinlerin ve exercise'ların bağlamıdır.
- Lesson değildir; ileride öğrenciye gösterilen daha küçük çalışma oturumu olabilir.
- Level değildir; bir veya daha fazla grade level'a hizalanabilir.

### 7.2 Önerilen örnek

```text
8. Sınıf
└── Unit: Ana düşünce ve kanıtı izleme
    ├── Skill: Ana fikri bul
    ├── Skill: Detayları yakala
    ├── Skill: Çıkarım yap
    ├── Topic: Bilim / Doğa ve çevre
    ├── Content: İklim değişikliğinin etkileri
    └── Question: Neden ...? / Hangi kanıt ...?
```

“Metni anlama” gibi geniş ifadeler Unit adı olabilir; ancak Unit'in mutlaka ölçülebilir learning goal açıklaması, sırası ve içerik kapsamı bulunmalıdır. Unit yalnızca dekoratif başlık olmamalıdır.

### 7.3 A ve B karşılaştırması

| Ölçüt             | A: Level → Skill → Content                        | B: Level → Unit → Skill → Topic → Content                               |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Discovery         | Skill ve içerik bulunur, domain filtresi zayıftır | Öğrenci önce curriculum bölümünü, sonra beceri/domain'i görür           |
| Learning Path     | Bugünkü dinamik path'e yakındır                   | Sıralı ve açıklanabilir curriculum progression mümkündür                |
| Reporting         | Skill düzeyi raporlama yapılabilir                | Unit + skill + domain + grade kırılımı yapılabilir                      |
| Authoring         | İçerik doğrudan skill'e bağlanır                  | Yazar grade/Unit/skill/domain bağlamını görür                           |
| Adaptive learning | Skill performansı üzerinden sınırlı               | Unit hedefi + skill evidence + domain tercihi birlikte kullanılabilir   |
| Personalization   | Beceri bazlı öneri                                | Grade hedefi, unit ilerlemesi, skill ihtiyacı ve domain tercihi ayrılır |

OKU+ için uzun vadede B daha doğrudur. Ancak B'nin kalıcı ve güvenilir olması için Unit'in gerçek eğitim örnekleriyle doldurulmuş bir standardı olmalıdır. 8G-2'de bu nedenle model değil, anlam ve contract tanımlanmıştır.

## 8. Content domain

Content Domain, Topic'in kontrollü vocabulary karşılığıdır. Domain:

- öğrencinin metin keşfini kolaylaştırır;
- teacher authoring'de bağlam filtresi sağlar;
- topic performance gibi raporlara zemin hazırlar;
- skill performance ile karıştırılmaz;
- doğrudan mastery hedefi olmak zorunda değildir.

Bir domain'in pedagojik hedef olması gerekiyorsa bu hedef ayrıca Skill veya Unit learning goal olarak tanımlanmalıdır. Örneğin `Bilim` metin bağlamıdır; `kanıta dayalı çıkarım` skill/unit hedefidir.

## 9. Content relationship

### 9.1 Bugün

```text
Content (catalog identity)
  ├── ContentVersion (body + version + publication)
  ├── ContentSkill ↔ Skill
  ├── Question → Content
  └── ExerciseTemplate / TemplateVersion composition
```

Content üzerinde `difficulty` ve root status; ContentVersion üzerinde body, wordCount, optional readabilityScore, license, changelog ve immutable publish lifecycle vardır. Grade, proficiency, Topic, Unit, locale ve estimated reading time first-class değildir.

### 9.2 Hedefte

Content, Unit/Topic/Grade alignment'ı taşıyan okuma artefact'ı olmalıdır. Alignment'ın Content root'unda mı, ContentVersion'da mı, yoksa immutable alignment revision'ında mı tutulacağı sonraki schema ADR'sinde belirlenmelidir.

Pedagojik metadata published body'den bağımsız biçimde değiştiğinde tarihsel raporların bozulmaması için published ContentVersion'ın anlamı geriye dönük değiştirilmemelidir.

## 10. Question relationship

Question Content'e bağlıdır; QuestionVersion geçmişi korur. QuestionVersion prompt/options/correctAnswer/explanation/hint/difficulty ve scoring metadata taşır.

Bugünkü kısıtlar:

- Question'da yalnızca optional tek `skillId` vardır.
- Topic/Unit/grade alignment yoktur.
- `correctAnswer` JSON içinde rubric ihtimali vardır; ayrı review/scoring policy modeli yoktur.
- `QuestionVersion.difficulty` nullable'dır ve aralık/ölçüm sözleşmesi schema'da belirtilmemiştir.

Hedefte her question'ın:

1. hangi ContentVersion kanıtına,
2. hangi Skill öğrenme çıktısına,
3. hangi Unit hedefine,
4. hangi Topic/domain bağlamına,
5. hangi grade/proficiency uygunluğuna

hizalandığı açıklanabilir olmalıdır. Bu alignment, published QuestionVersion ve Attempt geçmişiyle uyumlu olacak şekilde version-aware tasarlanmalıdır.

## 11. Assessment relationship

Assessment, `levelId` ile Level'e bağlanabilir; `AssessmentResult.resultLevelId` sonucu taşıyabilir. `templateId` ve `templateVersionId` ise bugün JSON config içinde runtime/service contract olarak tutulur; relational FK değildir.

Assessment type'ları `PLACEMENT`, `DIAGNOSTIC`, `BENCHMARK`'tır. Bu model:

- grade/placement anchor'ını kısmen destekler;
- skill/topic/unit outcome blueprint'ini first-class desteklemez;
- result-to-session traceability'yi eksik bırakır;
- sınav türlerini LGS/TYT/AYT olarak doğrudan modellemez.

8G-2 kararı: `EXAM_PREPARATION` generic learning-goal lens'i curriculum'da kullanılabilir; gerçek sınav standardı sonraki fazda evidence ile ayrıştırılmalıdır.

## 12. Learning Goal

Onboarding'de `StudentProfile.learningGoal` nullable String'tir. Service allowlist'i dört değerdir:

| Teknik değer       | Curriculum etkisi                                                         | Etkilemediği şey                                  |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| `SPEED`            | Kısa/orta metin, süre ve fluency odaklı content/template seçimi için lens | Yeni skill veya difficulty algoritması tanımlamaz |
| `COMPREHENSION`    | Main idea, detail, inference ve genel comprehension coverage için öncelik | Topic değildir                                    |
| `EXAM`             | Generic `EXAM_PREPARATION` blueprint/assessment lens'i                    | LGS/TYT/AYT'yi bu aşamada modele gömmez           |
| `SELF_IMPROVEMENT` | Dengeli skill coverage ve öğrencinin seçtiği domain/goal deneyimi         | Mastery algoritması değildir                      |

Bu alan şu anda tek değerli bir tercih alanıdır; priority/multi-goal, unit goal veya skill weighting sözleşmesi yoktur. 8G-2 yalnızca bu lenslerin taxonomy'deki yerini tanımlar; yeni recommendation/adaptive algoritma yazmaz.

## 13. Versioning

Taxonomy'nin published content/question geçmişini bozmayacak temel kuralı:

```text
Taxonomy alignment değişikliği ≠ published ContentVersion/QuestionVersion mutation
```

Bugünkü `ContentSkill` Content root'una, `Question.skillId` Question root'una bağlıdır. Bu, güncel katalog filtreleri için yeterli olabilir; fakat geçmiş attempts'in hangi pedagojik hedefle ilişkilendirildiğini değiştirebilir.

Gelecek extension için öneri:

- published version'a alignment değişikliği gerekiyorsa yeni alignment revision veya version-aware mapping;
- eski ContentVersion/QuestionVersion için eski mapping'in korunması;
- taxonomy code/name değişikliklerinde immutable code ve display label history;
- archived curriculum node silmek yerine inactive/archived lifecycle;
- StudentProgress ve Attempt history rewrite edilmemesi.

Migration, published data rewrite değil additive relation/backfill olmalıdır. Bu öneri bu aşamada uygulanmamıştır.

## 14. Publication

ContentVersion, QuestionVersion ve ExerciseTemplateVersion lifecycle'ı `DRAFT → REVIEW → PUBLISHED → ARCHIVED` biçimindedir. Root Content/Question/Template status'larında `REVIEW` yoktur; Review domain'i ayrıca mevcut değildir.

Taxonomy açısından publish gate şu soruları ileride cevaplamalıdır:

- grade alignment var mı?
- Unit hedefiyle uyumlu mu?
- en az bir Skill learning outcome açık mı?
- Topic/domain doğru ve erişilebilir mi?
- content/question difficulty sözleşmeye uygun mu?
- age-appropriate ve accessibility rubric'i geçti mi?

Bu kontroller bugün yeni runtime kuralı olarak eklenmemiştir.

## 15. Global curriculum

Mevcut manual RLS davranışı:

- Skill ve Level salt global katalogdur; tüm uygulama okuyabilir, yazma platform rolüyledir.
- Global Content/Template/Assessment `tenantId = NULL` ile temsil edilir.
- Global ContentVersion/QuestionVersion kapsamı parent ilişkisinden türetilir.
- Global katalog kullanıcı tenant'larının tamamında okunabilir.

Bu nedenle önerilen default model global curriculum'dur: standard grade definitions, system skills ve canonical content domains global tutulur. Bireysel veya kurum tenant'larına aynı global taxonomy kopyalanmamalıdır.

## 16. Personal curriculum

Personal user için global curriculum kullanılmalı, personal tenant içine kopyalanmamalıdır.

Bugünkü kanıt:

- StudentProfile personal tenant içinde tutulur.
- Global Skill, Level, Content ve published TemplateVersion okunabilir.
- StudentProgress tenant + student + skill + period bazında ayrıdır.
- Learning Path, profile/level/progress/published template verisini dinamik birleştirir; kişisel curriculum tree saklamaz.

İleride kişiselleştirme, global curriculum kimliğini koruyup öğrenciye özel state/evidence/selection projection üretmelidir. Kopya katalog üretmek versioning, deduplication ve cross-tenant isolation riskini artırır.

## 17. Organization curriculum

Kurum bugün tenant-scoped Content, ExerciseTemplate ve Assignment kullanabilir; Assignment class/teacher/template ilişkisiyle dağıtım sağlar. Ancak organization-specific Unit/curriculum subset modeli yoktur.

İleride kurum:

- global Unit/Skill/Domain listesinden subset seçebilmeli;
- kendi sıralama ve görünürlük policy'sini ekleyebilmeli;
- tenant Content ve Template ile çalışabilmeli;
- global Content'i kopyalamadan Assignment ile öğrenciye sunabilmeli.

Yeni tenant curriculum node'ları eklenirse global/tenant policy ve parent isolation, mevcut Content/Template RLS pattern'i kadar açık yazılmalıdır. Tenant-specific assignment veya content relation'ı global taxonomy'nın kendisini mutasyona uğratmamalıdır.

## 18. Learning Path

Bugünkü Learning Path `student-learning/service.ts` içinde global Skill, StudentProgress, current Level, Today ve published TemplateVersion'ları birleştirerek dynamic node üretir. Node tipi skill veya fallback template'tir; Topic, Unit, Content ve Lesson node'u üretmez.

8G-2'de path algoritması değiştirilmez. Gelecek DTO uyumu:

```text
path node:
  grade context
  → unit context
    → skill outcome
      → optional topic facet
        → content/template action
```

Mevcut `completed/active/available/locked` durumları korunarak yeni curriculum context additive eklenmelidir. Mevcut session/attempt idempotency ve offline contract bozulmamalıdır.

## 19. Authoring

İleride içerik yazarı için seçim sırası anlaşılır olmalıdır:

```text
Grade Level → Unit → Topic/Domain → Skill → Content → Question
```

Bu sıra, yazarın “hangi sınıf için, hangi müfredat bölümünde, hangi bağlamda, hangi beceri sonucunu ölçüyorum?” sorularına cevap verir.

Authoring UI bu aşamada yapılmamıştır. Mevcut content routes platform content guard ile sınırlıdır; `createdById` provenance sağlasa da tam teacher self-service authoring/review capability'si değildir.

## 20. Analytics

Taxonomy şu analizleri mümkün kılmalıdır:

| Analiz              | Bugünkü destek                                                 | Gelecek ihtiyaç                                       |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Skill performance   | `StudentProgress.skillId` ile var                              | skill evidence/denominator contract'ı                 |
| Topic performance   | Yok                                                            | version-aware content/question-domain alignment       |
| Level progression   | Profile Level + AssessmentResult kısmen var                    | grade/proficiency/placement ayrımı                    |
| Content completion  | Session/content snapshot ile kısmen var                        | curriculum node completion projection                 |
| Question difficulty | QuestionVersion difficulty ve Attempt calibration alanları var | authoring difficulty ile calibrated difficulty ayrımı |
| Retention           | Ham session/attempt geçmişi var                                | review schedule ve retention event policy             |

Taxonomy graph kurulmadan topic/unit raporu üretmek mümkün değildir. Mevcut `masteryScore` skill read modelinde bulunsa da Unit/Topic mastery policy'si değildir.

## 21. Review

VersionStatus `REVIEW` olsa da kalıcı `Review` veya `ReviewRecord` modeli yoktur. Gelecek review konumu:

```text
draft version
  → pedagogical/content review
  → approval decision + evidence
  → published version
```

Review hedefleri ContentVersion, QuestionVersion ve TemplateVersion olabilir. Reviewer, decision, reason, timestamp, rubric version ve rejection history ayrı domain kaydı olmalıdır. Bu aşamada review workflow veya model eklenmemiştir.

## 22. Mastery

Mevcut `StudentProgress` skill + tenant + student + period window read modelidir; `masteryScore` ve `algorithmVersion` alanları vardır. Bu, taxonomy'nin skill boyutuna ölçüm yüzeyi sağlar, fakat mastered outcome contract'ı değildir.

Gelecek mastery projection:

- grade context ile öğrencinin curriculum bandını ayırmalı;
- skill evidence'i Unit goal'e bağlayabilmeli;
- topic exposure/performance'ı skill mastery ile karıştırmamalı;
- raw Attempt/session tarihçesini korumalı;
- algorithmVersion ile yeniden hesaplamayı izleyebilmelidir.

Mastery için yeni hesaplama motoru bu aşamada yapılmayacaktır.

## 23. Adaptive

Taxonomy gelecekte adaptive next action için uygundur çünkü üç ayrı sinyal kurulabilir:

1. Öğrenci bağlamı: Grade Level ve gelecekte Reading Proficiency.
2. Öğrenme hedefi: `learningGoal` lens'i.
3. Kanıt: Skill performance, history, Content difficulty ve Question difficulty.

Adaptive engine bugün yoktur. Grade, proficiency, content difficulty ve question difficulty tek bir sayıya indirgenmemelidir. Adaptive seçim, Unit progression ve Topic preference eklenince bu sinyalleri birlikte kullanabilir; bu aşama yalnızca uyumluluk analizidir.

## 24. Spaced repetition / future review placement

Review gelecekte iki şeyi ayırmalıdır:

- `VersionStatus.REVIEW`: editorial/pedagogical publication stage.
- spaced repetition review: öğrenci için `dueAt`, interval, evidence ve next review planı.

Spaced repetition evidence'i Skill + QuestionVersion + ContentVersion/Unit context üzerinden üretilebilir. Yeni Review modeli yoktur; 8G-2'de yalnızca mimari konumu tanımlanmıştır.

## 25. Schema decision

Karar: **B — MINIMUM SCHEMA EXTENSION GEREKLİ; PLANLANDI, BU AŞAMADA UYGULANMADI.**

Gerekçe:

- A, mevcut engine'in Skill → Content → Question → Exercise → Progress çekirdeği için yeterlidir; fakat hedef Level → Unit → Skill → Topic → Content → Question curriculum deneyimini temsil edemez.
- C, mevcut versioned/tenant-aware modele göre gereksiz büyük refactor olur.
- B, eksik curriculum alignment'ı additive ve geri uyumlu biçimde eklerken mevcut session/attempt/progress/history akışını korur.

### 25.1 Minimum future extension önerisi

İsimler örnektir; schema ADR'sinde kesinleştirilmelidir:

1. `CurriculumNode` veya ayrık Unit/Topic modelleri: code, title, description, kind, parent/order, status, grade alignment, visibility, ownership.
2. `CurriculumAlignment`: Content/ContentVersion ve Question/QuestionVersion ile node/skill/grade/proficiency alignment'ı.
3. Domain vocabulary için global canonical Content Domain ve tenant subset relation'ı.
4. ReviewRecord: version target, reviewer, decision, reason, rubric/version, timestamps.
5. Mastery evidence/projection: student, skill/node, algorithm version, evidence window.

Bu isimler mevcut schema'ya eklenmiş model değildir; yalnızca migration planı adaylarıdır.

## 26. Migration decision

Karar: **Migration uygulanmadı.**

Bu aşamada migration gerektiren implementation yoktur. İleride migration öncesi zorunlu inceleme:

- model ve relation cardinality;
- index ve unique strategy;
- global vs tenant RLS;
- published version immutability;
- ContentSkill/Question.skillId geçmiş uyumluluğu;
- deterministic backfill planı;
- API DTO/mobile path compatibility;
- rollback ve orphan prevention.

Beklenen risk: taxonomy alignment'ı root kayıtlara doğrudan eklemek historical reporting'i değiştirebilir. Bu nedenle version-aware veya effective-dated mapping değerlendirilmelidir.

## 27. 13–17 yaş ve eğitimsel kalite ilkeleri

Taxonomy şu ürün ilkelerine uymalıdır:

- Grade-based olmalı; reading proficiency ile karıştırılmamalı.
- Dil çocukça etiketlerden kaçınmalı, ancak gereksiz akademik jargon da kullanmamalı.
- Sınav hazırlığına uygun generic blueprint sunmalı; LGS/TYT/AYT'yi erken ve sert biçimde modele gömmemeli.
- Bireysel öğrenciye global curriculum ve kişisel progress state sunmalı.
- Kurum için global subset + tenant-owned addition desteğine açık olmalı.
- Topic/domain çeşitliliği sağlamalı, ancak domain'i skill veya mastery yerine kullanmamalı.
- Her Skill öğrenci açısından gözlenebilir bir learning outcome olarak yazılmalı.
- Unit küçük bir etiket değil, sıralı ve açıklanabilir müfredat bölümü olmalı.
- Content ve Question kalite/rubric kararları version geçmişini korumalı.

## 28. 8G-2 uygulama sınırı

Bu aşamada yapılan:

- gerçek Level/Skill schema ve canlı fixture durumu çıkarıldı;
- Grade vs Reading Proficiency ayrımı tanımlandı;
- Skill–Topic/Domain–Content–Question ayrımı tanımlandı;
- Unit'in pedagojik anlamı tanımlandı;
- learning goal, exam, difficulty, age/grade, versioning ve tenant ilişkileri dokümante edildi;
- minimum schema extension planlandı, migration uygulanmadı.

Bu aşamada yapılmayan:

- schema.prisma değişikliği;
- migration;
- Topic/Unit/Review modeli;
- yeni SkillCategory veya Level seed'i;
- gerçek content/question üretimi;
- authoring UI;
- Learning Path rewrite;
- adaptive/mastery/review engine;
- AI generation veya debug kodu.

## 29. Sonraki contract

8G-3 veya içerik kalite fazı bu dokümanı contract olarak kullanmalıdır. Öncelik sırası:

1. Gerçek 5–12 grade örnekleri ve educational standards.
2. Skill outcome ve question blueprint rubric'i.
3. Content domain vocabulary ve age-appropriate content rules.
4. Unit örnekleri, sıralama ve completion definition.
5. Review/approval ve version-aware alignment ADR'si.
6. Sonra additive schema/API/mobile planı.
