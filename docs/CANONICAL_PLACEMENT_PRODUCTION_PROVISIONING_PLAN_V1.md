# OkuPratik — Canonical Placement Production Provisioning Plan V1

**Durum:** READY_FOR_EXPLICIT_APPROVAL

**Kapsam:** Bu belge yalnızca canonical placement graph'ının üretim ortamına
korumalı ve idempotent biçimde alınması için sürümlü uygulama planıdır. Bu
çalışmada production provisioning, migration, seed, INSERT/UPDATE/DELETE veya
otomatik assignment yapılmamıştır.

**Canonical kaynak:** master

**Planın hazırlandığı canonical merge:**
6e28193ac707351a6abbf503cc4125e7d862ff04

**Academic/product gate:** DESIGN_ONLY · NOT_CALIBRATED ·
productionAssignmentEnabled=false

Bu karar, yalnızca ileride açıkça onaylanacak pasif graph oluşturma adımı için
hazırlık kararıdır. Placement'ın öğrenciye açılması, calibration yapılması veya
otomatik route/level assignment açılması anlamına gelmez.

## 1. Canonical kaynaklar ve sabit kimlikler

Plan mevcut canonical kaynakları ve mevcut protected akışı kullanır; yeni bir
DB erişim yolu, public endpoint veya paralel provisioning sistemi oluşturmaz.

| Kaynak                | Canonical değer                                            |
| --------------------- | ---------------------------------------------------------- |
| Assessment manifest   | OKU-READING-PLACEMENT-V1@1.1.0                             |
| Item bank manifest    | OKU-CANONICAL-PLACEMENT-ITEM-BANK-V1@1.0.1                 |
| Assessment            | canonical-assessment-oku-reading-placement-v1-1-0          |
| ExerciseTemplate      | canonical-template-oku-reading-placement-v1-1-0            |
| TemplateVersion       | canonical-template-version-oku-reading-placement-v1-1-0-v1 |
| Visibility scope      | global (tenantId=null)                                     |
| Assessment lifecycle  | DESIGN_ONLY                                                |
| Calibration           | NOT_CALIBRATED                                             |
| Production assignment | false                                                      |

Graph kimlikleri version-safe ve immutable olacak şekilde manifestten üretilir:

- Content: canonical-placement-content-v1-1-0-PLV1-C001 … C012
- ContentVersion: canonical-placement-content-version-v1-1-0-PLV1-C001-v1 … C012-v1
- Question: canonical-placement-question-v1-1-0-PLV1-Q001 … Q036
- QuestionVersion: canonical-placement-question-version-v1-1-0-PLV1-Q001-v1 … Q036-v1

Eski ve repository geçmişiyle doğrulanmış marker kapsamı ayrıca korunur ve
overwrite edilmez:

- manifest: OKU-READING-PLACEMENT-V1@1.0.0
- assessment: canonical-assessment-oku-reading-placement-v1
- template: canonical-template-oku-reading-placement-v1
- template version: canonical-template-version-oku-reading-placement-v1-v1

Bu eski kapsamda production kaydı bulunduğu iddia edilmez; son audit yalnızca
bu doğrulanmış marker'ları okumuştur.

## 2. Beklenen graph

buildCanonicalPlacementAssessmentGraph() çıktısı planın tek kaynağıdır.
Beklenen production graph aşağıdaki sayısal sözleşmeyi karşılamalıdır:

| Kayıt / ilişki                  | Beklenen |
| ------------------------------- | -------: |
| Assessment                      |        1 |
| ExerciseTemplate                |        1 |
| TemplateVersion                 |        1 |
| Content                         |       12 |
| ContentVersion                  |       12 |
| ContentSkill                    |       36 |
| Question                        |       36 |
| QuestionVersion                 |       36 |
| TemplateVersion–ContentVersion  |       12 |
| TemplateVersion–QuestionVersion |       36 |

Question type dağılımı tam olarak:

| Soru türü       | Beklenen |
| --------------- | -------: |
| MULTIPLE_CHOICE |        9 |
| TRUE_FALSE      |        9 |
| MATCHING        |        9 |
| FILL_BLANK      |        9 |

Ek manifest bütünlükleri de korunmalıdır: 36 soru, RC_MAIN_IDEA /
RC_DETAIL / RC_INFERENCE için 12/12/12 skill dağılımı, EASY/MEDIUM/HARD
için 12/12/12 zorluk dağılımı ve OPEN_ENDED dışlama politikası.

applyCanonicalPlacementPromotion() graph'ı transaction içinde oluşturur:
önce Content/Question ve version kayıtlarını, sonra Template/TemplateVersion
ilişkilerini ve en son published durumlarını yazar. Bu planın kendisi bu
fonksiyonu çağırmaz.

## 3. Production gözlemi

Korumalı, read-only workflow:

- Workflow: production-canonical-placement-audit.yml
- Son legacy-aware audit run: [#37913198003](https://github.com/gokcekmustafa/okuplus/actions/runs/37913198003)
- Production observation: true
- Production write: NO
- Audit status: INCOMPLETE
- Current promotion plan: CREATE
- Conflicts: []
- Idempotent: false

Gözlenen current graph'ta Assessment, Template ve TemplateVersion yoktu;
Content, ContentVersion, ContentSkill, Question, QuestionVersion ve iki
TemplateVersion ilişki kümesinin tamamı 0 gözlendi. Current canonical
marker'lar ve repository geçmişiyle doğrulanmış eski marker kapsamları da boş
gözlendi. Bu sonuç graph'ın eksik olduğunu gösterir; eski kayıtların tüm
database geçmişinde kesinlikle hiç bulunmadığını göstermez.

Bu nedenle CREATE, mevcut graph'a ekleme/overwrite değil, boş graph için
önerilen ilk creation action'ıdır. Partial graph veya başka marker görülürse
plan CONFLICT olmalı ve apply edilmemelidir.

## 4. Öğrenci görünürlüğü ve güvenli pasiflik

Graph satırlarının teknik olarak PUBLISHED oluşturulması, assessment'ın
öğrenciye açılmasıyla eşdeğer değildir. Aşağıdaki kapılar aynı canonical
identity ile kontrol edilir:

1. canonical-placement-assessment.ts manifesti canonicalActive=false,
   DESIGN_ONLY, NOT_CALIBRATED ve productionAssignmentEnabled=false üretir.
2. canonical-selector.ts yalnız PUBLISHED, silinmemiş, tenant kapsamı uygun
   ve canonicalActive=true olan current manifest/version kaydını seçer.
3. Öğrenci assessment listesi placement kayıtlarını canonical selector
   sonucuna göre filtreler; aktif canonical seçim yoksa placement satırı
   görünmez.
4. Assessment detail ve session start akışları tekrar
   findCanonicalPlacementAssessment() çağırır. canonicalActive kapalıysa
   öğrenciye assessment bulunamadı davranışı verilir.
5. Onboarding placement helper aynı selector'ı kullanır ve aktif seçim yoksa
   assessmentId=null döndürür.
6. Scoring tarafı NOT_CALIBRATED veya productionAssignmentEnabled=false iken
   sonucu reviewRequired=true / CALIBRATION_REQUIRED olarak bırakır.

Bu nedenle plan, mevcut flags değiştirilmeden pasif graph oluşturulmasına
hazırdır. P0 22-step akışı, P1-A fallback'i, P1 route selection, Training,
Assignment, Measurement ve tenant/student verileri bu planın kapsamı dışındadır
ve değiştirilemez.

## 5. Promotion karar makinesi

planCanonicalPlacementPromotion(graph, snapshot) sonucu apply öncesi tek karar
kaynağıdır:

| Snapshot                                                                             | Karar    | İşlem                                                  |
| ------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------ |
| Beklenen graph tamamen yok, marker yok                                               | CREATE   | Açık onaydan sonra protected transaction düşünülebilir |
| Tüm kayıt/ilişki/metadata tam ve uyumlu                                              | NOOP     | Yazma yapılmaz                                         |
| Partial graph, başka marker, ID/metadata/status mismatch, deleted/published conflict | CONFLICT | Dur, overwrite yapma                                   |

ID collision, stale metadata veya bilinen eski/published marker mevcutsa CREATE
güvenli değildir. Exact identity ve metadata karşılaştırması uyuşmuyorsa
mevcut kayıtlar üzerine yazılmaz.

### CREATE öncesi zorunlu yeniden doğrulama

Apply kararı eski snapshot'a dayandırılamaz. Korunan işlem, aynı change window
içinde şu adımları yeniden yapmalıdır:

1. Production hedef fingerprint'i, provider/host/port/database/user
   kimliğini ve PRODUCTION ortamını doğrula.
2. Backup ve rollback kanıtını change owner doğrulasın.
3. production-migration environment, gerekli secret/approval ve explicit write
   onayı doğrulansın.
4. readCanonicalPlacementSnapshot() yeniden çalışsın.
5. buildCanonicalPlacementAssessmentGraph() yeniden üretilebilsin ve
   planCanonicalPlacementPromotion() sonucu tam olarak CREATE olsun.
6. Beklenmeyen tek bir marker, partial record veya conflict'te işlem durdurulsun.
7. Apply yalnız mevcut applyCanonicalPlacementPromotion() transaction'ı
   üzerinden çalıştırılsın; manuel SQL, ayrı seed veya doğrudan Prisma script'i
   kullanılmasın.
8. Apply sonrası aynı protected read-only snapshot ve graph count/type
   kontrolleri çalıştırılsın. Flag'ler hâlâ canonicalActive=false,
   NOT_CALIBRATED, productionAssignmentEnabled=false olmalıdır.

Bu belge o explicit write onayını vermez.

## 6. Rollback ve hata davranışı

- Transaction içindeki herhangi bir hata tüm CREATE işlemini rollback eder;
  partial graph bırakılması kabul edilmez.
- Published immutable version'lar overwrite edilmez ve ad hoc DELETE ile geri
  alınmaz.
- Apply sonrası sorun çıkarsa ilk güvenli davranış yeni assignment'ları kapalı
  tutmak ve protected owner incelemesi yapmaktır. Geçmiş assessment sonucu,
  öğrenci progress'i, tenant verisi veya P0/P1 history geriye dönük yazılmaz.
- Gerekirse geri alma yalnız repository'nin ileri yönlü, sürümlü ve korumalı
  release/config akışıyla yapılır; bu plan manuel SQL, delete veya overwrite
  prosedürü tanımlamaz.

## 7. Doğrulama ve test planı

Planın kod karşılığı mevcut protected mekanizmalardır:

- buildCanonicalPlacementAssessmentGraph() manifest/graph count ve 9/9/9/9
  tür dağılımını üretir.
- readCanonicalPlacementSnapshot() yalnız read-only production snapshot okur.
- planCanonicalPlacementPromotion() için mevcut contract testleri:
  - boş graph → CREATE,
  - tam uyumlu graph → NOOP,
  - partial/conflict → CONFLICT,
  - ID/metadata/status collision → CONFLICT,
  - exact tekrar → idempotent NOOP.
- applyCanonicalPlacementPromotion() transaction hata durumunun partial graph
  bırakmadığı test edilmelidir; production'da çağrılmamalıdır.
- Canonical selector testleri canonicalActive=false kaydının öğrenciye
  seçilmediğini; canonicalActive=true kararının ayrıca calibration ve
  assignment gate'leriyle karıştırılmadığını doğrular.
- TypeScript, lint, format ve build kontrolleri doküman değişikliği için
  yeniden çalıştırılabilir; production bağlantısı gerektirmez.

Bu çalışmada production snapshot workflow'u dışında DB bağlantısı açılmamış,
provisioning uygulanmamış ve öğrenci verisi okunmamıştır.

## 8. Karar ve kalan bağımlılık

### Karar: READY_FOR_EXPLICIT_APPROVAL

Teknik plan boş production graph için CREATE olarak tutarlı, transaction'lı,
versioned ve idempotent'tir. Öğrenci görünürlüğü canonicalActive=false ile
pasif kalır; assignment/calibration kapıları açılmaz.

Bu karar aşağıdaki anlamlara gelmez:

- placement assessment akademik olarak kalibre edildi;
- P1-B/C/D route'ları production'da seçilebilir;
- öğrenciye otomatik placement veya route assignment yapılabilir;
- production DB'ye yazma onayı verildi;
- applyCanonicalPlacementPromotion() çağrılabilir.

Açık kalan tek ürün/akademik bağımlılık, pilot ve uzman incelemesiyle
NOT_CALIBRATED durumunun çözülmesi ve ayrı bir release gate üzerinden
productionAssignmentEnabled kararının verilmesidir. O karar gelmeden bu graph
oluşturulsa bile placement öğrenciye açılmamalıdır.

## 9. Bu görevde yapılmayanlar

- Production INSERT, UPDATE, DELETE
- Migration, seed veya provisioning
- applyCanonicalPlacementPromotion() çağrısı
- Student/tenant/progress değişikliği
- P0 22-step veya P1 route değişikliği
- Production deployment veya automatic assignment
- Secret, answer, prompt veya öğrenci verisinin raporlanması
