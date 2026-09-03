# OKU+ — 8G-9B Curriculum Catalog Contract

Tarih: 2026-09-02  
Kapsam: production-candidate curriculum catalog tasarımı ve TEST-only doğrulaması  
Durum: **BLOCKED — gerçek production-grade Level/Skill katalog kaydı ve gerekli alignment ilişkileri mevcut değil**

## 1. Karar özeti

8G-9B kapsamında production DB'ye yazılmadı. Repository ve `oku_plus_test` incelendiğinde gerçek production-grade katalog kodları doğrulanamadı:

- TEST DB'de 12 `Level` kaydının tamamı E2E/LEARN/EXUX veya benzeri fixture niteliğinde.
- TEST DB'de 7 `Skill` kaydının tamamı `LEARN_E2E_*` veya `EXUX_*` fixture niteliğinde.
- Prisma schema'da `Level → Skill` relation'ı yok.
- Prisma schema'da `Content → Level` relation'ı veya `Content.levelId` yok.
- `Content → Skill`, `ContentSkill` üzerinden doğrulanabilir.
- `Question → ContentVersion` doğrudan FK değildir; pack composition üzerinden `TemplateVersion → ContentVersion` ve `TemplateVersion → QuestionVersion → Question → Content` zinciri doğrulanabilir.

Sonuç olarak catalog QA'nın `BLOCKED` üretmesi beklenen ve doğru sonuçtur. Fixture kayıtlarını silmek, yeni kod tahmin etmek veya sahte production catalog oluşturmak 8G-9B sözleşmesine aykırıdır.

## 2. Current model audit

### A) Level ile Skill arasındaki bugünkü ilişki

Bugünkü `Level` ve `Skill` modelleri bağımsız global katalog tablolarıdır. `Level` üzerinde Skill relation'ı veya join modeli yoktur. `Level` şu öğrenci/assessment relations'larını taşır:

- `StudentProfile.currentLevel` ve `StudentProfile.targetLevel`
- `Assessment.level`
- `AssessmentResult.resultLevel`

`Skill` şu relations'ları taşır:

- `Question.skill`
- `ContentSkill.skill`
- `ExerciseTemplate.skill`
- `StudentProgress.skill`

Bu nedenle “bu Skill bu Level'da geçerlidir” iddiası mevcut schema ile FK veya join üzerinden doğrulanamaz.

### B) Content ile Level arasındaki bugünkü ilişki

`Content` üzerinde `levelId`, `gradeLevel`, `gradeBand` veya başka bir Level FK'si yoktur. 8G-8 pack'in `levelCode` değeri yalnızca `ExerciseTemplate.config` metadata'sında bulunur. Bu, çalıştırma metadata'sıdır; Content→Level relational catalog relation'ı değildir.

### C) Content ile Skill arasındaki bugünkü ilişki

`ContentSkill` composite primary key (`contentId`, `skillId`) kullanan many-to-many relation'dır. `Content → ContentSkill → Skill` zinciri FK'lerle doğrulanabilir. 8G-8 pack için QA, her Content'in beklenen tek primary Skill'e bağlandığını ve template Skill'i ile aynı olduğunu kontrol eder.

### D) Bir question'ın ölçtüğü Skill nasıl doğrulanır?

Bugünkü modelde `Question.skillId` nullable tekil bir FK'dir. Production-candidate pack için gerekli kontrol zinciri:

```text
TemplateVersion
  → QuestionVersion
    → Question.skillId → Skill
    → Question.contentId → Content
      → ContentSkill → Skill
```

QA; Question'ın `skillId` değerini template primary Skill'i ve ContentSkill ile karşılaştırır, QuestionVersion'ın Question'a ait ve yayınlı olduğunu doğrular. Çoklu skill alignment veya version-aware pedagogical alignment mevcut modelde desteklenmez.

### E) Production candidate için minimal ilişkiler mevcut mu?

Kısmen:

- Level kaydı ve Skill kaydı için global tablolar vardır; fakat mevcut kayıtlar fixture'dır ve lifecycle alanları yoktur.
- Content→Skill vardır.
- Question→Content, QuestionVersion→Question ve template composition vardır.
- Level→Skill yoktur.
- Content→Level yoktur.
- Level/Skill için active/published state yoktur.

Bu nedenle production-candidate için gereken minimal catalog ilişkileri bütünüyle mevcut değildir.

## 3. Production catalog contract

Aşağıdaki sözleşme gerçek catalog seed'i için zorunludur. Bu bölüm yeni production değeri üretmez; gelecekte sağlanacak gerçek değerlerin doğrulama contract'ıdır.

### 3.1 Level

Her production Level şu alanları taşımalıdır:

- immutable stable `code` ve stable `id`;
- öğrenciye görünen `display name`;
- açık `grade band`;
- açık `difficulty band`;
- `active/published` lifecycle state;
- benzersiz display order ve audit metadata.

Bugünkü schema'da `code`, `name`, `gradeBand`, `difficultyMin`, `difficultyMax`, `displayOrder` vardır; `active/published` state yoktur. `minScore/maxScore` alanlarının grade mi proficiency mi olduğu mevcut contract'ta kesin değildir ve yeni anlamla kullanılamaz.

### 3.2 Skill

Her production Skill şu alanları taşımalıdır:

- immutable stable `code` ve stable `id`;
- öğrenciye görünen `display name`;
- gözlenebilir learning outcome açıklaması;
- canonical category;
- `active/published` lifecycle state;
- benzersiz display order ve audit metadata.

Bugünkü schema'da code/name/category/description/displayOrder vardır; active/published state yoktur. TEST'teki `LEARN_E2E_*` ve `EXUX_*` değerleri bu contract'ı production için karşılamaz.

### 3.3 Level → Skill

Bu relation ayrı, global ve doğrulanabilir bir join olarak tasarlanmalıdır. Her relation en azından:

- `levelId` veya immutable Level code;
- `skillId` veya immutable Skill code;
- active/published state;
- unique pair constraint;
- gerekirse curriculum order/effective date;

taşımalıdır. QA, pack'in her Skill'inin bağlı Level için geçerli olduğunu ve relation'ın aktif/yayınlı olduğunu doğrulamalıdır.

Mevcut schema'da bu relation bulunmadığı için 8G-9B'de PASS üretilemez.

### 3.4 Content

Production Content için minimum zorunluluk:

- immutable stable content code/id;
- geçerli production Level alignment;
- en az bir geçerli production Skill alignment;
- global catalog scope (`tenantId = NULL`) veya açık tenant scope;
- publication state;
- current published ContentVersion;
- ContentSkill relation'ı;
- license/provenance ve eligibility metadata.

Mevcut ContentSkill yalnız Skill alignment'ı sağlar. Content→Level için first-class relation yoktur; template config metadata'sı Content catalog relation'ının yerine geçmez.

### 3.5 ContentVersion

Her production Content'in current version'ı:

- Content'e FK ile bağlı;
- unique `(contentId, version)` içinde;
- `PUBLISHED` ve `publishedAt` dolu;
- yayınlandıktan sonra immutable;
- body, wordCount, license ve changelog alanlarıyla izlenebilir

olmalıdır. 8G-8 pack'in mevcut ContentVersion ilişkisi bu bölümün versioning kısmını karşılayacak şekilde QA edilir.

### 3.6 Question ve QuestionVersion

Production Question için minimum zorunluluk:

- immutable stable question identity;
- geçerli Content parent;
- Content ile uyumlu Skill alignment;
- question type ve difficulty;
- published Question status;
- current published QuestionVersion;
- QuestionVersion'ın ilgili TemplateVersion'a bağlanması.

QuestionVersion prompt, options, correctAnswer, explanation, hint ve difficulty alanlarını version'lar. Published version overwrite/delete edilmez; değişiklik yeni version ile yapılır.

Bugünkü schema'da doğrudan Question→ContentVersion FK yoktur. Pack QA, QuestionVersion'ın TemplateVersion üzerinden aynı published ContentVersion ile compose edildiğini ve Question'ın aynı Content parent'a ait olduğunu doğrular. First-class direct relation gerekirse ayrı additive schema ADR'si gerekir; 8G-9B'de boş bir relation eklemek gerçek catalog üretmiş sayılmaz.

## 4. Production eligibility ve fixture ayrımı

Fixture sınıflandırması schema'da ayrı enum olmadığı için repository'de kararlaştırılmış açık kimlik marker'larıyla yapılır:

- `E2E`, `LEARN`, `EXUX`;
- `8d-`, `8e-` fixture prefix'leri;
- `test`, `fixture`, `Seviye X` ve benzeri açık işaretler.

Bu sınıflandırma yalnızca güvenli bir reject guard'ıdır. Gerçek production kodlarının ne olması gerektiğini tahmin etmez.

İki QA kapsamı ayrıdır:

| QA                       | Kapsam                                                           | Production sonucu                           |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------- |
| `qa:curriculum-fixtures` | Fixture kayıtlarının TEST'te tanımlanabildiğini doğrular         | Production catalog PASS anlamına gelmez     |
| `qa:curriculum-catalog`  | Production-candidate pack'in gerçek catalog binding'ini doğrular | Fixture veya eksik relation varsa `BLOCKED` |

Fixture verisi korunur; silinmez ve production catalog adayı olarak kabul edilmez.

## 5. 8G-8 pack validation contract

Catalog QA aşağıdaki sonuçları 9 Content ve 36 Question için üretmelidir:

- her Content'in global/published olması;
- current published ContentVersion'ın bulunması;
- ContentSkill relation'ının ve template primary Skill'inin aynı olması;
- explicit Level metadata'sının bulunması;
- gerçek Level ve Skill kayıtlarının fixture olmaması;
- Level→Skill relation'ının doğrulanabilmesi;
- Content→Level relation'ının doğrulanabilmesi;
- her Question'ın doğru Content'e bağlı olması;
- her Question'ın QuestionVersion'ının yayınlı olması;
- QuestionVersion'ın TemplateVersion'a bağlı olması;
- Question Skill'inin ContentSkill ve template Skill ile hizalı olması;
- Question type'ının manifest ile aynı olması;
- duplicate/orphan stable ID bulunmaması.

Şu anki TEST sonucu: stable ID `144/144`, orphan `0`, duplicate `0`, ContentSkill/Question/template composition doğrulanabilir; ancak gerçek catalog ve iki eksik relation nedeniyle overall status `BLOCKED`.

## 6. Schema decision

8G-9B için **SCHEMA CHANGE: NO**.

Gerekçe:

1. TEST DB'de gerçek Level/Skill kodları yoktur; migration ile gerçek veri uydurulamaz.
2. Boş bir Level→Skill veya Content→Level relation'ı eklemek catalog QA'yı PASS yapmaz.
3. Mevcut ContentSkill, Content/Question/Version/template FK'leri mevcut pack'in doğrulanabilen kısmı için yeterlidir.
4. Published veriyi ve runtime UI akışını etkileyen additive migration, gerçek catalog sözlüğü ve cardinality kararı olmadan güvenli değildir.

Gelecekte schema değişikliği gerekirse minimum additive seçenekler ayrı ADR ile belirlenmelidir: global `LevelSkill` join, Content veya version-aware alignment için ContentLevel relation, lifecycle alanları, unique/index stratejisi, RLS ve deterministic backfill. Bu aşamada migration oluşturulmadı ve uygulanmadı.

## 7. UI etkisi

8G-9B'de schema/catalog write veya UI redesign yapılmadı. Mevcut read-only QA ile aşağıdaki akışlar regression kapsamında kontrol edilir:

- Learning Path;
- Today/student learning;
- Exercise;
- Progress/gamification;
- Review;
- Assessment/assignment.

Kullanıcıya görünen metinler Türkçe tutulur. Catalog BLOCKED olduğu için UI'ya sahte Level/Skill seçeneği eklenmez.

## 8. Promotion gate

Production promotion ancak şu koşulların tamamı sağlandığında açılabilir:

1. Gerçek Level catalog kodları/id'leri sağlanır.
2. Gerçek Skill catalog kodları/id'leri sağlanır.
3. Level→Skill active/published relation'ı doğrulanır.
4. Content→Level relation'ı doğrulanır.
5. Content→Skill relation'ı doğrulanır.
6. Question→ContentVersion composition'ı doğrulanır.
7. `qa:curriculum-catalog` `PASS` verir.
8. Pack QA, testler, browser regression ve quality gates yeniden `PASS` verir.
9. Production DB identity ve promotion planı ayrıca doğrulanır; bu konu 8G-8 blocker olarak açık kalır.

Bu koşullar sağlanana kadar doğru öneri: **production promotion yapılmamalı**.
