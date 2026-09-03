# Oku+ Ürün ve Mimari Denetimi

Tarih: 29 Ağustos 2026  
Kapsam: Depodaki Prisma şeması, migration/manual SQL, Fastify servis ve route'ları, vanilla SPA, testler ve çalışma betikleri.  
Karar sözlüğü: **KORU**, **REFACTOR**, **YENİDEN TASARLA**, **EKSİK**, **KAPSAM DIŞI**.

## Yönetici özeti

Oku+ bugün sıfırdan atılacak bir prototip değildir. Sürümlü içerik, soru puanlama, öğrenme oturumu, attempt idempotency, bireysel/kurumsal tenant modeli, üyelik, atama, assessment kabuğu, progress ve event-ledger biçimindeki puan modeli doğru bir çekirdek oluşturuyor. Buna karşılık ürün henüz bir son kullanıcı EdTech SaaS'ı değil; ağırlıklı olarak yönetim paneli ve öğrenci egzersiz MVP'sidir.

Nihai karar **B — Kontrollü refactor gerekli**. Çalışan domain çekirdeği korunmalı; identity/auth yaşam döngüsü, entitlement/subscription, onboarding/consent, güvenilir domain event/outbox, assessment completion ve öğrenci uygulama kabuğu ayrı katmanlar halinde eklenmelidir. Tüm sistemi yeniden yazmak gereksiz ve risklidir.

En kritik bulgular:

1. **KORU:** `User` ile `Tenant` doğrudan birleştirilmemiş; erişim `Membership` üzerinden kurulmuş.
2. **REFACTOR:** `User` aynı anda profil, credential ve platform yetkisi taşıyor. Sosyal/mobile auth gelmeden `AuthIdentity` ve kalıcı refresh session ayrılmalı.
3. **YENİDEN TASARLA:** Tenant izolasyonunun RLS iddiası ile servislerin doğrudan, RLS bypass eden Prisma singleton kullanması arasında güvenlik sınırı belirsiz. Tek bir tenant-scoped repository/transaction kapısı şart.
4. **REFACTOR:** Exercise completion sonrası progress/gamification işlemleri hata yutularak transaction dışında yapılıyor. Outbox yok; kalıcı tutarsızlık mümkündür.
5. **EKSİK:** Assessment başlatılabiliyor fakat completion akışı `AssessmentResult` üretmiyor ve placement sonucu `StudentProfile.currentLevelId`'yi güncellemiyor.
6. **EKSİK:** Signup, Google/Apple, onboarding, yaş/veli onayı, subscription/entitlement, reklam, bildirim, hesap silme ve native mobile yok.
7. **REFACTOR:** Tek 8.000+ satırlık `public/app.js` ve tek HTML kabuğu öğrenci, öğretmen ve platform deneyimlerini aynı yüzeyde topluyor.
8. **KORU:** İçerik/soru/template sürümleme, published immutability yaklaşımı, attempt/client idempotency ve append-only `PointEvent` doğru temellerdir.

## Denetim kanıtı ve güven düzeyi

- `npm run typecheck`: geçti.
- `npm run build`: geçti.
- `npm run lint`: geçti.
- `npm test -- --reporter=dot`: ortamda `127.0.0.1:5432` PostgreSQL çalışmadığı için tam doğrulanamadı. Sonuç: 21 test dosyasından 1'i geçti, 20'si DB bağlantısında başarısız; 468 testten 8 geçti, 459'u setup sonrasında çalışamadı, 1 health testi 503/200 farkıyla başarısız oldu.
- Bu raporda **VAR**, çalışan kod yolu bulunduğu anlamına gelir; DB-bağımlı uçtan uca doğrulamanın bu çalıştırmada geçtiği anlamına gelmez.

---

## 43. Mevcut kodu koruma / refactor kararı

### F1 — Identity, tenant ve membership ayrımı — KORU

- **Mevcut dosya/modül:** `prisma/schema.prisma` — `User`, `Tenant`, `Membership`, `Enrollment`, `TeacherClassAssignment`.
- **Mevcut davranış:** Global kullanıcı kimliği, tenant üyeliğinden ayrı; roller üyelikte, sınıf ilişkisi enrollment/assignment tablolarında tutuluyor.
- **Sorun:** Temel ayrımda sorun yok. Kişisel hesap provisioning akışı eksik.
- **Önerilen çözüm:** Modeli koru; signup transaction'ında `INDIVIDUAL Tenant + OWNER/STUDENT Membership + StudentProfile` oluştur.
- **Aşama:** FOUNDATION.
- **Çalışan özelliklere etki:** Additive; mevcut kurumsal üyelikler ve admin CRUD değişmez.

### F2 — Credential ve kimlik sağlayıcı modeli — REFACTOR

- **Mevcut dosya/modül:** `User.passwordHash`, `modules/auth/jwt-provider.ts`, `modules/auth/session-store.ts`.
- **Mevcut davranış:** E-posta/parola, HS256 access/refresh JWT ve process-memory revoke set'i kullanılıyor.
- **Sorun:** Bir kullanıcıya birden fazla Apple/Google/email kimliği bağlanamaz; restart sonrası logout iptali kaybolur; refresh token ailesi, cihaz ve reuse detection yoktur.
- **Önerilen çözüm:** `AuthIdentity(provider, providerSubject, userId)`, `Credential`, hash'li `RefreshSession/TokenFamily` ekle; `User` yalnız profil/identity root olsun. Kısa ömürlü access token korunabilir.
- **Aşama:** FOUNDATION, mobile'dan önce.
- **Çalışan özelliklere etki:** Eski `passwordHash` için geçiş adaptörü ve ilk başarılı login'de lazy migration ile kesintisiz.

### F3 — Tenant güvenlik sınırı — YENİDEN TASARLA

- **Mevcut dosya/modül:** `modules/tenant/context.ts`, `middleware/authenticate.ts`, `prisma/manual/003..006`, domain servisleri.
- **Mevcut davranış:** Membership ile tenant doğrulanıyor; RLS için GUC helper mevcut. Bununla birlikte servislerin çoğu doğrudan `prisma` kullanıyor ve auth kodundaki açıklamaya göre uygulama bağlantısı `BYPASSRLS` çalışıyor.
- **Sorun:** Güvenlik hem route filtrelerine hem dağınık service `where` koşullarına dayanıyor; “RLS koruyor” varsayımı gerçekte her sorgu için geçerli değil. Yeni bir endpoint'te tenant filtresi unutulması veri sızıntısı yaratabilir.
- **Önerilen çözüm:** Normal request'leri non-BYPASSRLS DB rolü + `withTenantContext` üzerinden çalıştır; platform operasyonlarını ayrı, auditable privileged repository'ye taşı. Tenant-scoped repository'nin dışında domain sorgusunu lint/architecture test ile engelle.
- **Aşama:** FOUNDATION, dış kullanıcı açılışından önce.
- **Çalışan özelliklere etki:** Yüksek riskli ama contract-preserving refactor; endpoint response'ları değişmemeli, cross-tenant testleri önce yazılmalı.

### F4 — İçerik ve soru sürümleme — KORU

- **Mevcut dosya/modül:** `Content/ContentVersion`, `Question/QuestionVersion`, `ExerciseTemplate/ExerciseTemplateVersion`, published immutable SQL trigger'ları.
- **Mevcut davranış:** Yayınlanmış içeriğin snapshot sürümü session/template bağlantılarında tutuluyor.
- **Sorun:** Locale, curriculum alignment, lisans kaynağı ve içerik yayın workflow'u sınırlı.
- **Önerilen çözüm:** Çekirdeği koru; locale/translation, review approval ve catalog metadata'yı ek modellerle genişlet.
- **Aşama:** PRODUCT CORE.
- **Çalışan özelliklere etki:** Additive; eski içerik `tr-TR` default locale ile backfill edilir.

### F5 — Exercise session ve attempt — KORU

- **Mevcut dosya/modül:** `ExerciseSession`, `Attempt`, `modules/sessions`, `modules/questions/service.ts`.
- **Mevcut davranış:** Published template version üzerinden session açılıyor; sorular snapshot'tan geliyor; cevap anında deterministik puanlanıyor; `clientSessionId` ve `clientAttemptId` tekrarları engelliyor.
- **Sorun:** API yolları `/admin/...` altında olmasına rağmen öğrenci tarafından da kullanılıyor; completion tekrar çağrısı idempotent sonuç yerine hata veriyor; gerçek offline sync protokolü yok.
- **Önerilen çözüm:** Servisi koru, öğrenci kontratını `/v1/learning/sessions` altında yayınla; completion'ı idempotent yap; sync cursor/conflict politikası ekle.
- **Aşama:** PRODUCT CORE → MOBILE.
- **Çalışan özelliklere etki:** Eski yollar deprecation adaptörüyle çalışmaya devam eder.

### F6 — Anlık feedback ve skor — KORU

- **Mevcut dosya/modül:** `scoreAttempt()` ve attempt create route'u.
- **Mevcut davranış:** Multiple choice, true/false, matching ve fill-blank puanlanıyor; open-ended manuel değerlendirme bekliyor; raw score ve feedback attempt'te saklanıyor.
- **Sorun:** Feedback pedagojik politika/version olarak modellenmiyor; cevap anahtarı sızıntısına karşı response-contract güvenlik testi sınırlı.
- **Önerilen çözüm:** Scoring policy/version ekle; istemciye dönen DTO'larda `correctAnswer` bulunmadığını contract testlerle sabitle.
- **Aşama:** PRODUCT CORE.
- **Çalışan özelliklere etki:** Geriye uyumlu DTO genişletmesi.

### F7 — Progress projeksiyonu — REFACTOR

- **Mevcut dosya/modül:** `StudentProgress`, `modules/progress/aggregation.ts`.
- **Mevcut davranış:** Session tamamlandıktan sonra haftalık student+skill istatistikleri tüm attempt'lerden yeniden hesaplanıyor.
- **Sorun:** Hata tamamen yutuluyor; process kapanırsa projection hiç oluşmayabilir. Her completion'da dönem verisini yeniden taramak ölçeklenmez. `masteryScore`, `fluencyWcpm`, `consistency` üretilmiyor.
- **Önerilen çözüm:** `ExerciseCompleted` outbox event'inden idempotent projection worker; rebuild komutu; algorithm version ve checkpoint. İlk sürümde transaction sonrası synchronous retry uygulanabilir.
- **Aşama:** FOUNDATION güvenilirlik, PRODUCT CORE algoritma.
- **Çalışan özelliklere etki:** `StudentProgress` read model korunur; yalnız yazma yolu değişir.

### F8 — Gamification ledger — REFACTOR

- **Mevcut dosya/modül:** `PointEvent`, `StudentStreak`, `StudentBadge`, `modules/gamification/service.ts`.
- **Mevcut davranış:** Append-only puan kayıtları dedupe key ile tutuluyor; login/correct answer/exercise completion puan ve badge tetikliyor.
- **Sorun:** Yan etkiler attempt/session transaction'ının dışında ve hatalar yutuluyor. Sabit kurallar kod içinde; timezone yalnız UTC; `BADGE_EARNED` puan event enum'u kullanılmıyor.
- **Önerilen çözüm:** Ledger'ı koru; outbox consumer, versioned rule set, user timezone/day boundary ve reconciliation job ekle.
- **Aşama:** STUDENT EXPERIENCE.
- **Çalışan özelliklere etki:** Toplam puan `PointEvent`'ten hesaplanmaya devam eder; geriye uyumlu.

### F9 — Assessment completion — YENİDEN TASARLA

- **Mevcut dosya/modül:** `modules/assessments/service.ts`, `modules/sessions/service.ts`, `AssessmentResult`.
- **Mevcut davranış:** Published assessment listeleniyor ve assessment context'li exercise session başlatılıyor; sonuç endpoint'i kayıt arıyor.
- **Sorun:** Session completion `AssessmentResult` oluşturmuyor; placement sonucu level'a bağlanmıyor. Global assessment başlatılırken actor'un seçili tenant'ı yerine ilk aktif membership seçilebiliyor. Sonuç modelinde session ile uniqueness/traceability yok.
- **Önerilen çözüm:** `AssessmentAttempt` veya `AssessmentResult.sessionId @unique`; assessment completion domain service'i skorlar, result yazar ve placement ise profile level'ını aynı transaction/outbox zincirinde günceller. Tenant daima doğrulanmış actor context'ten gelir.
- **Aşama:** PRODUCT CORE, placement onboarding'den önce.
- **Çalışan özelliklere etki:** Mevcut assessment CRUD ve session motoru korunur; completion orchestration değiştirilir.

### F10 — Assignment ve kurum yapısı — REFACTOR

- **Mevcut dosya/modül:** Branch/Class/Enrollment/TeacherAssignment/Assignment servisleri.
- **Mevcut davranış:** Kurum, şube, sınıf, öğrenci, öğretmen ve ödev yönetimi; öğrenci ödevi görüp session başlatabiliyor.
- **Sorun:** Admin yollarının çoğu yalnız platform rolüne açık; gerçek `ORG_ADMIN`, `BRANCH_MANAGER`, `TEACHER` yetki matrisi ürünleşmemiş. Davet kabul/ret ve kurumdan ayrılma yok.
- **Önerilen çözüm:** Policy service + resource-scoped authorization; invitation token/state machine; leave/remove kuralları; öğretmen rapor read model'i.
- **Aşama:** INSTITUTION.
- **Çalışan özelliklere etki:** Platform admin akışı korunur, tenant kullanıcılarına yeni yollar eklenir.

### F11 — Subscription, entitlement ve reklam — EKSİK

- **Mevcut dosya/modül:** Model/service/API/UI yok.
- **Mevcut davranış:** Free limit, plan, purchase, renewal, cancellation, restore ve ad decision bulunmuyor.
- **Sorun:** Tenant veya membership alanına basit `isPremium` eklemek ileride store/web billing ve kurum lisanslarını birbirine karıştırır.
- **Önerilen çözüm:** `Product`, `Plan`, `Subscription`, `Purchase`, `EntitlementGrant`, `UsageCounter`; provider webhook inbox; entitlement resolver. Ad gösterimi entitlement + yaş/consent + policy sonucudur.
- **Aşama:** MONETIZATION.
- **Çalışan özelliklere etki:** Feature-gate default'u mevcut işlevleri açık tutacak biçimde rollout edilir.

### F12 — Consent, privacy ve hesap silme — REFACTOR

- **Mevcut dosya/modül:** `Consent`, `AuditLog` modelleri ve RLS SQL'i.
- **Mevcut davranış:** Veri modeli var; son kullanıcı consent API/UI ve erasure workflow yok.
- **Sorun:** `birthYear` kesin yaş/consent kararını kanıtlamaya yetmez; guardian verification, policy version registry, export/erasure job ve retention yok.
- **Önerilen çözüm:** `PolicyDocument`, consent evidence, guardian approval, age-band resolver, DSAR/export/erasure workflow ve tombstone/anonymization politikası.
- **Aşama:** FOUNDATION, signup'tan önce.
- **Çalışan özelliklere etki:** Additive; mevcut kullanıcılar `consent_required` durumuna kontrollü alınır.

### F13 — UI uygulama sınırı — REFACTOR

- **Mevcut dosya/modül:** `public/index.html`, `public/app.js`, `public/styles.css`.
- **Mevcut davranış:** Login sonrası platform admin ve öğrenci ekranları tek vanilla SPA içinde; responsive sidebar mevcut.
- **Sorun:** Rol bazlı ürün kabukları birbirine karışıyor; devasa tek JS dosyası test edilebilirlik, code splitting, accessibility ve ekip paralelliğini sınırlar. Refresh token `localStorage`'da olduğundan XSS etkisi büyüktür.
- **Önerilen çözüm:** Önce route/API client/state modüllerine böl; sonra öğrenci, öğretmen ve platform kabuklarını ayrı entry point'lere taşı. Web'de refresh token için secure httpOnly cookie/BFF değerlendirilmelidir.
- **Aşama:** STUDENT EXPERIENCE, ardından INSTITUTION.
- **Çalışan özelliklere etki:** Strangler yaklaşımı; ekranlar birer birer yeni kabuğa taşınır.

### F14 — Media ve AI — REFACTOR

- **Mevcut dosya/modül:** `QuestionMedia`, `QuestionGenerationJob`, media admin servisleri.
- **Mevcut davranış:** Media metadata/link ve AI job veri modeli var; gerçek object upload, scanning, CDN pipeline ve worker görünmüyor.
- **Sorun:** URL kaydı upload sistemi değildir; AI prompt/result içinde PII, maliyet, moderation, provenance ve retry politikaları tanımlı değil.
- **Önerilen çözüm:** Signed upload/finalize, malware scan/transcode/CDN; AI provider adapter, prompt template version, safety review ve async worker.
- **Aşama:** MEDIA PRODUCT CORE; AI/ADVANCED daha sonra.
- **Çalışan özelliklere etki:** Mevcut metadata modeli genişletilir.

### F15 — Observability, CI/CD ve disaster recovery — EKSİK

- **Mevcut dosya/modül:** Pino logger ve health endpoints var; CI, container/deploy, metrics/tracing, backup/restore dokümanı yok.
- **Mevcut davranış:** Yapılandırılmış request log ve DB health check sağlanıyor.
- **Sorun:** SLO, alert, correlation, migration pipeline, secret rotation, backup ve restore drill yok.
- **Önerilen çözüm:** CI quality gates + ephemeral Postgres; OpenTelemetry/metrics; error tracking; immutable build; migration approval; PITR ve düzenli restore testi.
- **Aşama:** FOUNDATION ve SCALE.
- **Çalışan özelliklere etki:** Uygulama davranışını değiştirmeyen operasyonel katman.

---

## 44. “Çöpe atmadan geliştir” analizi

### Sıfırdan başlasaydık farklı vereceğimiz kararlar

- `User` içine credential koymak yerine ilk günden `User/Profile` ile `AuthIdentity/Credential/Session` ayrılırdı.
- İstek başına tenant-scoped DB client/repository zorunlu olur, privileged platform client tamamen ayrılırdı.
- `Subscription` ile `Entitlement` ayrı kurulurdu; bireysel store satın alımı ile kurumsal lisans aynı boolean'a bağlanmazdı.
- Her domain değişiminde transactional outbox olur; progress, gamification, analytics ve notification aynı event'i tüketirdi.
- Assessment, exercise template'i yeniden kullansa da kendi attempt/result lifecycle'ına sahip olurdu.
- API en baştan `/v1/identity`, `/v1/learning`, `/v1/assessments` gibi role-neutral resource yollarıyla yayınlanırdı.
- Öğrenci, öğretmen ve platform admin ayrı uygulama kabukları; ortak design system/API client kullanırdı.
- OpenAPI, contract testing, ephemeral DB ve migration doğrulaması CI'ın ilk gün parçası olurdu.

### Mevcut projede değiştirmeye değer

- Auth identity/session ayrımı; henüz sosyal login ve mobile olmadığı için dönüş maliyeti bugün düşüktür.
- Tenant data-access kapısı; sonradan düzeltme maliyeti ve güvenlik etkisi çok yüksektir.
- Outbox/event contract; progress/gamification/analytics/notification çoğalmadan eklenmelidir.
- Assessment completion/result bağı; placement ürün akışından önce düzeltilmelidir.
- UI modülerleştirme; yeni ekranlar tek dosyaya eklenmeden başlanmalıdır.
- Subscription/entitlement'ı yeni bounded context olarak eklemek.

### Değiştirmek gereksiz risk

- Prisma/PostgreSQL/Fastify yığınını sırf “daha modern” bir yığın için değiştirmek.
- UUID, soft-delete, versioned content ve immutable published yaklaşımını yeniden kurmak.
- `ExerciseSession`/`Attempt` çekirdeğini atıp yeni motor yazmak.
- `PointEvent` ledger'ını tek toplam puan kolonuna indirgemek.
- Bireysel hesap için tenant modelini kaldırmak; `INDIVIDUAL Tenant + Membership` yaklaşımı context tutarlılığı sağlar.

### Yeni katmanda çözülebilecekler

- Identity provider adapters ve session store.
- Entitlement resolver ve billing provider adapters.
- Transactional outbox, queue consumers ve analytics warehouse export.
- Notification preference/template/delivery.
- Mobile BFF/sync API ve offline store.
- Öğretmen rapor projection'ları.
- AI orchestration ve media processing.

---

## 45. Hedef ürün uçtan uca

### Bireysel kullanıcı yolu

| Adım                   | Durum     | Neden                                                                             |
| ---------------------- | --------- | --------------------------------------------------------------------------------- |
| App install            | ❌ YOK    | Native/PWA install paketi ve store dağıtımı yok.                                  |
| Sign up                | ❌ YOK    | Yalnız admin kullanıcı oluşturma ve login var.                                    |
| Apple / Google / Email | ⚠️ KISMEN | Email/password login var; signup, doğrulama, reset, Apple/Google yok.             |
| Personal account       | ⚠️ KISMEN | `INDIVIDUAL Tenant` modeli var; self-service provisioning yok.                    |
| Onboarding             | ❌ YOK    | Hedef, ilgi, günlük plan veya ilk-run akışı yok.                                  |
| Age / consent          | ⚠️ KISMEN | `birthYear`, `Consent`, `Guardianship` modelleri var; API/UI/workflow yok.        |
| Level placement        | ⚠️ KISMEN | PLACEMENT assessment tipi ve level modeli var; sonuç üretme/profile update eksik. |
| Today                  | ❌ YOK    | Kişisel günlük plan/recommendation yüzeyi yok.                                    |
| Personal learning      | ⚠️ KISMEN | Individual session mümkün; içerik öneri/planlayıcı yok.                           |
| Exercise               | ✅ VAR    | Versioned template ile session başlatma/bitirme var.                              |
| Question               | ✅ VAR    | Çoklu soru tipleri ve session question listesi var.                               |
| Instant feedback       | ✅ VAR    | Otomatik puanlanan tiplerde attempt cevabı feedback/skor döndürüyor.              |
| Score                  | ✅ VAR    | Attempt raw score ve session score summary var.                                   |
| Progress               | ⚠️ KISMEN | Haftalık skill projection/UI var; güvenilir delivery ve mastery eksik.            |
| XP / point             | ✅ VAR    | `PointEvent` ledger ve toplam puan görünümü var.                                  |
| Streak                 | ✅ VAR    | UTC gün tabanlı current/longest streak var.                                       |
| Badge                  | ✅ VAR    | Üç temel badge kuralı ve award görünümü var.                                      |
| Notification           | ❌ YOK    | Model/service/provider/UI yok.                                                    |
| Free limit             | ❌ YOK    | Usage counter/limit policy yok.                                                   |
| Ad                     | ❌ YOK    | Ad provider/eligibility/consent policy yok.                                       |
| Premium                | ❌ YOK    | Plan/entitlement yok.                                                             |
| Subscription           | ❌ YOK    | Billing domain yok.                                                               |
| Renewal                | ❌ YOK    | Webhook/state machine yok.                                                        |
| Cancel                 | ❌ YOK    | Billing lifecycle yok.                                                            |
| Restore                | ❌ YOK    | Store purchase restore yok.                                                       |
| Account delete         | ⚠️ KISMEN | Soft delete ve audit enum'u var; self-service erasure workflow yok.               |

### Kurumsal kullanıcı yolu

| Adım                    | Durum     | Neden                                                                        |
| ----------------------- | --------- | ---------------------------------------------------------------------------- |
| Personal user           | ⚠️ KISMEN | User + individual tenant modellenebilir; self-service yok.                   |
| Organization invite     | ⚠️ KISMEN | `Membership.PENDING` ve `invitedBy` var; token, delivery, accept/reject yok. |
| Organization membership | ✅ VAR    | Membership role/status ve tenant context çözümleme var.                      |
| Class                   | ✅ VAR    | Class, academic year, branch ve enrollment var.                              |
| Teacher                 | ✅ VAR    | Teacher membership, branch/class assignment CRUD var.                        |
| Assignment              | ✅ VAR    | Oluşturma/yayınlama ve öğrenci start akışı var.                              |
| Assessment              | ⚠️ KISMEN | CRUD/start var; güvenilir completion/result yok.                             |
| Teacher report          | ❌ YOK    | Öğretmene scoped cohort/assignment report endpoint/UI yok.                   |
| Leave organization      | ❌ YOK    | Kullanıcı self-service leave ve ownership transfer politikası yok.           |

---

## 46. Son ürün mimarisi

| Katman                  | Sorumluluk                                       | Bağımlılıklar                | Mevcut durum                   | Eksikler                                                |
| ----------------------- | ------------------------------------------------ | ---------------------------- | ------------------------------ | ------------------------------------------------------- |
| 1. Identity             | Global kişi/profil, hesap yaşam döngüsü          | Compliance, Auth             | `User` var                     | Profile/credential ayrımı, merge, export/delete         |
| 2. Authentication       | Provider login, MFA, sessions, recovery          | Identity, Infra              | Email/password JWT var         | Signup, verify/reset, Apple/Google, persistent rotation |
| 3. Personal Context     | Bireysel tenant, hedefler, tercih, günlük plan   | Identity, Learning           | INDIVIDUAL tenant/profile var  | Provisioning, preferences, Today plan                   |
| 4. Organization Context | Tenant, membership, branch, class, policy        | Identity                     | Güçlü schema/admin CRUD        | Invite, tenant RBAC, switching, leave                   |
| 5. Content              | Catalog, version, review, localization           | Media, Admin                 | Güçlü versioned model          | Locale, workflow, curriculum, search                    |
| 6. Learning             | Session, attempt, feedback, recommendation       | Content, Progress            | Exercise çekirdeği var         | Role-neutral API, planner, offline sync                 |
| 7. Assessment           | Placement/diagnostic/benchmark lifecycle         | Content, Learning            | CRUD/start/model var           | Result orchestration, profile update, psychometrics     |
| 8. Progress             | Mastery/projection/history                       | Learning, Assessment, Events | Haftalık read model var        | Reliable eventing, mastery/version/rebuild              |
| 9. Gamification         | Point ledger, streak, badge/rules                | Learning, Events             | MVP var                        | Rule versions, timezone, reconciliation                 |
| 10. Subscription        | Catalog, billing, entitlement, usage             | Identity, Org, Compliance    | Yok                            | Baştan bounded context                                  |
| 11. Notification        | Preference, template, schedule, delivery         | Events, Identity, Compliance | Yok                            | Push/email/in-app, quiet hours, consent                 |
| 12. Analytics           | Product events, learning facts, reporting        | Events, Compliance           | Operasyonel tablolar var       | Taxonomy, warehouse, dashboards, deletion propagation   |
| 13. Media               | Upload, storage, transform, delivery             | Content, Infra               | Metadata/link modeli var       | Object pipeline, scan, CDN, retention                   |
| 14. AI                  | Generation/scoring/recommendation adapters       | Content, Media, Analytics    | Job ve attempt AI alanları var | Worker, safety, evaluation, cost/provenance             |
| 15. Compliance          | Consent, age, guardian, audit, DSAR              | Identity, all domains        | Temel modeller var             | Policy registry, workflows, retention, DPIA controls    |
| 16. Administration      | Platform/content/support operations              | Tüm domainler                | Geniş platform paneli var      | Org admin/teacher ayrımı, audit UI, approval            |
| 17. Mobile              | Native shell, secure storage, offline/sync, push | Auth, Learning, Notification | Responsive web testi var       | Native app/PWA, deep link, store billing, offline       |
| 18. Infrastructure      | Runtime, DB, queue, cache, observability, DR     | Tüm katmanlar                | Fastify/Postgres/log/health    | CI/CD, queue/Redis, telemetry, secrets, backups/restore |

Önerilen paket sınırı: her domain `domain` (kurallar), `application` (use-case), `ports` (repository/provider), `adapters` (Prisma/Fastify/provider) katmanlarına ayrılır. Bu, mikroservis zorunluluğu değildir; önce modüler monolith olarak uygulanmalıdır.

---

## 47. Mimari sınırlar

| Sınır                          | Kural                                                                             | Uygulama invariant'ı                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Identity ≠ Tenant              | User global kişidir; tenant çalışma/erişim bağlamıdır.                            | `User` silinmeden üyelik bitebilir; tenant değiştirmek identity değiştirmez.                 |
| Tenant ≠ Subscription          | Tenant organizasyon/konteksttir; subscription ticari sözleşmedir.                 | Bir tenant'ın sıfır/çok subscription geçmişi olabilir; kurum sözleşmesi ayrı kaynaktır.      |
| Subscription ≠ Entitlement     | Subscription ödeme durumu; entitlement kullanılabilir yetenektir.                 | Trial, promo, kurum lisansı ve store grace period entitlement üretebilir.                    |
| Content ≠ Learning Session     | Content tekrar kullanılabilir katalog; session kullanıcıya ait immutable icradır. | Session her zaman yayınlanmış version snapshot'ına referans verir.                           |
| Assessment ≠ Exercise          | Exercise pratik motoru; assessment kontrollü ölçüm ve sonuç lifecycle'ıdır.       | Assessment session motorunu kullanabilir ama kendi attempt/result/policy kimliğine sahiptir. |
| Gamification ≠ Progress        | Gamification motivasyon ekonomisi; progress pedagojik mastery'dir.                | Puan değişimi mastery'yi doğrudan değiştiremez.                                              |
| User ≠ Organization Membership | User kişi; membership tenant içi rol ve durumdur.                                 | Yetki `User` rolünden değil active membership + resource policy'den gelir.                   |
| Bireysel ≠ Kurumsal öğrenme    | Aynı motor, farklı context/policy/ownership kullanır.                             | Session `contextOwner`/tenant ile raporlanır; kişisel history kurumdan ayrılınca kaybolmaz.  |

Ek kural: tek bir kullanıcı eşzamanlı bireysel ve birden fazla kurum üyeliğine sahip olabilir. UI context switch explicit olmalı; token içindeki tenant id source of truth olmamalı, her request'te membership doğrulanmalıdır.

---

## 48. Tek source of truth

| Kritik iş           | Model                                          | Service / use-case            | API                                  | Event                              | UI                         |
| ------------------- | ---------------------------------------------- | ----------------------------- | ------------------------------------ | ---------------------------------- | -------------------------- |
| Identity            | `User` + yeni `AuthIdentity`                   | `IdentityService`             | `/v1/me`, `/v1/identities`           | `UserRegistered`, `IdentityLinked` | Account/Profile            |
| Authentication      | yeni `RefreshSession`                          | `AuthService`                 | `/v1/auth/*`                         | `UserLoggedIn`, `SessionRevoked`   | Auth shell                 |
| Organization access | `Membership`                                   | `MembershipPolicy`            | `/v1/organizations/:id/memberships`  | `MembershipActivated/Ended`        | Context switcher           |
| Personal context    | `Tenant(type=INDIVIDUAL)` + `Membership`       | `PersonalContextProvisioner`  | `/v1/personal-context`               | `PersonalContextCreated`           | Onboarding/Profile         |
| Content             | `Content.currentVersionId` + version tabloları | `ContentCatalogService`       | `/v1/content`                        | `ContentPublished`                 | Content studio/catalog     |
| Learning session    | `ExerciseSession`                              | `LearningSessionService`      | `/v1/learning/sessions`              | `ExerciseStarted/Completed`        | Exercise player            |
| Attempt/feedback    | `Attempt`                                      | `AttemptScoringService`       | `/v1/learning/sessions/:id/attempts` | `AttemptScored`                    | Question/feedback          |
| Assessment result   | `AssessmentResult` + `sessionId`               | `AssessmentCompletionService` | `/v1/assessments/:id/result`         | `AssessmentCompleted`              | Placement/result           |
| Progress            | `StudentProgress` read model                   | `ProgressProjector`           | `/v1/progress`                       | consumes attempt/assessment events | Progress                   |
| Points              | `PointEvent`                                   | `GamificationLedger`          | `/v1/gamification`                   | `PointsAwarded`                    | XP/history                 |
| Streak              | `StudentStreak`                                | `StreakProjector`             | aynı read API                        | `StreakUpdated`                    | Today/gamification         |
| Badge               | `StudentBadge`                                 | `BadgeRuleEngine`             | aynı read API                        | `BadgeEarned`                      | Badge gallery              |
| Assignment          | `Assignment`                                   | `AssignmentService`           | `/v1/classes/:id/assignments`        | `AssignmentPublished/Completed`    | Teacher/student assignment |
| Subscription        | yeni `Subscription`                            | `BillingService`              | `/v1/billing/subscriptions`          | `SubscriptionStateChanged`         | Billing settings           |
| Entitlement         | yeni `EntitlementGrant`                        | `EntitlementResolver`         | `/v1/me/entitlements`                | `EntitlementsChanged`              | Paywall/feature gate       |
| Consent             | `Consent` + yeni `PolicyDocument`              | `ConsentService`              | `/v1/consents`                       | `ConsentGranted/Revoked`           | Age/consent settings       |
| Notification        | yeni `NotificationDelivery`                    | `NotificationOrchestrator`    | `/v1/notification-preferences`       | `NotificationRequested/Sent`       | Inbox/preferences          |
| Analytics           | yeni append-only event envelope/warehouse      | `AnalyticsPublisher`          | internal only                        | domain events                      | Product/teacher dashboards |

UI hiçbir kritik gerçeğin source of truth'u değildir. Local state yalnız cache/draft'tır; hak, skor, üyelik ve ödeme sunucudan çözülür.

---

## 49. Event tabanlı noktalar

| Olay                   | Şimdi                           | İleride                           | Gerekçe                                                                               |
| ---------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Signup                 | Sync transaction                | Outbox fan-out                    | User + personal context + consent gate atomik; welcome/analytics async.               |
| Login                  | Sync auth                       | Async audit/risk/analytics        | Token verme gecikmemeli; güvenlik kaydı kaybolmamalı.                                 |
| Exercise completed     | Sync session state + outbox     | Async projections                 | Kullanıcı completion'ı hemen görür; progress/gamification/notification consumer olur. |
| Attempt scored         | Sync scoring + attempt + outbox | Async analytics/gamification      | Anlık feedback sync kalmalı.                                                          |
| Assessment completed   | Sync result commit + outbox     | Async reports/notifications       | Sonuç atomik; ağır analiz async.                                                      |
| Assignment completed   | Sync derived completion marker  | Async teacher report/notification | UI kesin durum alır, fan-out ayrılır.                                                 |
| Streak updated         | Şimdilik sync olabilir          | Event consumer                    | MVP'de ucuz; ölçek ve timezone kuralları büyüyünce projection.                        |
| Badge earned           | Sync küçük kural seti           | Event consumer                    | Duplicate-safe award; bildirim async.                                                 |
| Subscription purchased | Provider doğrulaması sync       | Webhook inbox + async entitlement | Client receipt tek başına güvenilmez.                                                 |
| Subscription renewed   | Webhook driven                  | Queue/inbox                       | Provider retry ve ordering gerekir.                                                   |
| Subscription cancelled | Webhook/API command             | Queue/inbox                       | Cancellation ile entitlement expiry ayrılır.                                          |

Asgari event zarfı: `eventId`, `eventType`, `aggregateType`, `aggregateId`, `tenantId`, `actorUserId`, `occurredAt`, `schemaVersion`, `correlationId`, `causationId`, `payload`. Domain write ve outbox kaydı aynı DB transaction'ında olmalıdır. Consumer'lar inbox/dedupe tablosuyla idempotent olmalıdır.

---

## 50. Geriye dönüş maliyeti

| Kritik eksik                 | Bugün                           | Sonradan maliyet  | Neden / son tarih                                                                                        |
| ---------------------------- | ------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Identity/AuthIdentity ayrımı | Basit email credential          | **VERY HIGH**     | Sosyal hesaplar ve satın alımlar User'a bağlandıktan sonra merge zorlaşır; mobile öncesi.                |
| Tenant data-access boundary  | Schema iyi, enforcement dağınık | **VERY HIGH**     | Her yeni endpoint sızıntı yüzeyini büyütür; dış pilot öncesi.                                            |
| Subscription/entitlement     | Yok                             | **VERY HIGH**     | Yanlış boolean tasarımı store/web/org haklarını kilitler; monetization öncesi.                           |
| Mobile auth/session          | Yok                             | **HIGH**          | Secure storage, rotation ve deep-link social auth sonradan web auth'u kırabilir; app geliştirmeden önce. |
| Content model/localization   | Versioning iyi, locale yok      | **MEDIUM**        | Çekirdek korunabilir; çok dilde içerik çoğalmadan eklenmeli.                                             |
| Progress event/projection    | Best-effort aggregation         | **HIGH**          | Eksik geçmişi onarmak ve algoritma versiyonlamak zorlaşır; öğrenci pilotu öncesi.                        |
| Assessment result lifecycle  | Yarım                           | **HIGH**          | Placement/profile ve raporlar yanlış kaynağa bağlanır; onboarding öncesi.                                |
| Analytics taxonomy           | Yok                             | **HIGH**          | Geçmiş davranış geri üretilemez; beta öncesi event sözlüğü.                                              |
| Consent/age workflow         | Model var                       | **VERY HIGH**     | Minör verisi toplandıktan sonra geriye dönük kanıt üretilemez; signup öncesi.                            |
| Notification architecture    | Yok                             | **MEDIUM**        | Event/outbox varsa sonradan eklemek kolay; push token modeli mobile sırasında.                           |
| UI application split         | Monolith SPA                    | **MEDIUM → HIGH** | Her yeni persona geçişi zorlaştırır; student UX başlamadan.                                              |
| CI/ephemeral DB              | Yok                             | **HIGH**          | Migration ve tenant regressions sürüm sayısıyla büyür; hemen.                                            |

---

## 51. Nihai geliştirme sırası

### F0 — FOUNDATION

- **Amaç:** Güvenli kimlik, tenant sınırı, compliance kapısı ve teslimat güvencesi.
- **Bağımlılık:** Mevcut schema/auth/session çekirdeği.
- **Schema:** `AuthIdentity`, `RefreshSession`, `PolicyDocument`, outbox/inbox; assessment `sessionId`; gerekli migration/backfill.
- **Backend:** Scoped DB gateway, signup/login/recovery, consent/age gate, event publisher, idempotency standardı.
- **Frontend:** UI'ı modüllere ayır; auth/onboarding kabuğu; context switcher iskeleti.
- **Mobile:** Auth contract, universal/deep link ve secure token yaklaşımını sabitle.
- **Test:** Ephemeral Postgres, migration-from-empty, tenant/RBAC/contract/security testleri.
- **Security:** Non-BYPASSRLS runtime role, persistent token rotation, rate limit, secret policy.
- **Rollout:** Shadow auth/session kayıtları, feature flag, iç kullanıcı → küçük pilot; rollback adaptörü.

### F1 — PRODUCT CORE

- **Amaç:** İçerikten güvenilir öğrenme ve assessment sonucuna tam zincir.
- **Bağımlılık:** F0 events ve tenant boundary.
- **Schema:** AssessmentResult-session bağı; scoring/algorithm version; content locale metadata.
- **Backend:** Role-neutral learning API, idempotent completion, assessment orchestration, projection rebuild.
- **Frontend:** Yeni exercise player, feedback/result ve placement ekranları.
- **Mobile:** API DTO cacheability, sync envelope, media prefetch contract.
- **Test:** Soru tipi golden tests, snapshot immutability, completion race/idempotency, placement E2E.
- **Security:** Correct-answer leakage, object authorization, payload/abuse limits.
- **Rollout:** Eski `/admin/exercise-*` adaptörü; dual-read karşılaştırma; kademeli trafik.

### F2 — STUDENT EXPERIENCE

- **Amaç:** İlk 5 dakikada kişisel çalışmaya başlayan anlaşılır öğrenci ürünü.
- **Bağımlılık:** F1 placement/progress.
- **Schema:** Preferences, daily plan/recommendation reason, timezone, notification opt-in.
- **Backend:** Today planner, personal catalog, progress/gamification APIs, rule versions.
- **Frontend:** Signup → onboarding → placement → Today → exercise tek akışı; erişilebilir tasarım sistemi.
- **Mobile:** Native/PWA shell, secure storage, offline attempt queue, conflict resolution.
- **Test:** 13–17 usability, WCAG keyboard/screen reader, low-network/offline, device matrix.
- **Security:** Minor-safe defaults, no dark patterns, device/session management.
- **Rollout:** Analytics funnel + cohort flag; önce 16+, sonra consent doğrulanan yaş grupları.

### F3 — MONETIZATION

- **Amaç:** Free/premium haklarını ödeme sağlayıcısından bağımsız ve doğru yönetmek.
- **Bağımlılık:** F0 identity/events/compliance; F2 ürün değeri.
- **Schema:** Product/Plan/Price/Subscription/Purchase/EntitlementGrant/UsageCounter/WebhookInbox.
- **Backend:** Provider adapters, receipt validation, webhook ordering/retry, entitlement resolver.
- **Frontend:** Paywall, plan yönetimi, cancel/restore, grace/retry mesajları, ad eligibility.
- **Mobile:** StoreKit/Play Billing ve restore; server-side verification.
- **Test:** Sandbox purchase/renew/cancel/refund/restore, duplicate/out-of-order webhook.
- **Security:** Signed webhook, replay defense, server-authoritative entitlement, child ad policy.
- **Rollout:** Internal sandbox → test users → yüzde bazlı; kill switch ve entitlement reconciliation.

### F4 — INSTITUTION

- **Amaç:** Kurumun kendi yöneticisi/öğretmeniyle güvenli self-service kullanımı.
- **Bağımlılık:** F0 RBAC/context; F1 learning; F2 UX.
- **Schema:** Invitation, role-policy, assignment completion projection, report snapshot, org license grant.
- **Backend:** Invite/accept/leave, scoped org admin/teacher API, cohort/assignment reports.
- **Frontend:** Ayrı teacher/org shell, roster, assignment builder, reports, context switch.
- **Mobile:** Öğrenci kurum daveti/deep link; öğretmen için responsive öncelik.
- **Test:** Rol matrisi, cross-class/cross-tenant, ownership transfer, school-year rollover.
- **Security:** Least privilege, export audit, safeguarding and teacher/student boundary.
- **Rollout:** Tek tasarım ortağı kurum → birkaç kurum → self-service.

### F5 — AI / ADVANCED

- **Amaç:** Ölçülebilir pedagojik değer sağlayan güvenli içerik/öneri otomasyonu.
- **Bağımlılık:** Kaliteli content, analytics, assessment ve media pipeline.
- **Schema:** Prompt/model/eval version, provenance, review state, cost/safety metadata.
- **Backend:** Provider-neutral jobs, moderation, human review, recommendation explanation.
- **Frontend:** Content editor review, öğrenciye açıklanabilir öneri; AI etiketi.
- **Mobile:** Ağır üretim yok; yalnız güvenli tüketim ve feedback.
- **Test:** Offline eval set, hallucination/bias/safety, latency/cost budget, regression gate.
- **Security:** PII minimization, vendor DPA/retention, prompt injection isolation.
- **Rollout:** Staff-only → teacher opt-in → kontrollü öğrenci cohort; instant disable.

### F6 — SCALE

- **Amaç:** Çok tenant, yüksek trafik ve operasyonel dayanıklılık.
- **Bağımlılık:** Önceki tüm aşamaların ölçülebilir SLO'ları.
- **Schema:** Partition/archive policy, indexes, warehouse/CDC ve retention jobs.
- **Backend:** Queue autoscaling, caching, read replicas yalnız ölçümle, rate/quota service.
- **Frontend:** CDN, code splitting, performance budgets, localization packs.
- **Mobile:** Incremental sync, background jobs, crash/performance telemetry.
- **Test:** Load/soak/chaos, failover, backup restore, queue replay, data deletion propagation.
- **Security:** Continuous scanning, dependency/SBOM, key rotation, pen test, incident drills.
- **Rollout:** SLO-based capacity gates, canary/blue-green, tested rollback and DR runbooks.

---

## 52. Kullanılabilirlik testi

**Bugünkü sistemle cevap: YOK.**

13–17 yaşındaki ilk kullanıcı uygulamayı kuramaz (native paket yok), kendi hesabını oluşturamaz, yaş/consent akışını tamamlayamaz, kişisel tenant'ını provision edemez, placement sonucunu profile'a yazdıramaz ve “Today” ekranından önerilen ilk çalışmaya ulaşamaz. Hazır admin tarafından oluşturulmuş demo hesabı, tenant ve published template verilirse öğrenci login olup egzersiz açabilir; bu, ilk-kullanım ürün yolculuğu değildir.

Başarı kriteri: median kullanıcı 5 dakika içinde signup/consent/onboarding'i tamamlayıp ilk soruya ulaşmalı; yardım isteme oranı, drop-off, time-to-first-question ve accessibility task completion ölçülmelidir.

---

## 53. Profesyonel ürün kriteri

| Kriter                 | Değerlendirme | Kanıt / açık                                                                                 | Öncelik                 |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------------- | ----------------------- |
| Maintainability        | ⚠️ KISMEN     | Backend modüler; SPA monolith ve doğrudan Prisma kullanımı sınırları zayıflatıyor.           | HIGH                    |
| Scalability            | ⚠️ KISMEN     | Postgres modeli iyi; full recompute, in-memory revoke ve queue/cache yok.                    | HIGH                    |
| Security               | ⚠️ KISMEN     | Scrypt, JWT verify, guards, RLS SQL/test var; enforcement tutarsız, token localStorage'da.   | CRITICAL                |
| Accessibility          | ⚠️ KISMEN     | Bazı semantic/aria öğeleri ve alt text modeli var; otomatik/manual WCAG kanıtı yok.          | HIGH                    |
| Mobile readiness       | ⚠️ KISMEN     | Responsive shell testi ve idempotency alanları var; native auth/offline/push/store yok.      | HIGH                    |
| Observability          | ⚠️ KISMEN     | Structured logs/health var; metrics, traces, alerts, SLO yok.                                | HIGH                    |
| Testability            | ⚠️ KISMEN     | 468 test tanımı ve inject yaklaşımı güçlü; DB otomasyonu yok, bu koşuda paket doğrulanamadı. | HIGH                    |
| Content scalability    | ✅/⚠️         | Version/snapshot güçlü; locale/workflow/search/media pipeline eksik.                         | MEDIUM                  |
| Subscription readiness | ❌ YOK        | Domain ve provider contract yok.                                                             | CRITICAL before revenue |
| Localization           | ❌ YOK        | Locale/translation/UI message catalog yok.                                                   | MEDIUM                  |
| Performance            | ⚠️ KISMEN     | Küçük ürün için yeterli; ölçüm/budget/index query review yok, SPA tek bundle.                | MEDIUM                  |
| Disaster recovery      | ❌ YOK        | Backup/PITR/restore drill/runbook kanıtı yok.                                                | HIGH                    |
| Privacy/compliance     | ⚠️ KISMEN     | Consent/audit/guardian schema var; çalışır lifecycle, retention ve DSAR yok.                 | CRITICAL                |

---

## 54. Son karar

### **B) Kontrollü refactor gerekli**

**Parçalar ve sıra:**

1. Tenant-scoped data access ve auth session/identity sınırı.
2. Consent/age ve transactional outbox.
3. Assessment completion + reliable progress/gamification projections.
4. Öğrenci UI kabuğu ve role-neutral API.
5. Subscription/entitlement bounded context.
6. Kurumsal RBAC/invite/report.
7. Mobile, AI ve scale katmanları.

**Neden C değil:** Domain şeması ve öğrenme çekirdeği doğru yönde; tamamen yeniden tasarım işlevsel kodu ve test yatırımını çöpe atar. Kritik yeniden tasarım yalnız güvenlik boundary ve assessment orchestration gibi dar alanlarda gereklidir.

**Çalışan özellikleri koruma yöntemi:** expand-and-contract migration, additive tablolar, backfill, adapter endpoint'ler, feature flag, dual-write/read comparison, tenant contract testleri, canary rollout ve her aşamada geri dönüş anahtarı. Published content ve geçmiş session/attempt/point ledger kayıtları yerinde tutulmalı; tarihçe rewrite edilmemelidir.

---

## 55. MASTER ROADMAP

Aşama kodları: **F0 Foundation**, **F1 Product Core**, **F2 Student Experience**, **F3 Monetization**, **F4 Institution**, **F5 AI/Advanced**, **F6 Scale**.

| Alan              | Şu an                               | Hedef                                      | Karar           | Aşama         |
| ----------------- | ----------------------------------- | ------------------------------------------ | --------------- | ------------- |
| Identity          | `User` profil+credential            | User + AuthIdentity + lifecycle            | REFACTOR        | F0            |
| Social Login      | Yok                                 | Apple/Google account linking               | EKSİK           | F0/F2         |
| Personal Account  | Schema ile mümkün                   | Atomic self-service provisioning           | REFACTOR        | F0/F2         |
| Organization      | Güçlü schema, platform CRUD         | Tenant self-service + scoped RBAC          | REFACTOR        | F4            |
| Context Switching | Header/tenant seçimi teknik         | Açık, güvenli personal/org switcher        | REFACTOR        | F0/F2         |
| Onboarding        | Yok                                 | Age-safe goal/preferences flow             | EKSİK           | F2            |
| Placement         | Model/start var, result zinciri yok | Result + level/profile update              | YENİDEN TASARLA | F1            |
| Personal Learning | Manuel session                      | Today/recommendation plan                  | REFACTOR        | F1/F2         |
| Exercise          | Çalışan versioned session           | Role-neutral, offline-ready motor          | KORU            | F1/F2         |
| Assignment        | CRUD + student start                | Completion/report/notification             | REFACTOR        | F4            |
| Assessment        | CRUD/start/result read              | Tam assessment lifecycle                   | YENİDEN TASARLA | F1            |
| Progress          | Best-effort weekly projection       | Reliable versioned mastery projection      | REFACTOR        | F0/F1         |
| Gamification      | Point/streak/3 badge MVP            | Event-driven rule engine                   | REFACTOR        | F2            |
| Subscription      | Yok                                 | Provider-neutral lifecycle                 | EKSİK           | F3            |
| Ads               | Yok                                 | Minor/consent/entitlement-safe policy      | EKSİK           | F3            |
| Premium           | Yok                                 | Server-authoritative entitlement           | EKSİK           | F3            |
| Notifications     | Yok                                 | Preference + push/email/in-app             | EKSİK           | F2/F4         |
| Media             | Metadata/link var                   | Upload/scan/transform/CDN                  | REFACTOR        | F1/F6         |
| AI                | Job/alan taslağı                    | Evaluated, safe async platform             | REFACTOR        | F5            |
| Teacher Dashboard | Admin CRUD var                      | Scoped roster/assignment/report app        | REFACTOR        | F4            |
| Analytics         | Operasyonel veri var                | Versioned taxonomy + warehouse             | EKSİK           | F0/F2/F6      |
| Audit             | Model/RLS var                       | Her kritik command + query/export UI       | REFACTOR        | F0/F4         |
| Compliance        | Temel modeller var                  | Consent/guardian/DSAR/retention            | REFACTOR        | F0            |
| Mobile            | Responsive web shell                | Native/PWA + secure offline/push           | EKSİK           | F2/F3         |
| Offline           | Idempotency alanları var            | Queue/sync/conflict/recovery               | REFACTOR        | F2            |
| API               | Fastify JSON, admin-named yollar    | Versioned OpenAPI, role-neutral contracts  | REFACTOR        | F0/F1         |
| Security          | Guards + RLS taslağı                | Enforced scoped DB + hardened sessions     | YENİDEN TASARLA | F0            |
| Infrastructure    | Node/Postgres/log/health            | Queue/cache/telemetry/secrets/DR           | REFACTOR        | F0/F6         |
| CI/CD             | Yok                                 | Reproducible build, DB tests, canary       | EKSİK           | F0            |
| Documentation     | Kod yorumları/manual SQL            | ADR, OpenAPI, runbooks, data/event catalog | REFACTOR        | F0 ve sürekli |

## İlk 90 gün için çıkış kapıları

- **Gün 0–30:** F0 schema ADR'ları; scoped DB proof; ephemeral PostgreSQL CI; mevcut 468 testin yeşil baseline'ı; auth/session ve outbox migration tasarımı.
- **Gün 31–60:** Assessment completion/result; reliable progress/gamification; role-neutral learning API; OpenAPI contract; consent/age prototipi.
- **Gün 61–90:** Signup + personal context + onboarding + placement + Today dikey dilimi; 13–17 kullanıcı testi; küçük kapalı pilot.

Monetization, kurum self-service veya AI çalışması bu çıkış kapıları tamamlanmadan ana geliştirme hattına alınmamalıdır.
