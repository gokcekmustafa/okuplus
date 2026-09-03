# OKU+ — 8G-10 Pilot Readiness Foundation

Tarih: 2026-09-02  
Kapsam: local/TEST pilot hazırlığı  
Production DB erişimi: **YOK**  
Production write: **NO**  
Gerçek öğrenci pilotu: **Başlatılmadı**

## 1. Karar ve sınırlar

8G-10, mevcut signup → onboarding → öğrenme yolu → bugün → egzersiz → soru → tamamlanma → XP/streak → progress/review akışının pilot gözlemlenebilirliği ile feedback ve bug-report girişlerini hazırlar. Uygulama yalnızca TEST/local hedefinde doğrulanmıştır.

Bu aşamada yapılmayanlar:

- Production DB discovery, production write veya promotion.
- Gerçek production Level/Skill kodu, Level→Skill relation'ı veya Content→Level relation'ı icadı.
- Harici analytics platformu, büyük dashboard, crash vendor veya gerçek kullanıcı verisi aktarımı.
- 8G-9B catalog blocker'ının çözülmesi.

## 2. Mevcut altyapı audit'i

| Soru                                        | Repository bulgusu                                                                                   | 8G-10 kararı                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A — Temel learning event'leri izleniyor mu? | ExerciseSession, Attempt, StudentProgress, PointEvent, StudentStreak ve UI/domain route'ları mevcut. | PilotEvent ile standart event sözleşmesi eklendi.                            |
| B — Exercise başlangıcı                     | `ExerciseSession.startedAt` ve session start route'u mevcut.                                         | `EXERCISE_STARTED`.                                                          |
| C — Exercise completion                     | `ExerciseSession.completedAt/status` mevcut; completion gamification'a bağlanıyor.                   | `EXERCISE_COMPLETED`.                                                        |
| D — Question attempt                        | `Attempt` immutable ve `answeredAt` taşıyor.                                                         | `QUESTION_ATTEMPTED` / `QUESTION_ANSWERED`.                                  |
| E — Correct/incorrect                       | `Attempt.isCorrect` ve `rawScore` mevcut.                                                            | Ham cevap telemetriye taşınmadan KPI'da okunur.                              |
| F — Abandon/resume                          | Session status'ları ve today resume akışı mevcut.                                                    | `EXERCISE_ABANDONED` / `EXERCISE_RESUMED`.                                   |
| G — Onboarding completion                   | `StudentProfile.onboardingCompletedAt` mevcut.                                                       | Core source of truth korunur; ayrıca onboarding event'i kabul edilir.        |
| H — Daily activity                          | PointEvent daily login, session/attempt tarihleri mevcut.                                            | Pilot event tarihleriyle active days hesaplanır.                             |
| I — Streak davranışı                        | `StudentStreak` ve gamification servisleri mevcut.                                                   | KPI için açık `STREAK_STARTED` / `STREAK_CONTINUED` event'leri kabul edilir. |
| J — Teknik hata/crash                       | Genel error handler log üretir; kalıcı pilot teknik olay deposu yoktu.                               | Stack/IP/device saklamayan `TECHNICAL_ERROR` event'i eklendi.                |

## 3. Pilot telemetry sözleşmesi

Yeni tablo `PilotEvent` append-only servis kuralına sahiptir. Public route yalnızca izinli event adlarını, client idempotency anahtarını ve isteğe bağlı sahipliği doğrulanmış session/question context'ini kabul eder.

İzinli event'ler:

`SIGNUP_COMPLETED`, `ONBOARDING_STARTED`, `ONBOARDING_COMPLETED`, `LEARNING_PATH_OPENED`, `TODAY_OPENED`, `EXERCISE_STARTED`, `QUESTION_VIEWED`, `QUESTION_ATTEMPTED`, `QUESTION_ANSWERED`, `EXERCISE_COMPLETED`, `EXERCISE_ABANDONED`, `EXERCISE_RESUMED`, `ASSESSMENT_STARTED`, `ASSESSMENT_COMPLETED`, `REVIEW_STARTED`, `REVIEW_COMPLETED`, `STREAK_STARTED`, `STREAK_CONTINUED`, `TECHNICAL_ERROR`.

API yüzeyi:

- `POST /student/pilot/events`
- `GET /admin/pilot/metrics`

Event payload alanları:

- `eventType`: allowlist enum.
- `clientEventId`: 1–128 karakter; `(tenantId, studentId, clientEventId)` unique.
- İsteğe bağlı `sessionId` ve `questionVersionId`; mevcut student/tenant ownership ile doğrulanır.

Event payload'ında arbitrary `metadata`, raw answer, answer text, stack trace, IP veya device fingerprint alanı yoktur. Aynı client id ile aynı event tekrar gönderilirse kayıt çoğalmaz; farklı event type kullanılırsa `409 CONFLICT` döner.

## 4. KPI tanımları

Metrics endpoint varsayılan olarak son 30 UTC günü döndürür. Platform admin aggregate, tenant scope ise tenant filtresi kullanır. Payda yoksa oran `null` döner; veri yoksa `dataStatus = NO_PILOT_DATA`, veri varken `PILOT_DATA_ONLY` döner. Bu sonuçlar başarı iddiası değildir.

| Alan                             | Tanım / kaynak                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Signup completion                | `SIGNUP_COMPLETED` event adedi.                                                                     |
| Onboarding completion            | Pencerede `StudentProfile.onboardingCompletedAt` bulunan öğrenci adedi.                             |
| First exercise started/completed | İlgili event'i gönderen unique öğrenci adedi.                                                       |
| Sessions/user                    | Penceredeki `ExerciseSession` start kayıtları / telemetry active student.                           |
| Exercises/user                   | `EXERCISE_COMPLETED` / telemetry active student.                                                    |
| Questions/user                   | `QUESTION_ATTEMPTED` / telemetry active student; toplam `questions` da döner.                       |
| Active days                      | Unique `(studentId, UTC calendar day)` çiftleri.                                                    |
| Accuracy                         | `Attempt.isCorrect = true` / `isCorrect != null` kayıtları.                                         |
| Completion rate                  | `EXERCISE_COMPLETED` / `EXERCISE_STARTED`.                                                          |
| Retry rate                       | Aynı session + question version için ilk kayıttan sonraki Attempt'ler / tüm Attempt'ler.            |
| Review usage                     | `REVIEW_STARTED` event adedi.                                                                       |
| D1/D7/D14                        | İlk görülen telemetry gününden tam 1/7/14 gün sonraki active day'e dönen unique öğrenci oranı.      |
| Streak start/continuation        | Explicit `STREAK_STARTED` / `STREAK_CONTINUED` event adedi. `StudentStreak` mevcut ürün state'idir. |
| Resume rate                      | `EXERCISE_RESUMED` / `EXERCISE_STARTED`.                                                            |
| Abandonment                      | `EXERCISE_ABANDONED` event adedi.                                                                   |
| Technical error rate             | `TECHNICAL_ERROR` / tüm pilot event'ler. Stack veya raw error saklanmaz.                            |
| Feedback / bug count             | Son 30 gündeki `PilotFeedback` ve `PilotBugReport` kayıt adedi.                                     |

## 5. Feedback ve bug report

Kısa feedback route'u `POST /student/pilot/feedback` adresindedir. Kategoriler: `CONTENT_CLARITY`, `QUESTION_CLARITY`, `DIFFICULTY`, `GENERAL_SATISFACTION`. `rating` 1–5, `message` en fazla 1000 karakterdir. `clientFeedbackId` ile idempotency sağlanır.

Bug route'u `POST /student/pilot/bug-reports` adresindedir. Kategoriler: `BUG`, `CONTENT_ISSUE`, `WRONG_ANSWER`, `UNCLEAR_QUESTION`, `TECHNICAL_ERROR`. `description` 1–2000 karakterdir; ilk durum `OPEN` olur. `clientBugId` ile idempotency sağlanır.

Admin görünümü büyük bir panel olarak eklenmedi; yalnızca aşağıdaki read-only rapor uçları vardır:

- `GET /admin/pilot/reports?kind=feedback&limit=50`
- `GET /admin/pilot/reports?kind=bug&limit=50`

Raporlarda e-posta ve display name dönmez; student ID, sınırlı context ID'leri ve rapor metni döner. Öğrenci bu admin uçlarına erişemez.

## 6. Pilot access control

`PILOT_MODE` varsayılan olarak `off`'tur. `PILOT_MODE=on` yalnızca non-production process'te pilot student route'larını açar. `PILOT_STUDENT_ACCESS`, virgülle ayrılmış user ID veya e-posta allowlist'idir. Liste boşsa local/TEST'te tüm normal öğrenci hesapları erişebilir; gerçek pilot için liste açıkça doldurulmalıdır. Platform hesapları pilot student uçlarından reddedilir.

Production process'te `PILOT_MODE=on` olsa bile guard erişimi reddeder. Bu, deployment sistemi bilinmediği için environment'a bağlı güvenli varsayımdır; production açılışının yerine geçmez.

## 7. Privacy ve data minimization

Pilot tabloları yalnızca tenant/student sahipliği, event tipi, idempotency anahtarı, zaman ve gerekirse session/question referansı taşır. Yeni schema'ya IP, user-agent, cihaz fingerprint'i, raw answer veya raw stack trace eklenmedi. Feedback ve bug metni bounded free text'tir; pilot UI/operasyon kuralı kullanıcıdan cevap metni, parola veya başka kişisel veri istememelidir.

`AuditLog` mevcut genel denetim kaydı olarak korunmuştur; pilot telemetry'nin yerine kullanılmamıştır. `PointEvent`, `StudentStreak`, `ExerciseSession`, `Attempt` ve `StudentProfile` ürün davranışının mevcut canonical kaynaklarıdır.

## 8. Tenant ve student isolation

- Student event/feedback/bug yazımı aktif `STUDENT` membership ve authenticated tenant context olmadan yapılamaz.
- Session context'i aynı tenant ve aynı öğrenciye ait değilse reddedilir; question context'i session template ilişkisiyle doğrulanır.
- Pilot kayıtlarının unique anahtarları tenant + student kapsamındadır; iki öğrenci aynı client id'yi kullansa da birbirinin kaydını replay edemez.
- Yeni pilot tablolarına TEST DB'de RLS read/insert politikaları uygulandı. Platform role tüm tenant'ları denetleyebilir; normal context yalnız kendi tenant'ını görür.
- Student route'ları admin metrics/reports'a bağlı değildir. Başka öğrencinin progress/gamification verisini okuyan yeni route eklenmedi.
- Mevcut session, progress, PointEvent, StudentStreak ve gamification cross-user/cross-tenant testleri regression paketiyle tekrar geçti.

## 9. TEST-only pilot senaryosu

`test/pilot-readiness.test.ts` gerçek production kullanıcısı kullanmaz; her koşuda local TEST DB'de run-unique tenant/user kimlikleri oluşturur ve hedefli cleanup yapar. Senaryonun pilot yüzü:

signup/login → tenant-bound student access → telemetry event → feedback → bug report → admin metrics/report → duplicate replay → invalid/raw-answer rejection → access off guard.

Mevcut browser regression ayrıca signup/login → onboarding → goal/level → learning path → today → exercise → question → completion → XP → streak → progress → review zincirini gerçek HTTP/DB ile doğrular.

## 10. Migration ve uygulama değişiklikleri

Additive değişiklikler:

- `prisma/schema.prisma`: pilot enum/model'leri.
- `prisma/migrations/20260902090000_add_pilot_readiness_foundation/migration.sql`: PilotEvent, PilotFeedback, PilotBugReport tabloları ve unique/index/FK'ler.
- `prisma/migrations/20260902093000_add_pilot_rls_policies/migration.sql`: üç yeni tablo için RLS read/insert politikaları.
- `prisma/migrations/20260902094000_add_pilot_streak_events/migration.sql`: iki habit event enum değeri.
- `src/modules/pilot/*`: access, schema, service, route contract.
- `src/config/env.ts` ve `.env.example`: local/TEST pilot flag açıklamaları.

Uygulama sırasında `prisma migrate dev` mevcut migration checksum farkı nedeniyle reset önermiş, reset çalıştırılmamıştır. Migration'lar yalnızca `prisma migrate deploy` ile TEST DB'ye uygulanmış ve mevcut veri resetlenmemiştir.

## 11. Known limitations ve production bağımlılıkları

- Gerçek pilot başlatılmadı; gerçek kullanıcı KPI değeri yoktur.
- Pilot event'leri bu aşamada client contract üzerinden alınır; harici analytics gönderimi ve otomatik crash collector yoktur.
- Büyük admin dashboard yerine read-only metrics/report API'si vardır.
- Production deployment/secret/allowlist/retention/consent operasyonu henüz tanımlı değildir.
- Production Level ve Skill sözlüğü, Level→Skill relation'ı, Content→Level relation'ı ve production DB fingerprint'i bilinmemektedir. 8G-9B blocker açık kalır.
- 8G-8 production promotion blocker açık kalır.

Gerçek pilot öncesi gerekli dış bağımlılıklar: production DB kimliğinin doğrulanması, gerçek catalog sahipliği ve relation kararı, pilot öğrenci allowlist'i, KVKK/consent ve retention kararı, production observability alert'leri, rollback/runbook ve production browser smoke onayıdır.

## 12. Doğrulama komutları

Tüm curriculum QA komutları explicit local TEST URL ile çalıştırılmalıdır; `DATABASE_URL` fallback'i kullanılmamalıdır.

```powershell
$env:CURRICULUM_PACK_QA_ENVIRONMENT = "TEST"
$env:CURRICULUM_PACK_QA_DATABASE_URL = "<explicit local oku_plus_test URL>"
npm run qa:curriculum-pack       # PASS / TEST_READ_ONLY
npm run qa:curriculum-catalog    # BLOCKED beklenir; production catalog yok
npm run qa:curriculum-fixtures   # PASS / TEST_FIXTURE_READ_ONLY
npm test -- --reporter=dot
npm run lint
npm run format:check
npm run typecheck
npm run build
npx prisma migrate status
```

Bu dokümandaki PASS sonuçları teknik foundation/readiness sonucudur; production pilot approval veya production catalog doğrulaması değildir.
